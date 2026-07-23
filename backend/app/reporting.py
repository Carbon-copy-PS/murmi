from __future__ import annotations

import asyncio
import hashlib
import json
import math
import time
from itertools import combinations
from pathlib import Path


ANALYSIS_VERSION = "story-report-v2"
SUPPORT_VOTES = {"agree", "strongly_agree"}
OPPOSE_VOTES = {"disagree", "strongly_disagree"}
VALID_VOTES = SUPPORT_VOTES | OPPOSE_VOTES | {"neutral"}
OPINION_ANALYSIS_SCRIPT = Path(__file__).with_name(
    "report-opinion-analysis.mjs"
)


def _rounded(value: float) -> float:
    return round(value, 4)


def _source_hash(session, statements: list) -> str:
    source = {
        "sessionId": session.id,
        "topic": session.topic,
        "language": getattr(session, "language", None),
        "statements": [
            {
                "id": statement.id,
                "text": statement.text,
                "votes": sorted(statement.votes.items()),
            }
            for statement in statements
        ],
    }
    encoded = json.dumps(
        source,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _statement_result(statement, voter_count: int) -> dict:
    counts = {
        "strongly_agree": 0,
        "agree": 0,
        "neutral": 0,
        "disagree": 0,
        "strongly_disagree": 0,
    }
    for vote in statement.votes.values():
        if vote in counts:
            counts[vote] += 1

    support = counts["strongly_agree"] + counts["agree"]
    oppose = counts["strongly_disagree"] + counts["disagree"]
    responded = support + oppose + counts["neutral"]
    directional = support + oppose
    support_rate = support / responded if responded else 0
    directional_support_rate = support / directional if directional else 0
    coverage_rate = responded / voter_count if voter_count else 0

    return {
        "id": statement.id,
        "text": statement.text,
        "custom": statement.custom,
        "counts": counts,
        "support": support,
        "oppose": oppose,
        "neutral": counts["neutral"],
        "responded": responded,
        "supportRate": _rounded(support_rate),
        "directionalSupportRate": _rounded(directional_support_rate),
        "coverageRate": _rounded(coverage_rate),
        "evidenceScore": _rounded(support_rate * coverage_rate),
    }


def _overlap_candidates(statements: list, statement_results: list, voter_count: int) -> list:
    if voter_count < 2:
        return []

    result_by_id = {result["id"]: result for result in statement_results}
    minimum_joint = max(2, math.ceil(voter_count * 0.2))
    candidates = []

    for left, right in combinations(statements, 2):
        shared_voters = set(left.votes) & set(right.votes)
        joint = [
            participant_id
            for participant_id in shared_voters
            if left.votes.get(participant_id) in VALID_VOTES
            and right.votes.get(participant_id) in VALID_VOTES
        ]
        if len(joint) < minimum_joint:
            continue

        both = left_only = right_only = neither = 0
        for participant_id in joint:
            supports_left = left.votes[participant_id] in SUPPORT_VOTES
            supports_right = right.votes[participant_id] in SUPPORT_VOTES
            if supports_left and supports_right:
                both += 1
            elif supports_left:
                left_only += 1
            elif supports_right:
                right_only += 1
            else:
                neither += 1

        both_rate = both / len(joint)
        left_result = result_by_id[left.id]
        right_result = result_by_id[right.id]
        if both_rate < 0.25:
            continue
        score = both_rate * min(
            left_result["coverageRate"],
            right_result["coverageRate"],
        )
        candidates.append({
            "leftStatementId": left.id,
            "rightStatementId": right.id,
            "jointResponses": len(joint),
            "both": both,
            "leftOnly": left_only,
            "rightOnly": right_only,
            "neither": neither,
            "bothRate": _rounded(both_rate),
            "score": _rounded(score),
        })

    candidates.sort(key=lambda item: (-item["score"], -item["jointResponses"]))
    selected = []
    used_statement_ids = set()
    for candidate in candidates:
        pair_ids = {
            candidate["leftStatementId"],
            candidate["rightStatementId"],
        }
        if pair_ids & used_statement_ids and len(candidates) > 1:
            continue
        selected.append(candidate)
        used_statement_ids.update(pair_ids)
        if len(selected) == 2:
            break
    return selected


def _public_common_ground(history: list) -> dict | None:
    if not history:
        return None
    item = history[-1]
    participant_votes = item.get("participantVotes") or {}
    agree = sum(1 for value in participant_votes.values() if value.get("vote") == "agree")
    disagree = sum(1 for value in participant_votes.values() if value.get("vote") == "disagree")
    excluded = {
        "participantVotes",
        "generatedBy",
        "generatedByName",
    }
    public = {key: value for key, value in item.items() if key not in excluded}
    public["votes"] = {
        "agree": agree,
        "disagree": disagree,
        "total": agree + disagree,
    }
    return public


def build_report_snapshot(session, version: int) -> dict:
    statements = [statement for statement in session.statements if statement.approved]
    voter_ids = sorted({
        participant_id
        for statement in statements
        for participant_id, vote in statement.votes.items()
        if vote in VALID_VOTES
    })
    voter_count = len(voter_ids)
    results = [_statement_result(statement, voter_count) for statement in statements]
    minimum_evidence = max(2, math.ceil(voter_count * 0.2)) if voter_count else 2

    common_ground = [
        result for result in results
        if result["responded"] >= minimum_evidence and result["supportRate"] >= 0.6
    ]
    common_ground.sort(
        key=lambda result: (
            -result["evidenceScore"],
            -result["supportRate"],
            -result["responded"],
        )
    )

    open_questions = [
        result for result in results
        if (
            result["responded"] >= minimum_evidence
            and result["support"] + result["oppose"] >= 2
            and 0.35 <= result["directionalSupportRate"] <= 0.65
        )
    ]
    open_questions.sort(
        key=lambda result: (
            abs(result["directionalSupportRate"] - 0.5),
            -result["coverageRate"],
        )
    )

    total_responses = sum(result["responded"] for result in results)
    possible_responses = voter_count * len(statements)
    response_coverage = (
        total_responses / possible_responses if possible_responses else 0
    )
    overlap = _overlap_candidates(statements, results, voter_count)
    now = time.time()

    return {
        "schemaVersion": 1,
        "analysisVersion": ANALYSIS_VERSION,
        "version": version,
        "status": "draft_ready",
        "sourceHash": _source_hash(session, statements),
        "sourceLanguage": getattr(session, "language", None) or "en",
        "generatedAt": now,
        "publishedAt": None,
        "meta": {
            "sessionId": session.id,
            "topic": session.topic,
            "createdAt": session.created_at,
            "finalizedAt": now,
            "participantCount": (
                len(session.known_participants) or len(session.participants)
            ),
            "voterCount": voter_count,
            "statementCount": len(statements),
            "responseCount": total_responses,
            "responseCoverageRate": _rounded(response_coverage),
        },
        "story": {
            "takeawayStatementIds": [
                result["id"] for result in common_ground[:3]
            ],
            "commonGroundStatementIds": [
                result["id"] for result in common_ground[:5]
            ],
            "openQuestionStatementIds": [
                result["id"] for result in open_questions[:4]
            ],
            "overlaps": overlap,
        },
        "evidence": {
            "statements": results,
            "minimumEvidenceResponses": minimum_evidence,
        },
        "commonGroundProposal": _public_common_ground(
            session.common_ground_history
        ),
        "methodology": {
            "supportDefinition": (
                "Agree and strongly agree responses are counted as support."
            ),
            "coverageDefinition": (
                "Coverage is the share of voting participants who responded "
                "to a statement."
            ),
            "commonGroundRule": (
                "Statements need at least 60% support and the minimum evidence "
                "threshold for this session."
            ),
            "openQuestionRule": (
                "Open questions have directional support between 35% and 65% "
                "and meet the minimum evidence threshold."
            ),
            "privacy": (
                "The public snapshot contains aggregate counts only and no "
                "participant identifiers or individual ballots."
            ),
        },
    }


async def build_opinion_landscape(session, timeout_seconds: float = 30) -> dict:
    statements = [
        statement for statement in session.statements if statement.approved
    ]
    source = {
        "sessionId": session.id,
        "statements": [
            {
                "id": statement.id,
                "text": statement.text,
                "created_at": statement.created_at,
            }
            for statement in statements
        ],
        "votes": [
            {
                "participant_id": participant_id,
                "statement_id": statement.id,
                "vote": vote,
            }
            for statement in statements
            for participant_id, vote in statement.votes.items()
            if vote in VALID_VOTES
        ],
    }
    if len(statements) < 2 or len({
        vote["participant_id"] for vote in source["votes"]
    }) < 3:
        return {
            "available": False,
            "reason": "insufficient-data",
        }

    try:
        process = await asyncio.create_subprocess_exec(
            "node",
            str(OPINION_ANALYSIS_SCRIPT),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except OSError:
        return {
            "available": False,
            "reason": "analysis-runtime-unavailable",
        }
    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(
                json.dumps(
                    {"source": source},
                    ensure_ascii=False,
                    separators=(",", ":"),
                ).encode("utf-8")
            ),
            timeout=timeout_seconds,
        )
    except asyncio.TimeoutError:
        process.kill()
        await process.communicate()
        return {
            "available": False,
            "reason": "analysis-timeout",
        }
    except Exception:
        if process.returncode is None:
            process.kill()
            await process.communicate()
        return {
            "available": False,
            "reason": "analysis-failed",
        }

    if process.returncode != 0:
        return {
            "available": False,
            "reason": "analysis-failed",
        }
    try:
        result = json.loads(stdout.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {
            "available": False,
            "reason": "invalid-analysis-output",
        }
    serialized = json.dumps(result, ensure_ascii=False)
    forbidden_keys = (
        "participantIndex",
        "participant_id",
        "participantId",
        "assignments",
        "coordinates",
    )
    if any(f'"{key}"' in serialized for key in forbidden_keys):
        return {
            "available": False,
            "reason": "privacy-boundary-failed",
        }
    return result


def narrative_evidence(snapshot: dict) -> dict:
    statements = snapshot.get("evidence", {}).get("statements", [])
    statement_by_id = {
        statement["id"]: statement for statement in statements
    }

    def selected(ids: list) -> list:
        return [
            statement_by_id[statement_id]
            for statement_id in ids
            if statement_id in statement_by_id
        ]

    story = snapshot.get("story", {})
    landscape = snapshot.get("opinionLandscape") or {}
    return {
        "topic": snapshot.get("meta", {}).get("topic"),
        "counts": snapshot.get("meta"),
        "strongestCommonGround": selected(
            story.get("commonGroundStatementIds", [])
        ),
        "openQuestions": selected(
            story.get("openQuestionStatementIds", [])
        ),
        "overlaps": story.get("overlaps", []),
        "statements": [
            {
                "id": statement["id"],
                "text": statement["text"],
                "supportRate": statement["supportRate"],
                "coverageRate": statement["coverageRate"],
            }
            for statement in statements
        ],
        "opinionLandscape": landscape,
        "commonGroundProposal": snapshot.get("commonGroundProposal"),
    }
