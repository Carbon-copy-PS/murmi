"""Generate private report drafts through shared profiles and the configured models.

No database or publication. Optional real inputs must be an explicit aggregate
evidence file plus its matching draft report. Synthetic fixtures contain no people.
"""
import argparse
import asyncio
from copy import deepcopy
import json
import os
from pathlib import Path
from types import SimpleNamespace

from dotenv import dotenv_values
import httpx
from openai import OpenAI

from backend.app.analysis import AnalysisService, CG_PROMPT_VERSION
from backend.app.opinion_themes import OpinionThemeService, capture_group_profiles, restore_group_profiles
from backend.app.policy_evidence import build_policy_evidence
from backend.app.reporting import build_opinion_landscape, build_report_snapshot, freeze_report_source, narrative_evidence
from backend.app.report_contract import REPORT_NARRATIVE_VERSION
from backend.tools.compare_report_models import source_hashes, write_json
from backend.tools.model_experiment_fixtures import scenarios


async def generate(dest, key_file, report_file=None, evidence_file=None, mode="policy", selected=None):
    if dest.exists():
        raise ValueError('Choose a fresh output directory to retain previous results.')
    key = dotenv_values(key_file).get('OPENAI_API_KEY')
    if not key:
        raise ValueError('Configure the explicit local key file first.')
    os.umask(0o077)
    dest.mkdir(parents=True, mode=0o700)
    cases = []
    if report_file and evidence_file:
        report, policy = json.loads(report_file.read_text()), json.loads(evidence_file.read_text())
        if report.get('status') != 'draft_ready' or not policy.get('opinionSourceHash') or policy['opinionSourceHash'] != report['opinionLandscape']['sourceHash']:
            raise ValueError('Use a local draft and evidence from the same grouping snapshot.')
        context = SimpleNamespace(id='private-session-preview', topic=report['meta']['topic'], language=report['sourceLanguage'])
        cases.append(('session', context, report, policy))
    for fixture in scenarios():
        if fixture['id'] not in (selected or ('traffic', 'library-zh', 'no-votes', 'incompatible-support')):
            continue
        source = freeze_report_source(fixture['session'])
        # Exercise a first package on these fictional ballots. Preservation of
        # existing approved packages is separately tested in integration tests.
        source.common_ground_history = []
        report = build_report_snapshot(source, 1)
        report['opinionLandscape'] = await build_opinion_landscape(source)
        cases.append((fixture['id'], source, report, build_policy_evidence(source, report['opinionLandscape'])))

    current, traces, results = {}, [], []
    def record(response):
        response.read()
        request = json.loads(response.request.content)
        traces.append({**current, 'request': request, 'status': response.status_code,
                       'response': response.json() if response.is_success else None})
        write_json(dest / 'requests.json', traces)

    client = OpenAI(api_key=key, base_url='https://api.openai.com/v1',
                    http_client=httpx.Client(event_hooks={'response': [record]}))
    service = AnalysisService.__new__(AnalysisService)
    service._client, service._mock = client, False
    themes = OpinionThemeService(service.generate_opinion_themes)
    write_json(dest / 'source-hashes.json', source_hashes())
    try:
        for name, context, original, policy in cases:
            current.update(scenario=name, mode=mode, stage='themes')
            report = deepcopy(original)
            write_json(dest / f'{name}-input.json', {'report': original, 'evidence': policy})
            landscape = await themes.enrich(context, report['opinionLandscape'], wait=True)
            profiles = capture_group_profiles(landscape, context.language, context.topic)
            policy = {**deepcopy(policy), 'groupProfiles': profiles}
            current['stage'] = 'common-ground'
            common = await service.generate_common_ground(policy, context.topic, context.language, mode=mode)
            if common is None:
                results.append({'scenario': name, 'status': 'common-ground-rejected'})
                write_json(dest / 'results.json', results)
                print(f'{name}: common-ground-rejected', flush=True)
                continue
            common.update(promptVersion=CG_PROMPT_VERSION, id=f'local-{name}-common-ground',
                          votes={'agree': 0, 'disagree': 0, 'total': 0})
            # Exercise the same restoration the report uses after a service restart.
            reused = restore_group_profiles(original['opinionLandscape'], common.get('groupProfiles'), context.language, context.topic)
            if profiles is not None:
                assert reused is not None
                assert capture_group_profiles(reused, context.language, context.topic)['id'] == profiles['id']
            report['opinionLandscape'] = reused if reused is not None else landscape
            report['groupProfiles'] = profiles
            report['commonGroundProposal'] = common
            report['narrativeVersion'] = REPORT_NARRATIVE_VERSION
            report['status'] = 'draft_ready'
            report['publishedAt'] = None
            current['stage'] = 'report'
            narrative = await service.generate_report_narrative(narrative_evidence(report), context.language)
            report['narrative'] = {context.language: narrative} if narrative else {}
            write_json(dest / f'{name}-report.json', report)
            results.append({'scenario': name, 'status': 'ready' if narrative else 'report-fallback',
                            'profileCount': len(common['groupAnalysis']),
                            'groupCount': len(landscape.get('groups', [])),
                            'profileSetId': profiles['id'] if profiles else None,
                            'summaryLength': len(common['groupStatement']),
                            'mode': mode, 'recommendations': len(common.get('recommendations', [])),
                            'sharedPoints': len(common.get('commonGround', []))})
            write_json(dest / 'results.json', results)
            print(f'{name}: {results[-1]["status"]}; {len(common["groupAnalysis"])} shared profiles', flush=True)
    finally:
        await themes.close()
        client.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--key-file', type=Path, required=True)
    parser.add_argument('--report', type=Path)
    parser.add_argument('--evidence', type=Path)
    parser.add_argument('--mode', choices=('policy', 'generic'), default='policy')
    parser.add_argument('--scenarios', nargs='+', choices=('traffic', 'library-zh', 'no-votes', 'incompatible-support'))
    args = parser.parse_args()
    if bool(args.report) != bool(args.evidence):
        parser.error('Supply --report and --evidence together')
    asyncio.run(generate(args.output, args.key_file, args.report, args.evidence, args.mode, args.scenarios))


if __name__ == '__main__':
    main()
