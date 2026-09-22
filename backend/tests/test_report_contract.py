import json
import unittest
from copy import deepcopy
from unittest.mock import AsyncMock, patch

from backend.app.analysis import AnalysisService
from backend.app.report_contract import REPORT_FORMAT_VERSION, REPORT_NARRATIVE_VERSION
from backend.app.reporting import build_report_snapshot, narrative_evidence
from backend.tools.report_fixture import synthetic_session, synthetic_narrative


class ConciseReportTests(unittest.TestCase):
    def setUp(self):
        self.session = synthetic_session()
        self.snapshot = build_report_snapshot(self.session, version=1)
        self.evidence = narrative_evidence(self.snapshot)
        self.service = AnalysisService()

    def test_same_votes_produce_same_evidence_without_person_identifiers(self):
        other = build_report_snapshot(self.session, version=2)
        self.assertEqual(self.snapshot['sourceHash'], other['sourceHash'])
        self.assertEqual(self.snapshot['analysis'], other['analysis'])
        self.assertEqual(self.snapshot['evidence'], other['evidence'])
        self.assertEqual(self.snapshot['presentationVersion'], REPORT_FORMAT_VERSION)
        self.assertNotIn('synthetic-person', json.dumps(self.evidence))
        self.assertTrue(self.evidence['pairedSupport'])
        for pair in self.evidence['pairedSupport']:
            self.assertEqual(pair['jointResponses'], sum(pair[k] for k in ['both', 'leftOnly', 'rightOnly', 'neither']))

    def test_new_format_rejects_removed_sections_even_if_model_returns_them(self):
        raw = synthetic_narrative()
        for key in ['principles', 'actionAreas']:
            raw[key] = deepcopy(raw['takeaways'])
        result = self.service._normalize_report_narrative(raw, self.evidence)
        self.assertEqual(result['narrativeVersion'], REPORT_NARRATIVE_VERSION)
        self.assertEqual(len(result['takeaways']), 4)
        for key in ['principles', 'actionAreas', 'overlapPairs']: self.assertEqual(result[key], [])
        self.assertLessEqual(len(result['implications']), 3)

    def test_rejects_partially_invented_citations_without_silently_salvaging_claim(self):
        raw = synthetic_narrative()
        raw['takeaways'][0]['evidenceStatementIds'].append('invented')
        result = self.service._normalize_report_narrative(raw, self.evidence)
        self.assertEqual(len(result['takeaways']), 3)
        raw['overviewEvidenceStatementIds'].append('invented')
        self.assertIsNone(self.service._normalize_report_narrative(raw, self.evidence))

    def test_rejects_malformed_or_overlong_text_and_deduplicates_titles(self):
        raw = synthetic_narrative()
        raw['takeaways'][0]['explanation'] = 'x' * 241
        raw['takeaways'].append(deepcopy(raw['takeaways'][1]))
        result = self.service._normalize_report_narrative(raw, self.evidence)
        self.assertEqual(len(result['takeaways']), 3)
        raw['takeaways'] = 4
        self.assertIsNone(self.service._normalize_report_narrative(raw, self.evidence))
        self.assertIsNone(self.service._normalize_report_narrative([], self.evidence))
        raw = synthetic_narrative()
        raw['headline'] = 'x' * 81
        self.assertIsNone(self.service._normalize_report_narrative(raw, self.evidence))


class DraftGenerationTests(unittest.IsolatedAsyncioTestCase):
    async def test_generation_saves_a_draft_and_never_publishes(self):
        from backend.app import main
        from backend.app.session import SessionManager
        manager = SessionManager()
        session = synthetic_session()
        manager.sessions[session.id] = session
        captured = []
        async def generate(evidence, language):
            captured.append(evidence)
            return main.analysis._normalize_report_narrative(synthetic_narrative(), evidence)
        with (patch.object(main, 'sessions', manager),
              patch.object(main, 'build_opinion_landscape', new=AsyncMock(return_value={'available': False})),
              patch.object(main.analysis, 'generate_report_narrative', side_effect=generate),
              patch.object(main.db, 'save_report_snapshot', new_callable=AsyncMock) as saved,
              patch.object(main, 'broadcast_report_state', new_callable=AsyncMock),
              patch.object(manager, 'publish_report', wraps=manager.publish_report) as publish):
            await main.run_report_generation(session.id)
        self.assertEqual(session.report_snapshot['status'], 'draft_ready')
        self.assertIsNone(session.report_snapshot['publishedAt'])
        self.assertEqual(captured[0]['presentationVersion'], REPORT_FORMAT_VERSION)
        saved.assert_awaited_once()
        publish.assert_not_called()

    async def test_ai_failure_preserves_complete_evidence_and_coverage(self):
        from backend.app import main
        from backend.app.session import SessionManager
        manager = SessionManager()
        session = synthetic_session()
        manager.sessions[session.id] = session
        with (patch.object(main, 'sessions', manager),
              patch.object(main, 'build_opinion_landscape', new=AsyncMock(return_value={'available': False})),
              patch.object(main.analysis, 'generate_report_narrative', new=AsyncMock(side_effect=TimeoutError)),
              patch.object(main.db, 'save_report_snapshot', new_callable=AsyncMock),
              patch.object(main, 'broadcast_report_state', new_callable=AsyncMock)):
            await main.run_report_generation(session.id)
        self.assertEqual(session.report_snapshot['status'], 'draft_ready')
        self.assertEqual(len(session.report_snapshot['evidence']['statements']), 7)
        self.assertIn('responseCoverage', session.report_snapshot['analysis'])


