"""Host report workflow through real WebSockets, HTTP and disposable PostgreSQL.

Only model responses are substituted; no API key or production session is used.
"""
from contextlib import ExitStack
from copy import deepcopy
import os
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from sqlalchemy import text

from backend.app import main
from backend.app.analysis import AnalysisService
from backend.app.db import Database
from backend.app.opinion_themes import OpinionThemeService
from backend.app.session import SessionManager
from backend.tools.model_experiment_fixtures import scenarios
from backend.tools.traffic_report_fixture import traffic_narrative, traffic_themes


@unittest.skipUnless(os.environ.get('MURMI_TEST_POSTGRES_PORT'), 'Requires disposable PostgreSQL')
class ReportPersistenceTests(unittest.TestCase):
    def test_host_generate_preview_publish_and_reload_preserve_approval_and_votes(self):
        environment = {
            'OPENAI_API_KEY': '', 'POSTGRES_HOST': '127.0.0.1',
            'POSTGRES_PORT': os.environ['MURMI_TEST_POSTGRES_PORT'],
            'POSTGRES_USER': 'murmi_test', 'POSTGRES_PASSWORD': '', 'POSTGRES_DB': 'postgres',
        }
        manager = SessionManager()
        source = scenarios()[0]['session']
        source.id, source.public_id = 'REPORTTEST', 'synthetic-report-test'
        host_client, guest_client = list(source.known_participants)[:2]
        source.host_client_ids = {host_client}
        source.transcript = [{"id": "synthetic-caption", "text": "Recorded discussion: 保留原文。", "speaker": "Synthetic recorder", "timestamp": 1700000000, "itemId": "private-provider-id"}]
        original_votes = {s.id: deepcopy(s.votes) for s in source.statements}
        original_approval = deepcopy(source.common_ground_history[0]['endorsement'])

        async def themes(evidence, language):
            return traffic_themes(evidence)

        async def narrative(evidence, language):
            return AnalysisService.__new__(AnalysisService)._normalize_report_narrative(traffic_narrative(), evidence)

        def receive_until(socket, predicate):
            for _ in range(50):
                message = socket.receive_json()
                if predicate(message):
                    return message
            self.fail('Expected report event not received')

        with ExitStack() as stack:
            stack.enter_context(patch.dict(os.environ, environment))
            database = Database()
            stack.enter_context(patch.object(main, 'sessions', manager))
            stack.enter_context(patch.object(main, 'db', database))
            stack.enter_context(patch.object(main, 'opinion_themes', OpinionThemeService(themes)))
            stack.enter_context(patch.object(main.analysis, 'generate_report_narrative', side_effect=narrative))
            common_ground = stack.enter_context(patch.object(main.analysis, 'generate_common_ground', new_callable=AsyncMock))
            client = stack.enter_context(TestClient(main.app))
            self.assertTrue(database.enabled)

            async def seed():
                manager.sessions[source.id] = source
                await database.save_session(source)
                await database.save_common_ground(source)
                for entry in source.transcript:
                    await database.save_transcript_entry(source, entry)
                for statement in source.statements:
                    for participant, vote in statement.votes.items():
                        await database.save_vote(source, statement, participant, vote)

            async def cleanup():
                async with database.engine.begin() as connection:
                    await connection.execute(text("DELETE FROM sessions WHERE id='REPORTTEST'"))
                manager.sessions.pop(source.id, None)

            client.portal.call(seed)
            try:
                with client.websocket_connect('/ws/REPORTTEST') as host:
                    host.send_json({'type': 'join', 'clientId': host_client, 'name': 'Synthetic host', 'language': 'en'})
                    joined = receive_until(host, lambda m: m['type'] == 'joined')
                    self.assertTrue(joined['isHost'])
                    host.send_json({'type': 'finalize_report'})
                    preview = receive_until(host, lambda m: m.get('reportStatus') == 'draft_ready')
                    self.assertEqual(preview['report']['status'], 'draft_ready')
                    transcript = deepcopy(preview['report']['transcript'])
                    self.assertEqual(transcript[0]['text'], source.transcript[0]['text'])
                    self.assertNotIn('itemId', transcript[0])
                    self.assertFalse(source.voting_open)
                    self.assertEqual(source.common_ground_history[0]['endorsement'], original_approval)
                    proposal = deepcopy(preview['report']['commonGroundProposal'])
                    self.assertEqual(proposal['status'], 'endorsed')
                    public = client.get('/api/public/results/synthetic-report-test')
                    self.assertEqual(public.status_code, 200)
                    self.assertNotIn('report', public.json())
                    self.assertNotIn('transcript', public.json())

                    # Non-hosts cannot see the draft or publish it.
                    with client.websocket_connect('/ws/REPORTTEST') as guest:
                        guest.send_json({'type': 'join', 'clientId': guest_client, 'name': 'Synthetic participant'})
                        participant = receive_until(guest, lambda m: m['type'] == 'joined')
                        self.assertFalse(participant['isHost'])
                        self.assertNotIn('report', participant)
                        guest.send_json({'type': 'publish_report'})
                        guest.send_json({'type': 'ping'})
                        receive_until(guest, lambda m: m['type'] == 'pong')
                        self.assertEqual(source.report_status, 'draft_ready')

                    host.send_json({'type': 'publish_report'})
                    published = receive_until(host, lambda m: m.get('reportStatus') == 'published')['report']
                    response = client.get('/api/public/results/synthetic-report-test')
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.json()['report'], published)
                    self.assertEqual(published['commonGroundProposal'], proposal)
                    self.assertEqual(published['transcript'], transcript)
                    source.transcript[0]['text'] = 'Later edits must not change a published transcript'
                    self.assertEqual(client.get('/api/public/results/synthetic-report-test').json()['report']['transcript'], transcript)
                    self.assertEqual({s.id: s.votes for s in source.statements}, original_votes)
                    common_ground.assert_not_called()

                async def reload():
                    await database.disconnect()
                    await database.connect()
                    row = await database.load_session(source.id)
                    manager.sessions.pop(source.id, None)
                    manager.hydrate(row)
                    return manager.get(source.id)

                restored = client.portal.call(reload)
                self.assertEqual(restored.report_status, 'published')
                self.assertEqual(restored.report_snapshot, published)
                self.assertEqual(restored.report_snapshot['transcript'], transcript)
                self.assertEqual(restored.common_ground_history[0]['endorsement'], original_approval)
                self.assertEqual({s.id: s.votes for s in restored.statements}, original_votes)
                self.assertEqual(client.get('/api/public/results/synthetic-report-test').json()['report'], published)
            finally:
                client.portal.call(cleanup)
