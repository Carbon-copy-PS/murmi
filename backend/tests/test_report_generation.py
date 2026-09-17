import unittest
from unittest.mock import AsyncMock, patch

from backend.app import main
from backend.app.reporting import freeze_report_source
from backend.app.session import Session, SessionManager, Statement


class ConnectionMustNotBeCopied:
    def __deepcopy__(self, memo):
        raise AssertionError("Do not copy live connections into report inputs")


class ReportGenerationTests(unittest.IsolatedAsyncioTestCase):
    async def test_report_uses_one_vote_snapshot_across_async_steps(self):
        manager = SessionManager()
        session = Session(id="report-test", participants={"p1": ConnectionMustNotBeCopied()})
        session.statements = [
            Statement(id="left", text="Left", round=1, approved=True,
                      votes={"p1": "agree", "p2": "agree", "p3": "agree", "p4": "disagree"}),
            Statement(id="right", text="Right", round=1, approved=True,
                      votes={"p1": "agree", "p2": "agree", "p3": "neutral", "p4": "disagree"}),
        ]
        manager.sessions[session.id] = session
        captured = []

        async def landscape(source):
            captured.append(source)
            # Another request changes the session while report analysis is running.
            session.statements[0].votes["p1"] = "disagree"
            session.statements[1].votes["p5"] = "agree"
            session.statements[1].text = "Revised right"
            return {"available": False, "reason": "test"}

        async def narrative(evidence, language):
            session.statements[0].votes["p2"] = "neutral"
            return {"overlapPairs": [{"leftStatementId": "left", "rightStatementId": "right"}]}

        with (
            patch.object(main, "sessions", manager),
            patch.object(main, "build_opinion_landscape", side_effect=landscape),
            patch.object(main.analysis, "generate_report_narrative", side_effect=narrative),
            patch.object(main.db, "save_report_snapshot", new_callable=AsyncMock),
            patch.object(main, "broadcast_report_state", new_callable=AsyncMock),
        ):
            await main.run_report_generation(session.id)

        report = session.report_snapshot
        self.assertIsNotNone(report)
        self.assertEqual(report["meta"]["voterCount"], 4)
        self.assertEqual(report["evidence"]["statements"][1]["text"], "Right")
        self.assertEqual(report["story"]["overlaps"][0]["both"], 2)
        self.assertEqual(report["story"]["overlaps"][0]["jointResponses"], 4)
        self.assertEqual(captured[0].statements[0].votes["p1"], "agree")
        self.assertEqual(captured[0].statements[0].votes["p2"], "agree")
        self.assertEqual(captured[0].participants, {"p1": None})
        # Capturing a report must not roll back valid edits to the live session.
        self.assertEqual(session.statements[0].votes["p1"], "disagree")
        self.assertEqual(session.statements[1].text, "Revised right")

    def test_roster_and_common_ground_are_captured_together(self):
        session = Session(id="snapshot", known_participants={"p1": "client"})
        session.common_ground_history = [{"votes": {"p1": "agree"}}]
        frozen = freeze_report_source(session)
        session.known_participants["p2"] = "new-client"
        session.common_ground_history[0]["votes"]["p1"] = "disagree"
        self.assertEqual(len(frozen.known_participants), 1)
        self.assertEqual(frozen.common_ground_history[0]["votes"]["p1"], "agree")
