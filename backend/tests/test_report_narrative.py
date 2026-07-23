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
        self.assertEqual(len(narrative["takeaways"]), 1)
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


if __name__ == "__main__":
    unittest.main()
