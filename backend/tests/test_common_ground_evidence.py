"""Missing citations must never turn into invented evidence links."""
from copy import deepcopy
import unittest

from backend.app.analysis import AnalysisService, CG_EVIDENCE_VERSION


class CommonGroundEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.service = AnalysisService.__new__(AnalysisService)
        self.evidence = {"validArgumentIds": ["a1", "a2"],
                         "argumentIdMap": {"a1": "statement-1", "a2": "statement-2"}}

    def normalize(self, recommendations, conditions=None):
        return self.service._normalize_common_ground({
            "groupStatement": "A proposal for further review.",
            "recommendations": recommendations,
            "essentialConditions": conditions or [],
        }, "policy", self.evidence)

    def test_missing_or_invalid_required_evidence_rejects_draft(self):
        for item in ["Legacy uncited text", {"text": "Missing citation"},
                     {"text": "Wrong citation", "evidenceIds": ["invented"]},
                     {"text": "Empty citation", "evidenceIds": []}]:
            with self.subTest(item=item):
                self.assertIsNone(self.normalize([item]))

    def test_valid_items_survive_without_attaching_evidence_to_invalid_items(self):
        valid = {"id": "r1", "text": "Keep access open", "evidenceIds": ["a2", "invented", "a2"]}
        source = deepcopy(valid)
        result = self.normalize([valid, {"text": "Unsupported promise"}],
                                [{"text": "Uncited condition"}])
        self.assertEqual(result["recommendations"], [
            {"id": "r1", "text": "Keep access open", "evidenceIds": ["statement-2"]}])
        self.assertEqual(result["essentialConditions"], [])
        self.assertEqual(result["status"], "working_draft")
        self.assertEqual(result["evidenceVersion"], CG_EVIDENCE_VERSION)
        self.assertNotIn("endorsement", result)
        self.assertEqual(valid, source)

    def test_prior_feedback_citation_is_preserved(self):
        self.evidence["previousFeedback"] = [{"versionId": "prior", "validFeedbackIds": ["fb1"]}]
        result = self.normalize([{"text": "Address the recorded concern", "evidenceIds": ["fb1"]}])
        self.assertEqual(result["recommendations"][0]["evidenceIds"], ["fb1"])

    def test_optional_uncited_questions_do_not_gain_a_citation(self):
        result = self.service._normalize_cited_items(["What access hours would work?"],
            valid_ids={"a1"}, require_evidence=False, id_prefix="u")
        self.assertEqual(result[0]["evidenceIds"], [])
