import unittest

from backend.app.analysis import AnalysisService


class ReportNarrativeNormalizationTests(unittest.TestCase):
    def setUp(self):
        self.service = AnalysisService()
        self.evidence = {
            "statements": [
                {"id": "s1", "text": "One"},
                {"id": "s2", "text": "Two"},
            ],
            "opinionLandscape": {
                "tendencies": {
                    "profiles": [
                        {"tendencyId": 1},
                        {"tendencyId": 2},
                    ]
                }
            },
        }

    def test_rejects_unverifiable_references_and_unknown_tendencies(self):
        narrative = self.service._normalize_report_narrative(
            {
                "headline": "A grounded headline",
                "standfirst": "A grounded summary.",
                "overviewEvidenceStatementIds": ["s1", "invented"],
                "keyStatementIds": ["s2", "invented", "s2", "s1"],
                "takeaways": [
                    {
                        "title": "Supported",
                        "explanation": "Linked to evidence.",
                        "evidenceStatementIds": ["s1", "invented"],
                    },
                    {
                        "title": "Unsupported",
                        "explanation": "No valid evidence.",
                        "evidenceStatementIds": ["invented"],
                    },
                ],
                "principles": [
                    {
                        "title": f"Principle {index}",
                        "explanation": "Grounded principle.",
                        "evidenceStatementIds": ["s1"],
                    }
                    for index in range(5)
                ],
                "actionAreas": [
                    {
                        "title": f"Action {index}",
                        "explanation": "Grounded action.",
                        "evidenceStatementIds": ["s2"],
                    }
                    for index in range(7)
                ] + [
                    {
                        "title": "Unsupported action",
                        "explanation": "No valid evidence.",
                        "evidenceStatementIds": ["invented"],
                    }
                ],
                "overlapPairs": [
                    {
                        "title": "A real both-and",
                        "leftStatementId": "s1",
                        "rightStatementId": "s2",
                        "explanation": "The approaches can reinforce each other.",
                    },
                    {
                        "title": "Duplicate reversed",
                        "leftStatementId": "s2",
                        "rightStatementId": "s1",
                        "explanation": "Should be discarded.",
                    },
                    {
                        "title": "Invented pair",
                        "leftStatementId": "s1",
                        "rightStatementId": "invented",
                        "explanation": "Should be discarded.",
                    },
                ],
                "dimensions": [
                    {
                        "axis": 1,
                        "label": "Different emphases",
                        "negativeLabel": "One end",
                        "positiveLabel": "Other end",
                        "explanation": "A valid dimension.",
                        "evidenceStatementIds": ["s2"],
                    },
                    {
                        "axis": 3,
                        "label": "Invalid axis",
                        "negativeLabel": "One end",
                        "positiveLabel": "Other end",
                        "explanation": "Should be discarded.",
                        "evidenceStatementIds": ["s1"],
                    },
                ],
                "tendencies": [
                    {
                        "tendencyId": 1,
                        "title": "Known tendency",
                        "description": "Grounded description.",
                        "evidenceStatementIds": ["s1"],
                    },
                    {
                        "tendencyId": 99,
                        "title": "Invented tendency",
                        "description": "Should be discarded.",
                        "evidenceStatementIds": ["s1"],
                    },
                ],
                "implications": [
                    {
                        "title": f"Implication {index}",
                        "explanation": "Grounded implication.",
                        "evidenceStatementIds": ["s1"],
                    }
                    for index in range(6)
                ],
                "limitations": [
                    {
                        "title": f"Limitation {index}",
                        "explanation": "Grounded limitation.",
                        "evidenceStatementIds": ["s2"],
                    }
                    for index in range(6)
                ],
            },
            self.evidence,
        )

        self.assertEqual(
            narrative["takeaways"][0]["evidenceStatementIds"],
            ["s1"],
        )
        self.assertEqual(
            narrative["overviewEvidenceStatementIds"],
            ["s1"],
        )
        self.assertEqual(narrative["keyStatementIds"], ["s2", "s1"])
        self.assertEqual(len(narrative["overlapPairs"]), 1)
        self.assertEqual(
            narrative["overlapPairs"][0]["leftStatementId"],
            "s1",
        )
        self.assertEqual(len(narrative["takeaways"]), 1)
        self.assertEqual(len(narrative["principles"]), 3)
        self.assertEqual(len(narrative["actionAreas"]), 5)
        self.assertEqual(len(narrative["implications"]), 4)
        self.assertEqual(len(narrative["limitations"]), 4)
        self.assertEqual([item["axis"] for item in narrative["dimensions"]], [1])
        self.assertEqual(
            [item["tendencyId"] for item in narrative["tendencies"]],
            [1],
        )

    def test_requires_headline_and_standfirst(self):
        self.assertIsNone(
            self.service._normalize_report_narrative(
                {
                    "headline": "",
                    "standfirst": "Summary",
                    "overviewEvidenceStatementIds": ["s1"],
                },
                self.evidence,
            )
        )

    def test_requires_overview_evidence(self):
        self.assertIsNone(
            self.service._normalize_report_narrative(
                {
                    "headline": "Headline",
                    "standfirst": "Summary",
                    "overviewEvidenceStatementIds": ["invented"],
                },
                self.evidence,
            )
        )


