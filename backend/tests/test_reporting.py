import json
import unittest
from types import SimpleNamespace

from backend.app.reporting import (
    build_report_snapshot,
    build_selected_overlaps,
    narrative_evidence,
)


class ReportSnapshotAnalysisTests(unittest.TestCase):
    def setUp(self):
        def statement(**values):
            return SimpleNamespace(custom=False, **values)

        self.session = SimpleNamespace(
            id="session-report",
            topic="A test deliberation",
            language="en",
            created_at=1_700_000_000,
            known_participants={},
            participants={},
            common_ground_history=[],
            statements=[
                statement(
                    id="s1",
                    text="Statement one",
                    approved=True,
                    votes={
                        "private-p1": "neutral",
                        "private-p2": "neutral",
                        "private-p3": "agree",
                        "private-p4": "disagree",
                    },
                ),
                statement(
                    id="s2",
                    text="Statement two",
                    approved=True,
                    votes={
                        "private-p1": "neutral",
                        "private-p2": "agree",
                    },
                ),
                statement(
                    id="s3",
                    text="Statement three",
                    approved=True,
                    votes={
                        "private-p1": "neutral",
                        "private-p2": "neutral",
                        "private-p3": "neutral",
                    },
                ),
                statement(
                    id="s4",
                    text="Statement four",
                    approved=True,
                    votes={"private-p1": "strongly_agree"},
                ),
            ],
        )

    def test_snapshot_includes_full_response_and_coverage_analysis(self):
        snapshot = build_report_snapshot(self.session, version=1)
        by_id = {
            statement["id"]: statement
            for statement in snapshot["evidence"]["statements"]
        }

        self.assertEqual(snapshot["schemaVersion"], 2)
        self.assertEqual(by_id["s1"]["missing"], 0)
        self.assertEqual(by_id["s2"]["missing"], 2)
        self.assertEqual(by_id["s1"]["neutralRate"], 0.5)
        self.assertEqual(by_id["s1"]["opposeRate"], 0.25)

        distribution = snapshot["analysis"]["voteDistribution"]
        self.assertEqual(
            {
                "support": distribution["support"],
                "neutral": distribution["neutral"],
                "oppose": distribution["oppose"],
                "responses": distribution["responses"],
                "missing": distribution["missing"],
            },
            {
                "support": 3,
                "neutral": 6,
                "oppose": 1,
                "responses": 10,
                "missing": 6,
            },
        )
        self.assertEqual(distribution["supportRate"], 0.3)
        self.assertEqual(distribution["neutralRate"], 0.6)
        self.assertEqual(distribution["opposeRate"], 0.1)

        self.assertEqual(
            snapshot["story"]["neutralFollowUpStatementIds"][:3],
            ["s3", "s1", "s2"],
        )
        coverage = snapshot["analysis"]["responseCoverage"]
        self.assertEqual(coverage["averageRate"], 0.625)
        self.assertEqual(coverage["medianRate"], 0.625)
        self.assertEqual(coverage["highestRate"], 1.0)
        self.assertEqual(coverage["lowestRate"], 0.25)
        self.assertEqual(coverage["lowCoverageStatementIds"], ["s4"])
        self.assertEqual(
            [
                segment["averageResponses"]
                for segment in coverage["segments"]
            ],
            [4.0, 2.0, 2.0],
        )

    def test_editorial_overlap_pair_uses_exact_ballots(self):
        def statement(statement_id, votes):
            return SimpleNamespace(
                id=statement_id,
                text=statement_id,
                approved=True,
                custom=False,
                votes=votes,
            )

        session = SimpleNamespace(statements=[
            statement("left", {
                "p1": "agree",
                "p2": "strongly_agree",
                "p3": "agree",
                "p4": "disagree",
            }),
            statement("right", {
                "p1": "agree",
                "p2": "agree",
                "p3": "neutral",
                "p4": "disagree",
            }),
        ])
        overlaps = build_selected_overlaps(session, [
            {
                "title": "Prevention and redress",
                "leftStatementId": "left",
                "rightStatementId": "right",
                "explanation": "Two complementary approaches.",
            },
            {
                "title": "Duplicate reversed",
                "leftStatementId": "right",
                "rightStatementId": "left",
                "explanation": "Should be ignored.",
            },
        ])

        self.assertEqual(len(overlaps), 1)
        self.assertEqual(overlaps[0]["title"], "Prevention and redress")
        self.assertEqual(overlaps[0]["jointResponses"], 4)
        self.assertEqual(overlaps[0]["both"], 2)
        self.assertEqual(overlaps[0]["leftOnly"], 1)
        self.assertEqual(overlaps[0]["rightOnly"], 0)
        self.assertEqual(overlaps[0]["neither"], 1)
        self.assertEqual(overlaps[0]["bothRate"], 0.5)

    def test_narrative_evidence_has_parity_fields_without_participant_ids(self):
        snapshot = build_report_snapshot(self.session, version=1)
        evidence = narrative_evidence(snapshot)

        self.assertIn("analysis", evidence)
        self.assertEqual(
            [item["id"] for item in evidence["neutralFollowUp"][:3]],
            ["s3", "s1", "s2"],
        )
        self.assertEqual(evidence["statements"][0]["neutralRate"], 0.5)
        self.assertEqual(evidence["statements"][0]["opposeRate"], 0.25)

        serialized = json.dumps(snapshot)
        for participant_id in (
            "private-p1",
            "private-p2",
            "private-p3",
            "private-p4",
        ):
            self.assertNotIn(participant_id, serialized)

    def test_snapshot_prefers_endorsed_common_ground_and_keeps_it_anonymous(self):
        self.session.common_ground_history = [
            {
                "id": "endorsed-version",
                "status": "endorsed",
                "mode": "policy",
                "groupStatement": "The package participants carried forward.",
                "recommendations": [{"id": "r1", "text": "Train workers."}],
                "essentialConditions": [{"id": "c1", "text": "Keep human oversight."}],
                "unresolvedQuestions": [{"id": "u1", "text": "Who funds access?"}],
                "participantVotes": {
                    "private-p1": {"vote": "agree", "name": "Private One"},
                    "private-p2": {
                        "vote": "disagree",
                        "name": "Private Two",
                        "reason": "Access still needs work.",
                    },
                },
                "endorsedBy": "private-host",
                "endorsedByName": "Private Host",
                "endorsement": {
                    "agree": 1,
                    "disagree": 1,
                    "total": 2,
                    "respondentCount": 2,
                    "rosterSize": 4,
                    "remainingConcerns": [{"reason": "Access still needs work."}],
                },
            },
            {
                "id": "newer-draft",
                "status": "working_draft",
                "groupStatement": "A newer draft that was not endorsed.",
                "participantVotes": {},
            },
        ]

        snapshot = build_report_snapshot(self.session, version=1)
        proposal = snapshot["commonGroundProposal"]
        serialized = json.dumps(proposal)

        self.assertEqual(proposal["id"], "endorsed-version")
        self.assertEqual(proposal["votes"], {"agree": 1, "disagree": 1, "total": 2})
        self.assertEqual(proposal["essentialConditions"][0]["text"], "Keep human oversight.")
        self.assertEqual(
            proposal["endorsement"]["remainingConcerns"],
            [{"reason": "Access still needs work."}],
        )
        for private_value in (
            "private-p1",
            "private-p2",
            "private-host",
            "Private One",
            "Private Two",
            "Private Host",
        ):
            self.assertNotIn(private_value, serialized)


if __name__ == "__main__":
    unittest.main()
