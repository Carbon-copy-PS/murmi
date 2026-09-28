from copy import deepcopy
import json
import unittest
from unittest.mock import AsyncMock, patch

from backend.app import main
from backend.app.analysis import AnalysisService
from backend.app.opinion_themes import (
    THEME_VERSION, OpinionThemeService, capture_group_profiles, restore_group_profiles,
)
from backend.app.policy_evidence import build_policy_evidence
from backend.app.session import SessionManager
from backend.app.reporting import build_opinion_landscape
from backend.tests.test_opinion_themes import session_fixture, grounded_output


class SharedGroupProfileTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.session = session_fixture()
        self.landscape = await build_opinion_landscape(self.session)
        self.generator = AsyncMock(side_effect=grounded_output)
        self.themes = OpinionThemeService(self.generator)
        self.enriched = await self.themes.enrich(self.session, self.landscape, wait=True)
        self.saved = capture_group_profiles(self.enriched, 'en', self.session.topic)
        self.addAsyncCleanup(self.themes.close)

    async def test_saved_profiles_survive_restart_without_regeneration(self):
        restored = restore_group_profiles(self.landscape, json.loads(json.dumps(self.saved)), 'en', self.session.topic)
        self.assertIsNotNone(restored)
        self.assertEqual([g.get('theme') for g in restored['groups']], [g.get('theme') for g in self.enriched['groups']])
        self.assertEqual(self.generator.await_count, 1)
        restored['groups'][0]['theme']['title'] = 'Edited locally'
        self.assertNotEqual(self.saved['themes']['groups'][0]['title'], 'Edited locally')
        self.assertNotIn('dots', json.dumps(self.saved))
        self.assertNotIn('p0', json.dumps(self.saved))

    async def test_new_votes_renumbering_language_and_tampering_reject_reuse(self):
        for change in ('votes', 'letter', 'size', 'language', 'text'):
            landscape, saved, language = deepcopy(self.landscape), deepcopy(self.saved), 'en'
            if change == 'votes': landscape['sourceHash'] = 'different-ballots'
            if change == 'letter': landscape['groups'][0]['letter'] = 'Z'
            if change == 'size': landscape['groups'][0]['size'] += 1
            if change == 'language': language = 'zh'
            if change == 'text': saved['themes']['groups'][0]['description'] = 'Tampered'
            with self.subTest(change=change):
                self.assertIsNone(restore_group_profiles(landscape, saved, language, self.session.topic))

    def test_retained_live_profiles_cannot_be_saved_as_current_evidence(self):
        stale = deepcopy(self.enriched)
        stale['themes']['retained'] = True
        self.assertIsNone(capture_group_profiles(stale, 'en', self.session.topic))

    def test_common_ground_uses_original_profiles_instead_of_model_inventions(self):
        evidence = build_policy_evidence(self.session, self.enriched)
        raw = {'groupStatement': 'Improve access while considering the options.',
               'groupAnalysis': [{'group': 'Z', 'title': 'Invented', 'description': 'Reversed position'}],
               'recommendations': [{'text': 'Discuss travel passes.', 'evidenceIds': ['a3']}]}
        service = AnalysisService.__new__(AnalysisService)
        generic = service._normalize_common_ground({**raw, 'commonGround': [], 'divides': [], 'insights': [], 'bridgingProposal': ''}, 'generic', evidence, validate=True, language='en')
        self.assertEqual(generic['groupProfiles'], self.saved)
        self.assertNotIn('Z', [g['group'] for g in generic['groupAnalysis']])
        result = service._normalize_common_ground(raw, 'policy', evidence, validate=True, language='en')
        self.assertEqual(result['groupProfiles'], self.saved)
        self.assertEqual([g['title'] for g in result['groupAnalysis']], [t['title'] for t in self.saved['themes']['groups']])
        self.assertNotIn('Z', [g['group'] for g in result['groupAnalysis']])
        result['groupProfiles']['themes']['groups'][0]['title'] = 'Mutation'
        self.assertNotEqual(evidence['groupProfiles']['themes']['groups'][0]['title'], 'Mutation')
        evidence['groupProfiles'] = None
        fallback = service._normalize_common_ground(raw, 'policy', evidence, validate=True, language='en')
        self.assertEqual(fallback['groupAnalysis'], [])

    async def test_report_reuses_endorsed_profiles_without_rewriting_saved_package(self):
        manager = SessionManager()
        manager.sessions[self.session.id] = self.session
        self.session.common_ground_history = [{'id': 'saved', 'status': 'endorsed',
            'groupStatement': 'The saved agreed text.', 'groupProfiles': deepcopy(self.saved),
            'participantVotes': {'p0': {'vote': 'agree'}}}]
        before = deepcopy(self.session.common_ground_history)
        with (patch.object(main, 'sessions', manager),
              patch.object(main, 'opinion_themes', self.themes),
              patch.object(main.analysis, 'generate_report_narrative', new_callable=AsyncMock, return_value=None),
              patch.object(main.db, 'save_report_snapshot', new_callable=AsyncMock),
              patch.object(main, 'broadcast_report_state', new_callable=AsyncMock)):
            await main.run_report_generation(self.session.id)
        self.assertEqual(self.generator.await_count, 1)
        report = self.session.report_snapshot
        self.assertEqual(report['groupProfiles']['id'], self.saved['id'])
        self.assertEqual(report['commonGroundProposal']['groupStatement'], before[0]['groupStatement'])
        self.assertEqual(self.session.common_ground_history, before)

    async def test_report_regenerates_old_profiles_without_rewriting_saved_package(self):
        manager = SessionManager()
        manager.sessions[self.session.id] = self.session
        old = deepcopy(self.saved)
        old['themeVersion'] = 'opinion-themes-v4'
        old['themes']['groups'][0]['description'] = 'An old unfinished description that stops at'
        self.session.common_ground_history = [{'id': 'saved', 'status': 'endorsed',
            'groupStatement': 'The saved agreed text.', 'groupProfiles': old}]
        before = deepcopy(self.session.common_ground_history)
        fresh_generator = AsyncMock(side_effect=grounded_output)
        fresh_service = OpinionThemeService(fresh_generator)
        self.addAsyncCleanup(fresh_service.close)
        with (patch.object(main, 'sessions', manager),
              patch.object(main, 'opinion_themes', fresh_service),
              patch.object(main.analysis, 'generate_report_narrative', new_callable=AsyncMock, return_value=None),
              patch.object(main.db, 'save_report_snapshot', new_callable=AsyncMock),
              patch.object(main, 'broadcast_report_state', new_callable=AsyncMock)):
            await main.run_report_generation(self.session.id)
        fresh_generator.assert_awaited_once()
        self.assertEqual(self.session.report_snapshot['groupProfiles']['themeVersion'], THEME_VERSION)
        self.assertTrue(self.session.report_snapshot['groupProfiles']['themes']['groups'][0]['description'].endswith('.'))
        self.assertEqual(self.session.common_ground_history, before)

    async def test_common_ground_keeps_captured_votes_while_profiles_are_generated(self):
        manager = SessionManager()
        manager.sessions[self.session.id] = self.session
        evidence = build_policy_evidence(self.session, self.landscape)
        raw = {'groupStatement': 'Improve practical travel options.',
               'recommendations': [{'text': 'Discuss travel passes.', 'evidenceIds': ['a3']}]}
        captured = []

        async def enrich(context, landscape, wait):
            self.session.statements[0].votes['p0'] = 'disagree'
            return deepcopy(self.enriched)

        async def generate(payload, topic, language, **kwargs):
            captured.append(deepcopy(payload))
            return AnalysisService.__new__(AnalysisService)._normalize_common_ground(
                raw, 'policy', payload, validate=True, language='en')

        with (patch.object(main, 'sessions', manager),
              patch.object(main.opinion_themes, 'enrich', side_effect=enrich),
              patch.object(main.analysis, 'generate_common_ground', side_effect=generate),
              patch.object(main.db, 'save_common_ground', new_callable=AsyncMock),
              patch.object(main, 'broadcast_common_ground_history', new_callable=AsyncMock)):
            await main.run_common_ground(self.session.id, evidence, self.session.topic, 'en',
                                         'policy', grouping_snapshot=self.landscape)
        self.assertEqual(captured[0]['opinionGroups'], evidence['opinionGroups'])
        self.assertEqual(captured[0]['groupProfiles'], self.saved)
        self.assertEqual(self.session.common_ground_history[-1]['groupProfiles'], self.saved)
        self.assertEqual(self.session.statements[0].votes['p0'], 'disagree')


