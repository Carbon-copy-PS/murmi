"""Compare fragment-by-fragment extraction with contextual selection using real API calls.

Run with OPENAI_API_KEY set, from the repository root:
python -m backend.tools.evaluate_argument_selection manifest.json --output results.json
The baseline simulates a pause long enough to trigger extraction after each fragment.
Fixture review notes are human expectations, not model inputs or automatic accuracy scores.
"""
import argparse
import asyncio
import json
from pathlib import Path

from backend.app.analysis import AnalysisService
from backend.app.model_routing import MODELS


async def evaluate(sample):
    if sample.get('kind') not in ('synthetic', 'recorded'):
        raise ValueError('Each fixture must state whether it is synthetic or recorded')
    service = AnalysisService()
    if service._mock:
        raise RuntimeError('This evaluation needs a real API key; mock output is not evidence')
    service._client = service.client.with_options(timeout=20, max_retries=0)
    old = []
    for entry in sample['contributions']:
        old.extend(await service.extract_turn_statement(
            {'speaker': entry['speaker'], 'text': entry['newText']},
            sample['existingCards'] + old, topic=sample['topic'], language=sample['language']))
    new = await service.extract_arguments(sample['contributions'], sample['context'],
        sample['existingCards'], topic=sample['topic'], language=sample['language'])
    return {**sample, 'baselineCards': old, 'contextualCards': new,
            'baselineCount': len(old), 'contextualCount': len(new['arguments']) if new is not None else None}


async def run(manifest, output):
    samples = json.loads(Path(manifest).read_text())
    gate = asyncio.Semaphore(2)
    async def one(sample):
        async with gate:
            result = await evaluate(sample)
            print(f"{result['id']}: {result['baselineCount']} → {result['contextualCount']}", flush=True)
            return result
    results = await asyncio.gather(*(one(sample) for sample in samples))
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    Path(output).write_text(json.dumps({'model':MODELS['extraction'], 'realProvider':True,
        'baseline':'one request per supplied newText fragment',
        'candidate':'one request per complete supplied window', 'results':results}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    asyncio.run(run(args.manifest, args.output))
