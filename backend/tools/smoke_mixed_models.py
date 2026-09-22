"""Exercise the actual mixed-model SDK path on fictional sessions only.

No database, report publication or production configuration is used. API calls
are billable; the key is read only from the explicitly selected local file.
"""
import argparse
import asyncio
from copy import deepcopy
import json
from pathlib import Path

from dotenv import dotenv_values
import httpx
from openai import OpenAI

from backend.app.analysis import AnalysisService
from backend.app.model_routing import MODEL_ROUTING_VERSION
from backend.app.opinion_themes import OpinionThemeService
from backend.app.policy_evidence import build_anonymous_policy_feedback, build_policy_evidence
from backend.app.reporting import build_opinion_landscape, build_report_snapshot, freeze_report_source, narrative_evidence
from backend.tools.compare_report_models import digest, write_json
from backend.tools.model_experiment_fixtures import scenarios


async def smoke(dest, key_file):
    if dest.exists():
        raise ValueError("Use a new output directory to preserve previous test results.")
    key = dotenv_values(key_file).get("OPENAI_API_KEY")
    if not key or key == "your-key-here":
        raise ValueError("Configure the explicit local API key file first.")
    dest.mkdir(parents=True)
    traces, current = [], {"stage": "", "scenario": ""}

    def record(response):
        response.read()
        request = json.loads(response.request.content)
        body = response.json() if response.is_success else {}
        trace = {**current, "request": request, "response": body,
                 "status": response.status_code, "model": request["model"],
                 "inputHash": digest(request["messages"])}
        traces.append(trace)
        write_json(dest / "requests.json", traces)

    client = OpenAI(api_key=key, base_url="https://api.openai.com/v1",
                    http_client=httpx.Client(event_hooks={"response": [record]}))
    service = AnalysisService.__new__(AnalysisService)
    service._client, service._mock = client, False
    summaries = []
    try:
        for case in scenarios():
            if case["id"] not in ("traffic", "library-en", "library-zh"):
                continue
            source = freeze_report_source(case["session"])
            current["scenario"] = case["id"]
            original_votes = deepcopy([s.votes for s in source.statements])
            original_history = deepcopy(source.common_ground_history)
            snapshot = build_report_snapshot(source, 1)
            saved_proposal = deepcopy(snapshot["commonGroundProposal"])
            landscape = await build_opinion_landscape(source)
            turns = source.transcript
            current["stage"] = "extraction"
            extracted = await service.extract_arguments(turns[-3:], turns[-11:-3],
                [s.text for s in source.statements], source.topic, source.language)
            if extracted is None:
                raise RuntimeError(f"{case['id']}: extraction failed")
            write_json(dest / f"{case['id']}-extracted.json", extracted)
            current["stage"] = "common-ground"
            policy = build_policy_evidence(source, landscape)
            policy["previousFeedback"] = build_anonymous_policy_feedback(source.common_ground_history)
            common = await service.generate_common_ground(policy, source.topic, source.language, mode="policy")
            if not common or common.get("status") != "working_draft":
                raise RuntimeError(f"{case['id']}: no unapproved common-ground draft")
            write_json(dest / f"{case['id']}-new-common-ground.json", common)
            current["stage"] = "themes"
            themes = OpinionThemeService(service.generate_opinion_themes)
            try:
                snapshot["opinionLandscape"] = await themes.enrich(source, landscape, wait=True)
            finally:
                await themes.close()
            theme_result = snapshot["opinionLandscape"].get("themes", {})
            if theme_result.get("status") != "ready" or not theme_result.get("generation"):
                raise RuntimeError(f"{case['id']}: themes did not complete")
            current["stage"] = "report"
            narrative = await service.generate_report_narrative(narrative_evidence(snapshot), source.language)
            if not narrative:
                raise RuntimeError(f"{case['id']}: report did not complete")
            snapshot["narrative"] = {source.language: narrative}
            assert snapshot["status"] == "draft_ready"
            assert snapshot["commonGroundProposal"] == saved_proposal
            assert source.common_ground_history == original_history
            assert [s.votes for s in source.statements] == original_votes
            write_json(dest / f"{case['id']}-report.json", snapshot)
            summary = {"scenario": case["id"], "language": source.language,
                       "routingVersion": MODEL_ROUTING_VERSION, "extractedStatements": len(extracted),
                       "groupDescriptions": len(theme_result.get("groups", [])),
                       "commonGround": common["generation"], "report": narrative["generation"],
                       "themes": theme_result["generation"], "savedApprovalPreserved": True}
            summaries.append(summary)
            write_json(dest / "summary.json", summaries)
            print(f"{case['id']}: mixed SDK pipeline passed; saved proposal and votes preserved", flush=True)
        # These older extraction entry points and generic common ground share the
        # routing but were outside the original policy-only comparison matrix.
        current.update(scenario="additional-api-paths", stage="legacy-extraction")
        utterance = {"speaker": "Fictional speaker", "text": "Keep a staffed help desk so visitors can get assistance."}
        batch = await service.extract_statements([utterance], [], "Library access", "en")
        single = await service.extract_turn_statement(utterance, [], "Library access", "en")
        if not batch or not single:
            raise RuntimeError("Legacy extraction did not produce its expected substantive statement")
        current["stage"] = "generic-common-ground"
        generic = await service.generate_common_ground({"voterCount": 10, "consensus": [
            {"text": "Keep a staffed help desk", "agree": 10, "disagree": 0}], "groups": []},
            "Fictional library access discussion", "en", mode="generic")
        if not generic:
            raise RuntimeError("Generic common ground failed")
        write_json(dest / "additional-paths.json", {"batchExtraction": batch, "turnExtraction": single, "genericCommonGround": generic})
    finally:
        client.close()
    print(f"Completed {len(traces)} live SDK requests. All artifacts are synthetic local drafts.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=Path("outputs/mixed-model-smoke"))
    parser.add_argument("--key-file", type=Path, default=Path(".env.model-experiments"))
    options = parser.parse_args()
    asyncio.run(smoke(options.output_dir, options.key_file))
