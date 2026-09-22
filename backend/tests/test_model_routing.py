"""Validate the serialized API body through the actual pinned OpenAI SDK."""
import json
import unittest

import httpx
from openai import OpenAI

from backend.app.analysis import AnalysisService
from backend.app.model_routing import MODELS, MODEL_ROUTING_VERSION


class ModelRoutingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.requests = []
        self.finish_reason, self.refusal, self.status = "stop", None, 200
        self.raw = {"arguments": [{"text": "Keep access open.", "sourceIds": ["t1"]}],
                    "statements": ["Keep access open."], "groups": [], "shared": None,
                    "groupStatement": "Keep access open.",
                    "commonGround": [], "divides": [], "insights": [], "bridgingProposal": "",
                    "recommendations": [{"text": "Keep access open.", "evidenceIds": ["a1"]}],
                    "headline": "Access has support", "standfirst": "Respondents support access.",
                    "overviewEvidenceStatementIds": ["s1"]}

        def handle(request):
            body = json.loads(request.content)
            self.requests.append(body)
            if self.status != 200:
                return httpx.Response(self.status, json={"error": {"message": "Synthetic failure", "type": "server_error"}})
            return httpx.Response(200, json={"id": "synthetic", "object": "chat.completion", "created": 1,
                "model": body["model"], "choices": [{"index": 0, "finish_reason": self.finish_reason,
                "message": {"role": "assistant", "content": json.dumps(self.raw), "refusal": self.refusal}}]})

        self.client = OpenAI(api_key="synthetic-unit-key", http_client=httpx.Client(transport=httpx.MockTransport(handle)))
        self.addCleanup(self.client.close)
        self.service = AnalysisService.__new__(AnalysisService)
        self.service._client, self.service._mock = self.client, False
        self.policy = {"validArgumentIds": ["a1"], "argumentIdMap": {"a1": "s1"}}

    async def test_actual_sdk_serializes_selected_models_and_reasoning_settings(self):
        s = self.service
        await s.extract_arguments([{"id": "t1", "text": "Keep access open.", "newText": "Keep access open."}], [], [])
        await s.extract_statements([{"text": "Keep access open."}], [])
        await s.extract_turn_statement({"text": "Keep access open."}, [])
        themes = await s.generate_opinion_themes({"groups": [{"groupId": 0, "statements": []}], "shared": []}, "en")
        cg = await s.generate_common_ground(self.policy, language="en", mode="policy")
        generic = await s.generate_common_ground({}, language="en", mode="generic")
        report = await s.generate_report_narrative({"statements": [{"id": "s1"}], "opinionLandscape": {}}, "en")
        self.assertEqual([r["model"] for r in self.requests], [MODELS["extraction"]] * 3 + [MODELS["themes"], MODELS["common-ground"], MODELS["common-ground"], MODELS["report"]])
        for body in self.requests:
            self.assertEqual(body["reasoning_effort"], "low")
            self.assertEqual(body["max_completion_tokens"], 8000)
            self.assertFalse(body["store"])
            self.assertNotIn("temperature", body)
            self.assertNotIn("max_tokens", body)
            self.assertNotIn("extra_body", body)
        for result in (themes, cg, generic, report):
            self.assertEqual(result["generation"]["routingVersion"], MODEL_ROUTING_VERSION)
        self.assertEqual(cg["status"], "working_draft")
        self.assertNotIn("endorsement", cg)

    async def test_common_ground_rejects_truncation_and_refusal(self):
        for finish, refusal in [("length", None), ("stop", "Declined")]:
            self.finish_reason, self.refusal = finish, refusal
            self.assertIsNone(await self.service.generate_common_ground(self.policy, mode="policy"))

    async def test_failure_does_not_retry_or_fall_back_to_a_different_model(self):
        self.status = 500
        self.assertIsNone(await self.service.generate_report_narrative({"statements": []}, "en"))
        self.assertEqual(len(self.requests), 1)
        self.assertEqual(self.requests[0]["model"], MODELS["report"])

    async def test_both_modes_send_identical_complete_evidence_with_distinct_schemas(self):
        evidence = {**self.policy, 'arguments': [{'id': 'a1', 'text': 'Keep access open.',
                    'support': 2, 'neutrality': 1, 'opposition': 1, 'responded': 4}],
                    'voterCount': 5, 'rosterSize': 6, 'opinionGroups': [], 'coSupport': []}
        self.raw.update(commonGround=['Keep access open.'], divides=['Which hours work?'],
                        bridgingProposal='Compare opening hours.', insights=['Access is shared.'])
        for mode in ('policy', 'generic'):
            result = await self.service.generate_common_ground(evidence, topic='Library access', language='en', mode=mode)
            self.assertIsNotNone(result)
        policy, generic = self.requests
        self.assertEqual(policy['messages'][1], generic['messages'][1])
        self.assertNotEqual(policy['messages'][0], generic['messages'][0])
        self.assertEqual(policy['model'], generic['model'])
        pack = json.loads(generic['messages'][1]['content'])
        self.assertEqual(pack['statements'][0]['unansweredAmongRoster'], 2)
        self.assertEqual(pack['statements'][0]['neutral'], 1)
