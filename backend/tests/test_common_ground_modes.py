"""Both modes use complete server evidence and retain their native report sections."""
import asyncio
from copy import deepcopy
import json
import unittest
from unittest.mock import AsyncMock, patch

from starlette.websockets import WebSocket

from backend.app import main
from backend.app.analysis import AnalysisService, COMMON_GROUND_PROMPTS, build_common_ground_system_prompt
from backend.app.policy_evidence import build_policy_evidence, build_anonymous_common_ground_feedback, common_ground_evidence_pack
from backend.app.reporting import build_opinion_landscape, build_report_snapshot
from backend.app.session import SessionManager
from backend.tests.test_opinion_themes import session_fixture


class CommonGroundModeTests(unittest.IsolatedAsyncioTestCase):
    async def test_websocket_uses_frozen_server_evidence_in_both_modes(self):
        for mode in ('generic', 'policy'):
            with self.subTest(mode=mode):
                manager = SessionManager()
                source = session_fixture()
                source.id = 'MODETEST'
                source.known_participants = {'host-client': 'host'}
                source.host_client_ids = {'host-client'}
                manager.sessions[source.id] = source
                source.common_ground_history = [{'id': 'prior', 'mode': mode,
                    'groupStatement': 'Earlier text', 'participantVotes': {'p0': {'name': 'PRIVATE_NAME', 'vote': 'disagree', 'reason': 'Keep access.'}}}]
                landscape = await build_opinion_landscape(source)
                expected = build_policy_evidence(source, landscape)
                messages = iter([
                    {'type': 'websocket.connect'},
                    {'type': 'websocket.receive', 'text': json.dumps({'type': 'join', 'name': 'Host', 'clientId': 'host-client'})},
                    {'type': 'websocket.receive', 'text': json.dumps({'type': 'get_common_ground', 'mode': mode,
                        'analysis': {'voterCount': 999, 'consensus': [{'text': 'CLIENT_INVENTION'}]}})},
                    {'type': 'websocket.disconnect', 'code': 1000},
                ])
                async def receive():
                    await asyncio.sleep(0)
                    return next(messages)
                async def opinion(frozen):
                    # New live input while analysis awaits must not alter this request.
                    source.statements[0].votes['p0'] = 'neutral'
                    source.common_ground_history[0]['groupStatement'] = 'CHANGED_AFTER_CAPTURE'
                    return {'landscape': landscape}
                socket = WebSocket({'type': 'websocket'}, receive, AsyncMock())
                with (patch.object(main, 'sessions', manager),
                      patch.object(main, 'get_opinion_analysis', side_effect=opinion),
                      patch.object(main, 'run_common_ground', new_callable=AsyncMock) as run,
                      patch.object(main.db, 'save_participant', new_callable=AsyncMock)):
                    await main.websocket_endpoint(socket, source.id)
                    await asyncio.sleep(0)
                self.assertEqual(run.await_count, 1)
                payload = run.call_args.args[1]
                self.assertEqual(payload['arguments'], expected['arguments'])
                self.assertEqual(payload['opinionGroups'], expected['opinionGroups'])
                self.assertEqual(payload['previousFeedback'][0]['groupStatement'], 'Earlier text')
                text = json.dumps(common_ground_evidence_pack(payload, source.topic))
                for private in ('PRIVATE_NAME', 'CLIENT_INVENTION', 'CHANGED_AFTER_CAPTURE'):
                    self.assertNotIn(private, text)

    async def test_complete_tallies_and_denominators_are_kept(self):
        source = session_fixture()
        source.known_participants = {'silent-client': 'silent-person'}
        source.statements[0].votes['p0'] = 'strongly_agree'
        source.statements[0].votes['p1'] = 'neutral'
        source.statements[0].votes.pop('p2')
        landscape = await build_opinion_landscape(source)
        evidence = build_policy_evidence(source, landscape)
        pack = common_ground_evidence_pack(evidence, source.topic)
        self.assertEqual(len(pack['statements']), len(source.statements))
        row = pack['statements'][0]
        self.assertEqual(row['counts']['strongly_agree'], 1)
        self.assertEqual(row['counts']['neutral'], 1)
        self.assertEqual(row['unansweredAmongVoters'], 1)
        self.assertEqual(row['unansweredAmongRoster'], 2)
        self.assertEqual(len(pack['coSupport']), len(evidence['coSupport']))
        for group in pack['groups']:
            self.assertEqual(len(group['stances']), len(source.statements))
            self.assertTrue(all('dist' in stance for stance in group['stances']))

    def test_generic_fields_and_reaction_counts_survive_public_report(self):
        source = session_fixture()
        raw = {'groupStatement': 'Preserve access while comparing transport options.',
               'commonGround': ['Keep access affordable.'], 'divides': ['Which transport options work best?'],
               'bridgingProposal': 'Compare bus services and travel passes.', 'insights': ['Access connects these priorities.']}
        result = AnalysisService.__new__(AnalysisService)._normalize_common_ground(raw, 'generic', {'groupProfiles': None}, validate=True)
        source.common_ground_history = [{**result, 'id': 'generic-draft', 'status': 'working_draft',
                                        'participantVotes': {'p0': {'vote': 'disagree', 'name': 'Private name'}}}]
        proposal = build_report_snapshot(source, 1)['commonGroundProposal']
        for field in raw:
            self.assertEqual(proposal[field], raw[field])
        self.assertEqual(proposal['votes'], {'agree': 0, 'disagree': 1, 'total': 1})
        self.assertNotIn('endorsement', proposal)
        self.assertNotIn('Private name', json.dumps(proposal))

    def test_feedback_ids_are_unique_across_versions_and_generic_points_survive(self):
        history = [{'id': str(n), 'mode': 'generic', 'commonGround': ['Keep access open.'],
                    'participantVotes': {'private-id': {'name': 'Private', 'vote': 'agree'}}} for n in range(2)]
        feedback = build_anonymous_common_ground_feedback(history)
        self.assertEqual([x['validFeedbackIds'] for x in feedback], [['fb1'], ['fb2']])
        self.assertEqual(feedback[0]['commonGround'], ['Keep access open.'])
        self.assertNotIn('private', json.dumps(feedback).lower())

    def test_policy_keeps_original_mediation_and_generic_points_are_plain(self):
        self.assertIn('3-4 sentence mediation summary', COMMON_GROUND_PROMPTS['policy'])
        self.assertIn('3-6 recommendations', COMMON_GROUND_PROMPTS['policy'])
        prompt = build_common_ground_system_prompt('generic')
        self.assertIn('no vote counts', prompt)
        self.assertIn('specific unresolved questions', prompt)
