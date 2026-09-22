import asyncio
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

import httpx

from backend.app.policy_evidence import build_policy_evidence
from backend.tools.compare_report_models import (
    MODELS, audit_raw, candidate_request, digest, estimated_cost, invoke, response_stub, run, source_hashes, write_json,
)
from backend.tools.model_experiment_fixtures import scenarios


class ModelExperimentTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.fixture = scenarios()[0]
        self.args = {"analysis": build_policy_evidence(self.fixture["session"]),
                     "topic": "Fictional traffic discussion", "language": "en", "mode": "policy"}
        request, _ = await invoke("common-ground", self.args)
        self.case = {"id": "traffic--common-ground--production", "scenario": "traffic",
                     "stage": "common-ground", "arm": "production", "args": self.args,
                     "productionRequest": request, "request": request,
                     "inputHash": digest({"messages": request["messages"], "response_format": request["response_format"]})}
        self.bundle = {"models": MODELS, "scenarios": [], "cases": [self.case]}
        self.bundle["bundleHash"] = digest(self.bundle)
        write_json(self.root / "bundle.json", self.bundle)
        (self.root / "key.env").write_text("OPENAI_API_KEY=synthetic-test-key\n")
        self.raw = {"groupStatement": "Keep access open while discussing a trial.",
                    "recommendations": [{"id": "r1", "text": "Protect shop access.", "evidenceIds": ["a1"]}],
                    "essentialConditions": [], "tradeoffs": [], "unresolvedQuestions": []}

    async def execute(self, max_calls=3):
        await run(self.root, scenario_ids=[], stage_ids=["common-ground"], arms=["production"],
                  models=list(MODELS), repeats=1, max_calls=max_calls, key_file=self.root / "key.env")

    def test_candidate_inputs_identical_but_compatible_parameters_recorded(self):
        original = deepcopy(self.case)
        requests = [candidate_request(self.case, m) for m in MODELS]
        for request in requests:
            self.assertEqual(request["messages"], requests[0]["messages"])
            self.assertEqual(request["response_format"], requests[0]["response_format"])
            self.assertFalse(request["store"])
            self.assertEqual(request["max_completion_tokens"], 8000)
        self.assertNotIn("temperature", requests[-1])
        self.assertEqual(requests[-1]["reasoning_effort"], "low")
        self.assertEqual(self.case, original)

    async def test_flags_original_invalid_citation_even_if_app_repairs_it(self):
        self.raw["recommendations"][0]["evidenceIds"] = ["invented"]
        flags = audit_raw(self.case, self.raw)
        _, normalized = await invoke("common-ground", self.args, response_stub(json.dumps(self.raw)))
        self.assertTrue(any("Invalid" in flag for flag in flags))
        self.assertEqual(normalized["status"], "working_draft")
        self.assertTrue(normalized["recommendations"][0]["evidenceIds"])

    async def test_call_limit_prevents_any_network_request(self):
        with patch("backend.tools.compare_report_models.httpx.AsyncClient") as client:
            with self.assertRaisesRegex(ValueError, "exceed"):
                await self.execute(max_calls=2)
            client.assert_not_called()

    async def test_modified_bundle_prevents_any_network_request(self):
        self.bundle["cases"][0]["inputHash"] = "tampered"
        write_json(self.root / "bundle.json", self.bundle)
        with patch("backend.tools.compare_report_models.httpx.AsyncClient") as client:
            with self.assertRaisesRegex(ValueError, "modified"):
                await self.execute()
            client.assert_not_called()

    async def test_normalizer_drift_prevents_any_network_request(self):
        self.bundle.pop("bundleHash")
        self.bundle["sourceHashes"] = {**source_hashes(), "analysis.py": "older-code"}
        self.bundle["bundleHash"] = digest(self.bundle)
        write_json(self.root / "bundle.json", self.bundle)
        with patch("backend.tools.compare_report_models.httpx.AsyncClient") as client:
            with self.assertRaisesRegex(ValueError, "validation code changed"):
                await self.execute()
            client.assert_not_called()

    async def test_real_response_replayed_and_resume_does_not_repeat_calls(self):
        response = httpx.Response(200, json={"id": "synthetic-response", "model": "test-model",
            "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(self.raw)}}],
            "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150}})
        with patch("backend.tools.compare_report_models.httpx.AsyncClient") as factory:
            client = factory.return_value.__aenter__.return_value
            client.post = AsyncMock(return_value=response)
            await self.execute()
            self.assertEqual(client.post.await_count, 3)
            await self.execute()
            self.assertEqual(client.post.await_count, 3)
        results = [json.loads(p.read_text()) for p in (self.root / "results").glob("*.json")]
        self.assertTrue(all(r["status"] == "generated" and r["humanReview"] == "pending" for r in results))
        self.assertTrue(all(r["normalized"]["status"] == "working_draft" for r in results))
        self.assertNotIn("synthetic-test-key", (self.root / "index.html").read_text())

    async def test_truncated_response_is_never_accepted(self):
        response = httpx.Response(200, json={"choices": [{"finish_reason": "length",
            "message": {"content": json.dumps(self.raw)}}]})
        with patch("backend.tools.compare_report_models.httpx.AsyncClient") as factory:
            factory.return_value.__aenter__.return_value.post = AsyncMock(return_value=response)
            await self.execute()
        results = [json.loads(p.read_text()) for p in (self.root / "results").glob("*.json")]
        self.assertTrue(all(r["status"] == "incomplete" and "normalized" not in r for r in results))

    async def test_simultaneous_runners_do_not_duplicate_billed_calls(self):
        response = httpx.Response(200, json={"choices": [{"finish_reason": "stop",
            "message": {"content": json.dumps(self.raw)}}]})
        with patch("backend.tools.compare_report_models.httpx.AsyncClient") as factory:
            post = factory.return_value.__aenter__.return_value.post = AsyncMock(return_value=response)
            await asyncio.gather(self.execute(), self.execute())
            self.assertEqual(post.await_count, 3)

    def test_fictional_rosters_and_evidence_counts_reconcile(self):
        for case in scenarios():
            session = case["session"]
            evidence = build_policy_evidence(session)
            self.assertEqual(evidence["rosterSize"], len(session.known_participants))
            for s in evidence["arguments"]:
                self.assertEqual(s["support"] + s["neutrality"] + s["opposition"] + s["missing"], evidence["rosterSize"])
            self.assertTrue(session.transcript)

    def test_cost_estimate_does_not_double_count_cached_or_written_tokens(self):
        result = {"model": "gpt-6-astra", "usage": {"prompt_tokens": 1000, "completion_tokens": 100,
                  "prompt_tokens_details": {"cached_tokens": 400, "cache_write_tokens": 500}}}
        self.assertAlmostEqual(estimated_cost(result), (100*10 + 400*1 + 500*12.5 + 100*50)/1_000_000)
        result["usage"]["prompt_tokens_details"]["cached_tokens"] = 600
        self.assertIsNone(estimated_cost(result))
