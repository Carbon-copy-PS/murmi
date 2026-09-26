"""Compare a pinned old selector and current selector with identical model routing.

Private output only: fixture/recorded text and generated cards are included.
Run: python -m backend.tools.compare_argument_flow --baseline-ref COMMIT
  --env-file .env.model-experiments --output outputs/comparison.json
Optional --recorded PATH replays an anonymized export's selected transcript entries.
Scheduling is simulated; model latency is measured. It excludes transcription,
network delivery to the browser, and host approval time.
"""
import argparse
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

from dotenv import dotenv_values
from backend.app.analysis import AnalysisService
from backend.app.model_routing import model_request


def baseline_service(ref):
    source = subprocess.check_output(
        ['git', 'show', f'{ref}:backend/app/analysis.py'], text=True)
    with tempfile.NamedTemporaryFile(suffix='.py', mode='w') as file:
        file.write(source)
        file.flush()
        spec = importlib.util.spec_from_file_location('backend.app._comparison_baseline', file.name)
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
    return module.AnalysisService()


async def replay(service, events, *, candidate, topic=None, language='en', existing=None, initial_context=None):
    # Replay caption arrivals and the serial model worker on a virtual clock.
    transcript, pending, cards, batches = {}, {}, list(existing or []), []
    for e in initial_context or []:
        transcript[e['id']] = {**e,'analyzedText':e['text'],'deferred':False}
    index, clock, first, last = 0, 0.0, None, None
    idle, minimum, maximum = (4, 3, 10) if candidate else (8, 15, 30)

    def arrival(event):
        nonlocal first, last
        if not pending:
            first = event['at']
        last = event['at']
        entry = transcript.setdefault(event['id'], {'id':event['id'], 'speaker':event['speaker'],
            'text':'', 'analyzedText':'', 'deferred':False})
        entry['text'] = event['text']  # cumulative, matching production merged entries
        pending[event['id']] = entry
    while index < len(events) or pending:
        if not pending:
            clock = max(clock, events[index]['at'])
            arrival(events[index])
            index += 1
        deadline = min(first + maximum, max(first + minimum, last + idle))
        start = max(clock, deadline)
        while index < len(events) and events[index]['at'] <= start:
            arrival(events[index])
            index += 1
            deadline = min(first + maximum, max(first + minimum, last + idle))
            start = max(clock, deadline)
        selected_ids = set(pending)
        if candidate:
            selected_ids.update(e['id'] for e in list(transcript.values())[-12:] if e['deferred'])
        snapshot = [dict(e) for e in transcript.values() if e['id'] in selected_ids]
        pending.clear()
        contributions = []
        for e in snapshot:
            suffix = e['text'][len(e['analyzedText']):].strip() if e['text'].startswith(e['analyzedText']) else e['text']
            if suffix:
                contributions.append({'id':e['id'],'speaker':e['speaker'],'text':e['text'],'newText':suffix})
        first_index = next((i for i,e in enumerate(transcript.values()) if e['id'] in selected_ids),0)
        context = [{'speaker':e['speaker'],'text':e['text']}
                   for e in list(transcript.values())[max(0,first_index-8):first_index]]
        if candidate:
            last_index = max(i for i,e in enumerate(transcript.values()) if e['id'] in selected_ids)
            context = [{'speaker':e['speaker'],'text':e['text']} for e in
                list(transcript.values())[:last_index+1] if e['id'] not in selected_ids][-8:]
        before = time.monotonic()
        result = await service.extract_arguments(contributions, context, cards, topic=topic, language=language)
        latency = time.monotonic() - before
        if result is None:
            raise RuntimeError('Provider/validation failure: comparison incomplete; no silent success')
        arguments = result['arguments'] if candidate else result
        deferred = set(result['deferredSourceIds']) if candidate else set()
        cards.extend(a['text'] for a in arguments)
        batches.append({'startedAt':start, 'queueWaitFromFirstCaption':start-first,
            'modelSeconds':round(latency,3), 'readyAt':start+latency,
            'contributions':contributions, 'arguments':arguments,'deferredSourceIds':sorted(deferred)})
        for e in snapshot:
            transcript[e['id']]['deferred'] = e['id'] in deferred
            if e['id'] not in deferred:
                transcript[e['id']]['analyzedText'] = e['text']
        clock = start + latency
        # Captions arriving during a request were queued, not postponed until its end.
        while index < len(events) and events[index]['at'] <= clock:
            arrival(events[index])
            index += 1
    return {'cards':cards[len(existing or []):], 'batches':batches,
            'requests':len(batches), 'deferredAtEnd':[e['id'] for e in transcript.values() if e['deferred']]}


