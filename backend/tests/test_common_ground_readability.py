import json
from pathlib import Path
import tempfile
import unittest

from backend.tools.compare_common_ground_readability import PLAIN, prepare
from backend.tools.compare_report_models import candidate_request


class CommonGroundReadabilityTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.evidence = self.root / "evidence.json"
        self.report = self.root / "report.json"
        self.evidence.write_text(json.dumps({"opinionSourceHash": "synthetic",
            "opinionGroups": [{"group": "A", "size": 3, "stances": []}],
            "validArgumentIds": [], "arguments": []}))
        self.report.write_text(json.dumps({"status": "draft_ready", "sourceLanguage": "en",
            "opinionLandscape": {"sourceHash": "synthetic"},
            "meta": {"topic": "Fictional library discussion"}}))

    async def test_full_writing_contract_reaches_both_models_without_host_truncation(self):
        dest = self.root / "experiment"
        await prepare(dest, self.evidence, self.report)
        bundle = json.loads((dest / "bundle.json").read_text())
        case = next(c for c in bundle["cases"] if c["arm"] == "plain-language")
        prompt = case["request"]["messages"][0]["content"]
        self.assertTrue(prompt.endswith(PLAIN))
        self.assertNotIn("Include 3-6 recommendations", prompt)
        self.assertIn("Include 3 recommendations", prompt)
        luna = candidate_request(case, "gpt-5.6-luna")
        astra = candidate_request(case, "gpt-6-astra")
        self.assertEqual(luna["messages"], astra["messages"])
        self.assertEqual(luna["response_format"], astra["response_format"])

    async def test_mismatched_clustering_is_rejected_before_preparing_requests(self):
        data = json.loads(self.report.read_text())
        data["opinionLandscape"]["sourceHash"] = "another-vote-snapshot"
        self.report.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, "same frozen source"):
            await prepare(self.root / "experiment", self.evidence, self.report)

    async def test_existing_experiment_cannot_be_overwritten(self):
        dest = self.root / "experiment"
        await prepare(dest, self.evidence, self.report)
        before = (dest / "bundle.json").read_bytes()
        with self.assertRaisesRegex(ValueError, "fresh output directory"):
            await prepare(dest, self.evidence, self.report)
        self.assertEqual(before, (dest / "bundle.json").read_bytes())
