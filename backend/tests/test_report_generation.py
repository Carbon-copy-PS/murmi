import unittest
from copy import deepcopy
from unittest.mock import AsyncMock, patch

from backend.app import main
from backend.app.reporting import build_report_snapshot, build_transcript_revision, freeze_report_source, narrative_evidence, _source_hash
from backend.app.session import Session, SessionManager, Statement


class ConnectionMustNotBeCopied:
    def __deepcopy__(self, memo):
        raise AssertionError("Do not copy live connections into report inputs")


class ReportGenerationTests(unittest.IsolatedAsyncioTestCase):
    def legacy_session(self):
        session = Session(id="legacy-transcript", language="en", topic="Synthetic discussion", voting_open=False)
        session.statements = [Statement(id="s1", text="Keep a staffed desk.", round=1, approved=True,
                                        votes={"p1": "agree", "p2": "disagree"})]
        session.transcript = [{"text": "Recorded words.", "speaker": "Recorder", "timestamp": 1700000000,
                               "participantId": "private", "itemId": "provider-private"}]
        previous = build_report_snapshot(session, 1)
        previous.pop("transcript")
        previous.update(presentationVersion="concise-report-v1", status="published",
                        sourceHash=_source_hash(session, session.statements, None), publishedAt=1700000001)
        previous["narrative"] = {"en": {"headline": "Reviewed report", "standfirst": "Keep the exact wording."}}
        previous["opinionLandscape"] = {"themes": {"version": "older-version", "groups": [{"description": "Saved wording."}]}}
        session.report_snapshot = previous
        session.report_status, session.report_version = "published", 1
        return session

    def test_transcript_revision_preserves_reviewed_content_and_prior_snapshot(self):
        session = self.legacy_session()
        previous = deepcopy(session.report_snapshot)
        revision = build_transcript_revision(session)
        changed = {"version", "status", "presentationVersion", "generatedAt", "publishedAt", "sourceHash", "transcript", "revision"}
        self.assertEqual({k: v for k, v in revision.items() if k not in changed},
                         {k: v for k, v in previous.items() if k not in changed})
        self.assertEqual(session.report_snapshot, previous)
        self.assertEqual(revision["version"], 2)
        self.assertEqual(revision["status"], "draft_ready")
        self.assertEqual(revision["revision"]["previousSourceHash"], previous["sourceHash"])
        self.assertEqual(revision["sourceHash"], build_report_snapshot(session, 2)["sourceHash"])
        self.assertEqual(set(revision["transcript"][0]), {"text", "speaker", "timestamp", "transcriptionStatus"})
        session.transcript[0]["text"] = "Later correction"
        self.assertEqual(revision["transcript"][0]["text"], "Recorded words.")

    def test_transcript_revision_rejects_changed_individual_votes_even_if_totals_match(self):
        session = self.legacy_session()
        session.statements[0].votes = {"p1": "disagree", "p2": "agree"}
        with self.assertRaisesRegex(ValueError, "evidence has changed"):
            build_transcript_revision(session)

    def test_transcript_revision_rejects_changed_topic_language_or_statement(self):
        for field in ("topic", "language", "statement"):
            with self.subTest(field=field):
                session = self.legacy_session()
                if field == "statement":
                    session.statements[0].text = "Different statement."
                else:
                    setattr(session, field, "changed")
                with self.assertRaisesRegex(ValueError, "evidence has changed"):
                    build_transcript_revision(session)

    def test_transcript_revision_requires_closed_published_legacy_report_with_transcript(self):
        for field, value in (("recording", True), ("voting_open", True), ("report_status", "generating"),
                             ("report_status", "stale"), ("transcript", []), ("report_snapshot", None)):
            with self.subTest(field=field, value=value):
                session = self.legacy_session()
                setattr(session, field, value)
                with self.assertRaises(ValueError):
                    build_transcript_revision(session)
        session = self.legacy_session()
        session.report_snapshot["transcript"] = []
        with self.assertRaisesRegex(ValueError, "already uses"):
            build_transcript_revision(session)

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
        session.transcript = [{"text": "Original recorded words", "speaker": "Room", "timestamp": 1700000000}]
        captured = []

        async def landscape(source):
            captured.append(source)
            # Another request changes the session while report analysis is running.
            session.statements[0].votes["p1"] = "disagree"
            session.statements[1].votes["p5"] = "agree"
            session.statements[1].text = "Revised right"
            session.transcript[0]["text"] = "Later correction"
            session.transcript.append({"text": "Later speech"})
            return {"available": False, "reason": "test"}

        async def narrative(evidence, language):
            self.assertNotIn("transcript", evidence)
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
        self.assertEqual(len(report["transcript"]), 1)
        self.assertEqual(report["transcript"][0]["text"], "Original recorded words")
        self.assertEqual(report["evidence"]["statements"][1]["text"], "Right")
        self.assertEqual(report["story"]["overlaps"][0]["both"], 2)
        self.assertEqual(report["story"]["overlaps"][0]["jointResponses"], 4)
        self.assertEqual(captured[0].statements[0].votes["p1"], "agree")
        self.assertEqual(captured[0].statements[0].votes["p2"], "agree")
        self.assertEqual(captured[0].participants, {"p1": None})
        # Capturing a report must not roll back valid edits to the live session.
        self.assertEqual(session.statements[0].votes["p1"], "disagree")
        self.assertEqual(session.statements[1].text, "Revised right")
        self.assertEqual(session.transcript[0]["text"], "Later correction")

    def test_transcript_retains_readable_evidence_without_provider_metadata(self):
        session = Session(id="transcript")
        session.transcript = [
            {"text": "Keep these words.\nAnd this line.", "speaker": "Room audio", "timestamp": 1700000000,
             "clientId": "private-client", "participantId": "private-person", "itemId": "provider-item",
             "transcriptionItems": [{"private": "metadata"}], "argumentDeferred": True},
            {"text": "", "speaker": "Room audio", "timestamp": 1700000030, "transcriptionStatus": "missing", "error": "internal error"},
            {"text": "   ", "timestamp": 1700000040},
            {"text": "No timestamp", "timestamp": float("nan")},
        ]
        snapshot = build_report_snapshot(session, 1)
        self.assertEqual(snapshot["transcript"], [
            {"text": "Keep these words.\nAnd this line.", "speaker": "Room audio", "timestamp": 1700000000, "transcriptionStatus": "complete"},
            {"text": "", "speaker": "Room audio", "timestamp": 1700000030, "transcriptionStatus": "missing"},
            {"text": "No timestamp", "speaker": "", "timestamp": None, "transcriptionStatus": "complete"},
        ])
        self.assertNotIn("Keep these words.", str(narrative_evidence(snapshot)))
        previous_hash = snapshot["sourceHash"]
        session.transcript[0]["text"] = "Corrected wording"
        self.assertNotEqual(build_report_snapshot(session, 2)["sourceHash"], previous_hash)
        self.assertEqual(snapshot["transcript"][0]["text"], "Keep these words.\nAnd this line.")

    def test_no_recorded_transcript_has_an_explicit_empty_snapshot(self):
        self.assertEqual(build_report_snapshot(Session(id="empty"), 1)["transcript"], [])

    def test_roster_and_common_ground_are_captured_together(self):
        session = Session(id="snapshot", known_participants={"p1": "client"})
        session.common_ground_history = [{"votes": {"p1": "agree"}}]
        frozen = freeze_report_source(session)
        session.known_participants["p2"] = "new-client"
        session.common_ground_history[0]["votes"]["p1"] = "disagree"
        self.assertEqual(len(frozen.known_participants), 1)
        self.assertEqual(frozen.common_ground_history[0]["votes"]["p1"], "agree")