class MediationCommonGroundTests(unittest.TestCase):
    def setUp(self):
        self.service = AnalysisService.__new__(AnalysisService)
        self.evidence = {'validArgumentIds': ['a1'], 'groupProfiles': None}
        self.raw = {'groupStatement': 'Support practical education. Improve access to help.',
                    'recommendations': [{'text': 'Provide practical lessons.', 'evidenceIds': ['a1']}],
                    'essentialConditions': [], 'tradeoffs': [], 'unresolvedQuestions': []}

    def normalize(self, raw):
        return self.service._normalize_common_ground(raw, 'policy', self.evidence, validate=True, language='en')

    def test_rejects_overlong_repeated_uncited_and_approval_text(self):
        for change in ('length', 'duplicate', 'citation', 'approval', 'list'):
            raw = deepcopy(self.raw)
            if change == 'length': raw['groupStatement'] = 'word ' * 251
            if change == 'duplicate': raw['essentialConditions'] = deepcopy(raw['recommendations'])
            if change == 'citation': raw['recommendations'][0]['evidenceIds'].append('invented')
            if change == 'approval': raw['groupStatement'] = 'This is an unapproved draft.'
            if change == 'list': raw['recommendations'] = [{'text': f'Action {i}', 'evidenceIds': ['a1']} for i in range(7)]
            with self.subTest(change=change): self.assertIsNone(self.normalize(raw))

    def test_revision_limits_allow_preserving_previous_conditions(self):
        raw = deepcopy(self.raw)
        raw['essentialConditions'] = [{'text': f'Keep safeguard {i}.', 'evidenceIds': ['a1']} for i in range(5)]
        self.assertIsNone(self.normalize(raw))
        self.evidence['previousFeedback'] = [{'versionId': 'earlier', 'essentialConditions': deepcopy(raw['essentialConditions'])}]
        self.assertIsNotNone(self.normalize(raw))

    def test_original_mediation_summary_and_section_sizes_are_accepted(self):
        raw = deepcopy(self.raw)
        raw['groupStatement'] = ('Group A and group B share a concern for access. '
            'They differ on how to improve it, with one group favouring travel passes and the other preferring local services. '
            'Those priorities can coexist, but resources and coverage need discussion. '
            'A useful next step is to compare both options while retaining the access safeguards.')
        for field, count in [('recommendations', 6), ('essentialConditions', 4), ('tradeoffs', 4), ('unresolvedQuestions', 4)]:
            raw[field] = [{'text': f'{field} idea {i}', 'evidenceIds': ['a1']} for i in range(count)]
        self.assertIsNotNone(self.normalize(raw))

    def test_revision_uses_latest_previous_version_in_history_order(self):
        self.evidence['previousFeedback'] = [{'versionId': 'z-old'}, {'versionId': 'a-latest'}]
        self.assertEqual(self.normalize(self.raw)['previousVersionId'], 'a-latest')
        self.assertEqual(self.normalize({**self.raw, 'previousVersionId': 'invented'})['previousVersionId'], 'a-latest')
