import asyncio
from copy import deepcopy
import json
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch

from backend.app.opinion_themes import OpinionThemeService, theme_evidence, validate_themes
from backend.app.reporting import build_opinion_landscape
from backend.app.session import Session, Statement


def session_fixture():
    session = Session(id='theme-test', topic='Transport', language='en')
    texts = ['Improve bus services before reducing parking', 'Keep existing parking until alternatives improve', 'Offer affordable travel passes']
    for index, text in enumerate(texts):
        session.statements.append(Statement(id=f's{index}', text=text, round=1, approved=True,
            votes={f'p{p}': 'agree' if index == 2 or p < 4 else 'disagree' for p in range(8)}))
    return session


def grounded_output(evidence, language=None):
    return {'groups': [{'groupId': g['groupId'], 'title': 'Transport priorities',
                       'description': 'A synthetic response for testing citation handling.',
                       'evidenceStatementIds': [s['id'] for s in g['statements'][:2]]}
                      for g in evidence['groups'] if len(g['statements']) >= 2],
            'shared': {'title': 'Affordable travel', 'description': 'Both groups support affordable travel passes.',
                       'evidenceStatementIds': ['s2']} if evidence['shared'] else None}


class OpinionThemeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.session = session_fixture()
        self.landscape = await build_opinion_landscape(self.session)
        self.generator = AsyncMock(side_effect=grounded_output)
        self.service = OpinionThemeService(self.generator)

    async def asyncTearDown(self):
        await self.service.close()

    def test_evidence_includes_opposition_outside_comparison_and_missing(self):
        self.session.statements[0].votes.pop('p0')
        evidence = theme_evidence(self.landscape, self.session.topic)
        candidates = [s for g in evidence['groups'] for s in g['statements']]
        self.assertTrue(any(s['oppose'] for s in candidates))
        self.assertTrue(all('unanswered' in s and 'neutral' in s and 'outsideGroup' in s for s in candidates))
        self.assertEqual([s['id'] for s in evidence['shared']], ['s2'])
        self.assertNotIn('density', json.dumps(evidence))
        self.assertNotIn('participant', json.dumps(evidence))

    async def test_background_deduplication_cache_and_snapshot_attachment(self):
        original = deepcopy(self.landscape)
        first = await self.service.enrich(self.session, self.landscape)
        self.assertEqual(first['themes']['status'], 'pending')
        second = await self.service.enrich(self.session, self.landscape, wait=True)
        self.assertEqual(self.generator.await_count, 1)
        self.assertEqual(second['themes']['status'], 'ready')
        self.assertTrue(all(g['theme']['sourceHash'] == original['sourceHash'] for g in second['groups']))
        second['groups'][0]['theme']['title'] = 'Caller mutation'
        fresh = await self.service.enrich(self.session, self.landscape)
        self.assertNotEqual(fresh['groups'][0]['theme']['title'], 'Caller mutation')
        self.assertEqual(self.landscape, original)
        changed = deepcopy(original)
        changed['sourceHash'] = 'new-votes'
        delayed = await self.service.enrich(self.session, changed)
        self.assertEqual(delayed['themes']['status'], 'pending')
        self.assertTrue(all(g['theme']['retained'] for g in delayed['groups']))
        self.assertTrue(all(g['theme']['sourceHash'] == original['sourceHash'] for g in delayed['groups']))
        self.assertTrue(all(g['theme']['matchedSourceHash'] == 'new-votes' for g in delayed['groups']))
        self.assertEqual(self.generator.await_count, 1)
        final = await self.service.enrich(self.session, changed, wait=True)
        self.assertEqual(self.generator.await_count, 2)
        self.assertTrue(all(g['theme']['sourceHash'] == 'new-votes' for g in final['groups']))
        self.assertNotIn('retained', final['themes'])

    async def test_background_completion_is_retained_without_polling_original_snapshot(self):
        await self.service.enrich(self.session, self.landscape)
        await self.service.running[self.session.id][1]
        self.session.statements[0].votes['p0'] = 'neutral'
        changed = await build_opinion_landscape(self.session)
        result = await self.service.enrich(self.session, changed)
        self.assertNotEqual(result['sourceHash'], self.landscape['sourceHash'])
        self.assertTrue(all(g.get('theme', {}).get('retained') for g in result['groups']))
        self.assertEqual(result['groups'][0]['statements'], changed['groups'][0]['statements'])
        self.assertEqual(self.generator.await_count, 1)

    async def test_retained_themes_follow_votes_when_group_numbers_swap(self):
        saved = await self.service.enrich(self.session, self.landscape, wait=True)
        changed = deepcopy(self.landscape)
        changed['sourceHash'] = 'renumbered'
        for g in changed['groups']:
            g['id'] = 1 - g['id']
        result = await self.service.enrich(self.session, changed)
        for original, current in zip(saved['groups'], result['groups']):
            self.assertTrue(current['theme']['retained'])
            self.assertEqual(current['theme']['groupId'], current['id'])
            self.assertEqual(current['theme']['evidenceStatementIds'], original['theme']['evidenceStatementIds'])

    async def test_ambiguous_groups_and_splits_do_not_inherit_old_names(self):
        await self.service.enrich(self.session, self.landscape, wait=True)
        changed = deepcopy(self.landscape)
        changed['sourceHash'] = 'ambiguous'
        changed['groups'][1]['statements'] = deepcopy(changed['groups'][0]['statements'])
        result = await self.service.enrich(self.session, changed)
        self.assertTrue(all('theme' not in g for g in result['groups']))
        changed['groups'].pop()
        result = await self.service.enrich(self.session, changed)
        self.assertTrue(all('theme' not in g for g in result['groups']))

    async def test_edited_or_removed_citations_do_not_keep_old_descriptions(self):
        saved = await self.service.enrich(self.session, self.landscape, wait=True)
        for remove in (False, True):
            changed = deepcopy(self.landscape)
            changed['sourceHash'] = 'edited-evidence'
            for g in changed['groups']:
                sid = next(x for x in saved['groups'] if x['id'] == g['id'])['theme']['evidenceStatementIds'][0]
                if remove:
                    g['statements'] = [s for s in g['statements'] if s['id'] != sid]
                else:
                    next(s for s in g['statements'] if s['id'] == sid)['text'] = 'Changed meaning'
            # Keep a common statement inventory, as real landscapes do.
            common = set.intersection(*({s['id'] for s in g['statements']} for g in changed['groups']))
            for g in changed['groups']:
                g['statements'] = [s for s in g['statements'] if s['id'] in common]
            result = await self.service.enrich(self.session, changed)
            self.assertTrue(all('theme' not in g for g in result['groups']))

    async def test_failed_refresh_keeps_live_labels_but_reports_require_exact_snapshot(self):
        await self.service.enrich(self.session, self.landscape, wait=True)
        changed = deepcopy(self.landscape)
        changed['sourceHash'] = 'new-votes'
        self.service.generator = AsyncMock(return_value=None)
        report = await self.service.enrich(self.session, changed, wait=True)
        self.assertEqual(report['themes']['status'], 'unavailable')
        self.assertTrue(all('theme' not in g for g in report['groups']))
        live = await self.service.enrich(self.session, changed)
        self.assertEqual(live['themes']['status'], 'unavailable')
        self.assertTrue(live['themes']['retained'])
        self.assertTrue(all(g['theme']['retained'] for g in live['groups']))

    async def test_language_and_topic_changes_do_not_reuse_old_labels(self):
        await self.service.enrich(self.session, self.landscape, wait=True)
        self.session.language = 'zh'
        pending = await self.service.enrich(self.session, self.landscape)
        self.assertTrue(all('theme' not in g for g in pending['groups']))
        await self.service.enrich(self.session, self.landscape, wait=True)
        self.assertEqual(self.generator.call_args.args[1], 'zh')
        self.session.topic = 'A different topic'
        await self.service.enrich(self.session, self.landscape, wait=True)
        self.assertEqual(self.generator.await_count, 3)

    async def test_small_group_keeps_geometry_without_invented_theme(self):
        sparse = deepcopy(self.landscape)
        for g in sparse['groups']:
            for s in g['statements']:
                s['responded'] = 1
        result = await self.service.enrich(self.session, sparse, wait=True)
        self.assertEqual(result['themes']['status'], 'emerging')
        self.assertEqual(result['groups'], sparse['groups'])
        self.generator.assert_not_awaited()

    async def test_timeout_leaves_votes_visible_and_backs_off(self):
        async def slow(*args):
            await asyncio.sleep(1)
        self.service.generator = slow
        self.service.timeout = .01
        result = await self.service.enrich(self.session, self.landscape, wait=True)
        self.assertEqual(result['themes']['status'], 'unavailable')
        self.assertEqual(result['groups'], self.landscape['groups'])
        self.assertEqual((await self.service.enrich(self.session, self.landscape))['themes']['status'], 'unavailable')
        self.assertFalse(self.service.cache)

    def test_unknown_or_cross_group_citations_are_rejected(self):
        evidence = theme_evidence(self.landscape)
        raw = grounded_output(evidence)
        raw['groups'][0]['evidenceStatementIds'] = ['s0', 'invented']
        raw['groups'].append({'groupId': 99, 'title': 'Invented', 'description': 'Wrong', 'evidenceStatementIds': ['s0','s1']})
        raw['shared']['evidenceStatementIds'] = ['s0']
        parsed = validate_themes(raw, evidence)
        self.assertEqual(len(parsed['groups']), 1)
        self.assertIsNone(parsed['shared'])
        evidence['groups'][1]['statements'] = []
        self.assertFalse(validate_themes(raw, evidence)['groups'])

    async def test_report_waits_for_its_snapshot_and_saves_matching_themes(self):
        from backend.app import main
        from backend.app.session import SessionManager
        manager = SessionManager()
        manager.sessions[self.session.id] = self.session
        with patch.object(main, 'sessions', manager), patch.object(main, 'opinion_themes', self.service), \
             patch.object(main.analysis, 'generate_report_narrative', new_callable=AsyncMock, return_value=None), \
             patch.object(main.db, 'save_report_snapshot', new_callable=AsyncMock) as save, \
             patch.object(main, 'broadcast_report_state', new_callable=AsyncMock):
            await main.run_report_generation(self.session.id)
        stored = self.session.report_snapshot['opinionLandscape']
        live = await self.service.enrich(self.session, self.landscape)
        self.assertEqual(stored, live)
        self.assertEqual(save.call_args.args[1]['opinionLandscape'], stored)
        self.session.statements[0].votes['p0'] = 'disagree'
        self.assertEqual(self.session.report_snapshot['opinionLandscape'], stored)

    async def test_api_call_uses_schema_and_declines_refusal(self):
        from backend.app.analysis import AnalysisService
        service = AnalysisService()
        service._mock = False
        message = SimpleNamespace(content=json.dumps({'groups': [], 'shared': None}), refusal=None)
        create = Mock(return_value=SimpleNamespace(choices=[SimpleNamespace(message=message, finish_reason='stop')]))
        client = Mock()
        client.with_options.return_value.chat.completions.create = create
        service._client = client
        evidence = theme_evidence(self.landscape)
        self.assertEqual(await service.generate_opinion_themes(evidence, 'zh'), {'groups': [], 'shared': None})
        args = create.call_args.kwargs
        self.assertEqual(args['response_format']['type'], 'json_schema')
        self.assertIn('Traditional Chinese', args['messages'][0]['content'])
        self.assertNotIn('density', args['messages'][1]['content'])
        message.refusal = 'Refused'
        self.assertIsNone(await service.generate_opinion_themes(evidence, 'en'))

    async def test_manual_refresh_is_throttled_and_keeps_original_report_value(self):
        saved = await self.service.enrich(self.session, self.landscape, wait=True)
        await self.service.enrich(self.session, self.landscape, force=True, wait=True)
        self.assertEqual(self.generator.await_count, 1)
        self.service.started[self.session.id] -= 6
        pending = await self.service.enrich(self.session, self.landscape, force=True)
        self.assertEqual(pending['themes']['status'], 'pending')
        await self.service.enrich(self.session, self.landscape, wait=True)
        self.assertEqual(self.generator.await_count, 2)
        self.assertEqual(saved['themes']['status'], 'ready')

    async def test_report_waits_for_an_older_inflight_snapshot_then_generates_its_own(self):
        release = asyncio.Event()
        async def slow(evidence, language):
            await release.wait()
            return grounded_output(evidence)
        self.service.generator = slow
        await self.service.enrich(self.session, self.landscape)
        captured = deepcopy(self.landscape)
        captured['sourceHash'] = 'captured-new-votes'
        report = asyncio.create_task(self.service.enrich(self.session, captured, wait=True))
        release.set()
        result = await report
        self.assertEqual(result['themes']['status'], 'ready')
        self.assertTrue(all(g['theme']['sourceHash'] == 'captured-new-votes' for g in result['groups']))

    async def test_generation_queue_and_parallel_calls_are_bounded(self):
        release = asyncio.Event()
        active = 0
        peak = 0
        async def blocked(evidence, language):
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            await release.wait()
            active -= 1
            return grounded_output(evidence)
        self.service.generator = blocked
        for index in range(10):
            session = deepcopy(self.session)
            session.id = f'load-{index}'
            landscape = deepcopy(self.landscape)
            landscape['sourceHash'] = f'snapshot-{index}'
            await self.service.enrich(session, landscape)
        self.assertEqual(len(self.service.running), 8)
        tasks = [task for _, task in self.service.running.values()]
        release.set()
        await asyncio.gather(*tasks)
        self.assertLessEqual(peak, 2)