class EnglishFixtureTests(unittest.IsolatedAsyncioTestCase):
    async def test_traffic_mock_preserves_divisions_and_missing_responses(self):
        from backend.tools.preview_report import build_fixture
        report = await build_fixture("en", "traffic")
        self.assertEqual(report["status"], "draft_ready")
        self.assertIsNone(report["publishedAt"])
        self.assertEqual(report["meta"]["participantCount"], 60)
        proposal = report["commonGroundProposal"]
        self.assertEqual(proposal["status"], "endorsed")
        self.assertEqual(proposal["votes"], {"agree": 48, "disagree": 6, "total": 54})
        self.assertEqual(proposal["endorsement"]["rosterSize"], 60)
        self.assertNotIn("traffic-person", json.dumps(proposal))
        statements = {s["id"]: s for s in report["evidence"]["statements"]}
        self.assertEqual(len(statements), 9)
        for index, support, neutral, oppose, responded in [
            (0, 60, 0, 0, 60), (1, 40, 0, 20, 60), (2, 20, 20, 20, 60),
            (3, 20, 0, 40, 60), (4, 60, 0, 0, 60), (5, 60, 0, 0, 60),
            (6, 0, 40, 20, 60), (7, 20, 20, 20, 60), (8, 9, 0, 0, 9),
        ]:
            result = statements[f"traffic-s{index}"]
            self.assertEqual((result["support"], result["neutral"], result["oppose"], result["responded"]),
                             (support, neutral, oppose, responded))
        self.assertEqual(statements["traffic-s8"]["coverageRate"], .15)
        narrative = report["narrative"]["en"]
        self.assertEqual(len(narrative["takeaways"]), 4)
        self.assertEqual(len(narrative["implications"]), 3)
        self.assertEqual(len(narrative["openQuestions"]), 1)
        self.assertEqual(len(narrative["limitations"]), 1)
        themes = report["opinionLandscape"]["themes"]
        self.assertEqual(themes["status"], "ready")
        self.assertEqual(sorted(g["size"] for g in report["opinionLandscape"]["groups"]), [20, 20, 20])
        self.assertEqual(len(themes["groups"]), len(report["opinionLandscape"]["groups"]))
        self.assertEqual({g["title"] for g in themes["groups"]}, {
            "Extend the pedestrian zone", "A Saturday trial with limits",
            "Better buses without road restrictions",
        })
        for group in themes["groups"]:
            self.assertEqual(len(group["evidenceStatementIds"]), 3)
            self.assertTrue(all(s in statements for s in group["evidenceStatementIds"]))

    async def test_english_mock_keeps_language_counts_and_evidence(self):
        from backend.tools.preview_report import build_fixture
        report = await build_fixture("en")
        self.assertEqual(report["sourceLanguage"], "en")
        self.assertEqual(report["status"], "draft_ready")
        narrative = report["narrative"]["en"]
        self.assertIsNone(report["commonGroundProposal"])
        self.assertEqual(len(narrative["takeaways"]), 4)
        self.assertEqual(len(narrative["implications"]), 2)
        self.assertEqual(len(narrative["limitations"]), 1)
        self.assertEqual(narrative["principles"], [])
        self.assertEqual(narrative["actionAreas"], [])
        statements = {s["id"]: s for s in report["evidence"]["statements"]}
        self.assertEqual(len(statements), 7)
        for index, support, neutral, oppose, responded in [
            (0, 120, 0, 0, 120), (1, 102, 0, 18, 120),
            (2, 72, 0, 48, 120), (3, 24, 72, 24, 120),
            (4, 18, 18, 84, 120), (5, 48, 36, 36, 120),
            (6, 24, 0, 0, 24),
        ]:
            result = statements[f"fixture-s{index}"]
            self.assertEqual((result["support"], result["neutral"], result["oppose"], result["responded"]),
                             (support, neutral, oppose, responded))
        self.assertEqual(statements["fixture-s6"]["coverageRate"], .2)
        themes = report["opinionLandscape"]["themes"]
        self.assertEqual(themes["status"], "ready")
        self.assertEqual(len(themes["groups"]), len(report["opinionLandscape"]["groups"]))
        for group in themes["groups"]:
            self.assertEqual(len(group["evidenceStatementIds"]), 3)
            self.assertNotRegex(group["description"], r"\d+/\d+")
            self.assertNotIn("方案", group["description"])