async def run(args):
    os.umask(0o077)
    os.environ.update({k:v for k,v in dotenv_values(args.env_file).items() if v is not None})
    if not os.environ.get('OPENAI_API_KEY'):
        raise RuntimeError('A real API key is required')
    old, new = baseline_service(args.baseline_ref), AnalysisService()
    samples = json.loads(Path('backend/tests/fixtures/argument-selection.json').read_text())
    samples += json.loads(Path('backend/tests/fixtures/argument-flow.json').read_text())
    results = []
    gate = asyncio.Semaphore(2)
    async def one(sample):
        async with gate:
            events = sample.get('events')
            if events:
                baseline = await replay(old,events,candidate=False,topic=sample['topic'],language=sample['language'],initial_context=sample.get('initialContext'))
                candidate = await replay(new,events,candidate=True,topic=sample['topic'],language=sample['language'],initial_context=sample.get('initialContext'))
            else:
                async def call(service,candidate):
                    before = time.monotonic()
                    result = await service.extract_arguments(sample['contributions'],sample['context'],
                        sample['existingCards'],topic=sample['topic'],language=sample['language'])
                    if result is None:
                        raise RuntimeError('Provider/validation failure: comparison incomplete')
                    return {'selection':result,'modelSeconds':round(time.monotonic()-before,3)}
                baseline, candidate = await asyncio.gather(call(old,False),call(new,True))
            print(sample['id'] + ': complete',flush=True)
            return {'sample':sample,'baseline':baseline,'candidate':candidate}
    results = await asyncio.gather(*(one(s) for s in samples))
    if args.recorded:
        data = json.loads(Path(args.recorded).read_text())
        # Bounded excerpt selected by entry index, recorded explicitly for repeatability.
        entries = data['entries'][args.start_entry:args.end_entry]
        events = []
        for entry in entries:
            text = ''
            for item in entry['transcriptionItems']:
                text = (text + ' ' + item['text']).strip()
                events.append({'id':entry['id'],'speaker':entry['speaker'],'text':text,'at':item['receivedAt']})
        events.sort(key=lambda e:e['at'])
        origin = events[0]['at']
        for e in events: e['at'] -= origin
        sample = {'id':'recorded-excerpt','kind':'recorded','topic':data['topic'],'language':data['language'],'events':events,
            'initialContext':data['entries'][max(0,args.start_entry-8):args.start_entry]}
        results.append(await one(sample))
    output = {'baselineRef':args.baseline_ref, 'request':model_request('extraction'),
              'timing':'Virtual caption scheduling plus measured API latency; no transcription or host approval delay.',
              'recordedEntryRange':[args.start_entry,args.end_entry], 'results':results}
    Path(args.output).parent.mkdir(parents=True,exist_ok=True)
    Path(args.output).write_text(json.dumps(output,ensure_ascii=False,indent=2))


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--baseline-ref',required=True)
    p.add_argument('--env-file',required=True)
    p.add_argument('--output',required=True)
    p.add_argument('--recorded')
    p.add_argument('--start-entry',type=int,default=28)
    p.add_argument('--end-entry',type=int,default=34)
    asyncio.run(run(p.parse_args()))
