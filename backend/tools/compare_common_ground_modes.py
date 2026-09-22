"""Private, local comparison of common-ground modes from saved aggregate evidence.

No database, publication, transcript access, or changes to application settings.
Four calls maximum: two repeats per mode with the identical complete evidence.
"""
import argparse
import asyncio
from copy import deepcopy
import html
import json
import os
from pathlib import Path
import time

from dotenv import dotenv_values
from openai import OpenAI

from backend.app.analysis import AnalysisService, build_common_ground_system_prompt
from backend.app.model_routing import model_request
from backend.app.opinion_themes import capture_group_profiles
from backend.tools.compare_report_models import digest, source_hashes, write_json


LABELS = {'policy': 'Policy · mediation and directions', 'generic': 'Generic · shared points and questions'}

def render(dest):
    bundle = json.loads((dest / 'bundle.json').read_text())
    labels = bundle.get('labels', LABELS)
    esc = lambda value: html.escape(str(value))
    page = ['''<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Common ground · generic vs policy</title><style>
body{margin:0;background:#f7f7f7;color:#242426;font:17px/1.65 system-ui}main{max-width:1440px;margin:auto;padding:32px}
h1,h2,h3{line-height:1.3}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:20px}article{background:white;border-radius:16px;padding:24px;min-width:0}blockquote{margin:20px 0;font-size:20px}li{margin-bottom:10px}ul{padding-left:22px}small{color:#606066}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}summary{cursor:pointer}details{margin-top:20px}@media(max-width:850px){main{padding:20px}.grid{grid-template-columns:1fr}}
</style><main><h1>哪一種方式更適合這次討論？</h1>''',
            f'<p>{esc(bundle["topic"])}</p>',
            '<p>'+esc(bundle.get('intro', 'Identical complete evidence, group profiles, language and model settings. Two runs per mode. Only the mode instructions and output structures differ. All outputs are local drafts.'))+'</p>']
    notes = dest / 'review-notes.json'
    if notes.exists():
        page.append('<details><summary>Review findings</summary>' + ''.join(f'<p>{esc(n)}</p>' for n in json.loads(notes.read_text())) + '</details>')
    fields = [('recommendations','方案方向'),('essentialConditions','條件'),('tradeoffs','權衡'),('unresolvedQuestions','待釐清'),('commonGround','共同支持'),('divides','分歧'),('bridgingProposal','銜接建議'),('insights','觀察')]
    for repeat in range(2):
        page.append(f'<h2>Run {repeat+1}</h2><div class="grid">')
        for arm, label in labels.items():
            path = dest / f'{arm}-{repeat}.json'
            result = json.loads(path.read_text()) if path.exists() else {}
            raw = result.get('raw') or {}
            page.append(f'<article><h3>{label}</h3><blockquote>{esc(raw.get("groupStatement", result.get("status", "Pending")))}</blockquote>')
            for key, title in fields:
                values = raw.get(key)
                if not values: continue
                if isinstance(values, str): values = [values]
                edits = (result.get('displayLists') or {}).get(key)
                if edits is not None:
                    if len(edits) != len(values):
                        raise ValueError('Edited bullets must preserve the original evidence mapping')
                    page.append(f'<h4>{title}</h4><ul>'+''.join(
                        f'<li>{esc(text)}</li>' for text in edits)+'</ul>')
                else:
                    page.append(f'<h4>{title}</h4><ul>'+''.join(f'<li>{esc(v.get("text", "") if isinstance(v, dict) else v)}</li>' for v in values)+'</ul>')
            page.append(f'<small>{esc(result.get("status", "pending"))} · {esc(result.get("seconds", "—"))}s</small>')
            page.append('<details><summary>Group descriptions and raw result</summary><pre>'+esc(json.dumps(raw,ensure_ascii=False,indent=2))+'</pre></details></article>')
        page.append('</div>')
    page.append('<details><summary>Exact model inputs</summary><pre>'+esc(json.dumps(bundle['requests'],ensure_ascii=False,indent=2))+'</pre></details></main></html>')
    (dest / 'index.html').write_text(''.join(page))


async def run(args):
    os.umask(0o077)
    dest = args.output
    dest.mkdir(mode=0o700, parents=True, exist_ok=False)
    source = json.loads(args.input.read_text())
    report = json.loads(args.report.read_text())
    policy = deepcopy(source['evidence'])
    assert policy['opinionSourceHash'] == report['opinionLandscape']['sourceHash']
    topic, language = report['meta']['topic'], report['sourceLanguage']
    policy['groupProfiles'] = capture_group_profiles(report['opinionLandscape'], language, topic)
    policy['previousFeedback'] = []
    service = AnalysisService.__new__(AnalysisService)
    message = service._common_ground_user_message(policy, topic)
    messages = {arm: message for arm in LABELS}
    requests = {arm: {**model_request('common-ground'), 'response_format': {'type':'json_object'},
        'messages': [{'role':'system','content':build_common_ground_system_prompt('policy' if arm == 'policy' else 'generic',language)},
                     {'role':'user','content':message}]} for arm,message in messages.items()}
    write_json(dest/'bundle.json', {'topic':topic,'requests':requests,'sourceHashes':source_hashes(),
                                  'inputHash':digest(source),'reportHash':digest(report),'evidenceHash':digest(message)})
    render(dest)
    key = dotenv_values(args.key_file).get('OPENAI_API_KEY')
    if not key: raise ValueError('Missing explicit experiment key')
    client = OpenAI(api_key=key,base_url='https://api.openai.com/v1',max_retries=0,timeout=90)
    semaphore = asyncio.Semaphore(3)
    async def one(arm, repeat):
        async with semaphore:
            path = dest/f'{arm}-{repeat}.json'
            write_json(path, {'status':'started','requestHash':digest(requests[arm])})
            start = time.monotonic()
            result = {'requestHash':digest(requests[arm])}
            try:
                response = await asyncio.to_thread(client.chat.completions.create, **requests[arm])
                result['response'] = response.model_dump()
                choice = response.choices[0]
                if choice.finish_reason != 'stop' or getattr(choice.message,'refusal',None):
                    result['status'] = 'incomplete'
                else:
                    raw = json.loads(choice.message.content)
                    result['raw'] = raw
                    mode = 'policy' if arm == 'policy' else 'generic'
                    result['normalized'] = service._normalize_common_ground(raw, mode, policy, validate=True,language=language)
                    result['status'] = 'accepted' if result['normalized'] else 'rejected'
            except Exception as exc:
                result.update(status='error',errorType=type(exc).__name__)
            result['seconds'] = round(time.monotonic()-start,2)
            write_json(path,result); render(dest)
            print(f'{arm} {repeat+1}: {result["status"]}',flush=True)
    try:
        await asyncio.gather(*(one(arm, repeat) for repeat in range(2) for arm in LABELS))
    finally:
        client.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',type=Path,required=True)
    parser.add_argument('--report',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--key-file',type=Path,required=True)
    asyncio.run(run(parser.parse_args()))