class ExclusiveGroupNarrativeTests(unittest.TestCase):
    def test_keeps_all_seven_groups_without_invented_ids(self):
        service = AnalysisService()
        evidence = {"statements": [{"id": "s1", "text": "Evidence"}],
                    "opinionLandscape": {"membershipKind": "exclusive",
                                         "groups": [{"id": i} for i in range(7)]}}
        result = service._normalize_report_narrative({
            "headline": "Seven patterns", "standfirst": "Synthetic patterns.",
            "overviewEvidenceStatementIds": ["s1"],
            "tendencies": [{"tendencyId": i, "title": f"Group {i}", "description": "A pattern",
                            "evidenceStatementIds": ["s1"]} for i in range(8)],
        }, evidence)
        self.assertEqual([item["tendencyId"] for item in result["tendencies"]], list(range(7)))

    def test_unexpected_larger_snapshots_do_not_truncate_group_descriptions(self):
        service = AnalysisService()
        for count in (8, 12, 30):
            with self.subTest(count=count):
                evidence = {"statements": [{"id": "s1", "text": "Evidence"}],
                            "opinionLandscape": {"membershipKind": "exclusive",
                                                 "groups": [{"id": i} for i in range(count)]}}
                result = service._normalize_report_narrative({
                    "headline": "Patterns", "standfirst": "Synthetic patterns.",
                    "overviewEvidenceStatementIds": ["s1"],
                    "tendencies": [{"tendencyId": i, "title": f"Group {i}", "description": "A pattern",
                                    "evidenceStatementIds": ["s1"]} for i in range(count + 1)],
                }, evidence)
                self.assertEqual([item["tendencyId"] for item in result["tendencies"]], list(range(count)))

    def test_keeps_all_four_group_ids_including_zero(self):
        service = AnalysisService()
        evidence = {"statements": [{"id": "s1", "text": "Evidence"}],
                    "opinionLandscape": {"membershipKind": "exclusive", "status": "provisional",
                                         "groups": [{"id": i} for i in range(4)]}}
        result = service._normalize_report_narrative({
            "headline": "Early patterns", "standfirst": "These groups may change.",
            "overviewEvidenceStatementIds": ["s1"],
            "tendencies": [{"tendencyId": i, "title": f"Group {i}", "description": "A pattern",
                            "evidenceStatementIds": ["s1"]} for i in range(5)],
        }, evidence)
        self.assertEqual([item["tendencyId"] for item in result["tendencies"]], [0, 1, 2, 3])


if __name__ == "__main__":
    unittest.main()
