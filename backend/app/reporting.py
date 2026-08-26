from __future__ import annotations

import asyncio
import hashlib
import json
import math
import time
from itertools import combinations
from pathlib import Path


ANALYSIS_VERSION = "story-report-v5"
SUPPORT_VOTES = {"agree", "strongly_agree"}
OPPOSE_VOTES = {"disagree", "strongly_disagree"}
VALID_VOTES = SUPPORT_VOTES | OPPOSE_VOTES | {"neutral"}
MINIMUM_VOTERS_FOR_INSIGHTS = 15
MINIMUM_STATEMENTS_FOR_INSIGHTS = 5
MINIMUM_AVERAGE_RESPONSE_COVERAGE = 0.5
OPINION_ANALYSIS_SCRIPT = Path(__file__).with_name(
    "report-opinion-analysis.mjs"
)


def _rounded(value: float) -> float:
    return round(value, 4)


def _median(values: list[float]) -> float:
    if not values:
        return 0
    ordered = sorted(values)
    midpoint = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[midpoint]
    return (ordered[midpoint - 1] + ordered[midpoint]) / 2


def _data_sufficiency(
    voter_count: int,
    statement_count: int,
    average_coverage: float,
) -> dict:
    reasons = []
    if voter_count < MINIMUM_VOTERS_FOR_INSIGHTS:
        reasons.append("few-voters")
    if statement_count < MINIMUM_STATEMENTS_FOR_INSIGHTS:
        reasons.append("few-statements")
    if average_coverage < MINIMUM_AVERAGE_RESPONSE_COVERAGE:
        reasons.append("low-response-coverage")
    return {
        "status": "limited" if reasons else "sufficient",
        "reasons": reasons,
        "thresholds": {
            "minimumVoters": MINIMUM_VOTERS_FOR_INSIGHTS,
            "minimumStatements": MINIMUM_STATEMENTS_FOR_INSIGHTS,
            "minimumAverageResponseCoverage": (
                MINIMUM_AVERAGE_RESPONSE_COVERAGE
            ),
        },
    }


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
    neutral_rate = counts["neutral"] / responded if responded else 0
    oppose_rate = oppose / responded if responded else 0
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
        "missing": max(0, voter_count - responded),
        "supportRate": _rounded(support_rate),
        "neutralRate": _rounded(neutral_rate),
        "opposeRate": _rounded(oppose_rate),
        "directionalSupportRate": _rounded(directional_support_rate),
        "coverageRate": _rounded(coverage_rate),
        "evidenceScore": _rounded(support_rate * coverage_rate),
    }


def _analysis_summary(results: list[dict], voter_count: int) -> dict:
    response_count = sum(result["responded"] for result in results)
    possible_responses = voter_count * len(results)
    support_count = sum(result["support"] for result in results)
    neutral_count = sum(result["neutral"] for result in results)
    oppose_count = sum(result["oppose"] for result in results)
    coverage_rates = [result["coverageRate"] for result in results]
    low_reach_rate = 0.5

    neutral_follow_up = sorted(
        (result for result in results if result["responded"] > 0),
        key=lambda result: (
            -result["neutralRate"],
            -result["responded"],
            result["id"],
        ),
    )[:5]
    low_coverage = [
        result for result in results
        if result["coverageRate"] < low_reach_rate
    ]
    medium_coverage = [
        result for result in results
        if low_reach_rate <= result["coverageRate"] < 0.75
    ]
    high_coverage = [
        result for result in results
        if result["coverageRate"] >= 0.75
    ]
    coverage_segments = []
    segment_count = min(3, len(results))
    for segment_index in range(segment_count):
        start = math.floor(
            segment_index * len(results) / segment_count
        )
        end = math.floor(
            (segment_index + 1) * len(results) / segment_count
        )
        segment_results = results[start:end]
        if not segment_results:
            continue
        segment_responses = sum(
            result["responded"] for result in segment_results
        )
        segment_possible = voter_count * len(segment_results)
        coverage_segments.append({
            "segment": segment_index + 1,
            "startStatement": start + 1,
            "endStatement": end,
            "statementIds": [
                result["id"] for result in segment_results
            ],
            "averageResponses": _rounded(
                segment_responses / len(segment_results)
            ),
            "averageRate": _rounded(
                segment_responses / segment_possible
                if segment_possible else 0
            ),
        })

    return {
        "voteDistribution": {
            "support": support_count,
            "neutral": neutral_count,
            "oppose": oppose_count,
            "responses": response_count,
            "possibleResponses": possible_responses,
            "missing": max(0, possible_responses - response_count),
            "supportRate": _rounded(
                support_count / response_count if response_count else 0
            ),
            "neutralRate": _rounded(
                neutral_count / response_count if response_count else 0
            ),
            "opposeRate": _rounded(
                oppose_count / response_count if response_count else 0
            ),
        },
        "neutralFollowUp": {
            "statementIds": [result["id"] for result in neutral_follow_up],
            "lowReachThresholdRate": low_reach_rate,
            "lowReachThresholdResponses": (
                math.ceil(voter_count * low_reach_rate) if voter_count else 0
            ),
        },
        "responseCoverage": {
            "statementIds": [result["id"] for result in results],
            "averageRate": _rounded(
                response_count / possible_responses if possible_responses else 0
            ),
            "medianRate": _rounded(_median(coverage_rates)),
            "highestRate": _rounded(max(coverage_rates, default=0)),
            "lowestRate": _rounded(min(coverage_rates, default=0)),
            "highCoverageStatementIds": [
                result["id"] for result in high_coverage
            ],
            "mediumCoverageStatementIds": [
                result["id"] for result in medium_coverage
            ],
            "lowCoverageStatementIds": [
                result["id"] for result in low_coverage
            ],
            "lowReachThresholdRate": low_reach_rate,
            "segments": coverage_segments,
        },
    }


def _overlap_result(
    left,
    right,
    result_by_id: dict,
    voter_count: int,
) -> dict | None:
    minimum_joint = max(2, math.ceil(voter_count * 0.2))
    shared_voters = set(left.votes) & set(right.votes)
    joint = [
        participant_id
        for participant_id in shared_voters
        if left.votes.get(participant_id) in VALID_VOTES
        and right.votes.get(participant_id) in VALID_VOTES
    ]
    if len(joint) < minimum_joint:
        return None

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
        return None
    score = both_rate * min(
        left_result["coverageRate"],
        right_result["coverageRate"],
    )
    return {
        "leftStatementId": left.id,
        "rightStatementId": right.id,
        "jointResponses": len(joint),
        "both": both,
        "leftOnly": left_only,
        "rightOnly": right_only,
        "neither": neither,
        "bothRate": _rounded(both_rate),
        "score": _rounded(score),
    }


def _overlap_candidates(
    statements: list,
    statement_results: list,
    voter_count: int,
) -> list:
    if voter_count < 2:
        return []

    result_by_id = {result["id"]: result for result in statement_results}
    candidates = []
    for left, right in combinations(statements, 2):
        candidate = _overlap_result(
            left,
            right,
            result_by_id,
            voter_count,
        )
        if candidate:
            candidates.append(candidate)

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


def build_selected_overlaps(session, pair_specs: list[dict]) -> list[dict]:
    """Calculate aggregate overlap for editorially selected both-and pairs."""
    statements = [
        statement for statement in session.statements if statement.approved
    ]
    statement_by_id = {
        str(statement.id): statement for statement in statements
    }
    voter_ids = {
        participant_id
        for statement in statements
        for participant_id, vote in statement.votes.items()
        if vote in VALID_VOTES
    }
    voter_count = len(voter_ids)
    result_by_id = {
        result["id"]: result
        for result in (
            _statement_result(statement, voter_count)
            for statement in statements
        )
    }
    selected = []
    seen_pairs = set()
    for spec in pair_specs[:3]:
        left_id = str(spec.get("leftStatementId") or "")
        right_id = str(spec.get("rightStatementId") or "")
        pair_key = tuple(sorted((left_id, right_id)))
        if (
            not left_id
            or not right_id
            or left_id == right_id
            or pair_key in seen_pairs
            or left_id not in statement_by_id
            or right_id not in statement_by_id
        ):
            continue
        overlap = _overlap_result(
            statement_by_id[left_id],
            statement_by_id[right_id],
            result_by_id,
            voter_count,
        )
        if not overlap:
            continue
        overlap["title"] = str(spec.get("title") or "").strip()
        overlap["explanation"] = str(
            spec.get("explanation") or ""
        ).strip()
        selected.append(overlap)
        seen_pairs.add(pair_key)
    return selected


def _public_common_ground(history: list) -> dict | None:
    if not history:
        return None
    item = next(
        (
            candidate
            for candidate in reversed(history)
            if candidate.get("status") == "endorsed"
        ),
        history[-1],
    )
    participant_votes = item.get("participantVotes") or {}
    agree = sum(1 for value in participant_votes.values() if value.get("vote") == "agree")
    disagree = sum(1 for value in participant_votes.values() if value.get("vote") == "disagree")
    excluded = {
        "participantVotes",
        "generatedBy",
        "generatedByName",
        "endorsedBy",
        "endorsedByName",
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

    analysis_summary = _analysis_summary(results, voter_count)
    total_responses = analysis_summary["voteDistribution"]["responses"]
    response_coverage = analysis_summary["responseCoverage"]["averageRate"]
    overlap = _overlap_candidates(statements, results, voter_count)
    key_statement_ids = [
        result["id"] for result in common_ground[:7]
    ]
    for statement_id in analysis_summary["neutralFollowUp"]["statementIds"]:
        if statement_id not in key_statement_ids:
            key_statement_ids.append(statement_id)
        if len(key_statement_ids) == 8:
            break
    now = time.time()

    return {
        "schemaVersion": 2,
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
            "keyStatementIds": key_statement_ids,
            "commonGroundStatementIds": [
                result["id"] for result in common_ground[:5]
            ],
            "openQuestionStatementIds": [
                result["id"] for result in open_questions[:4]
            ],
            "neutralFollowUpStatementIds": (
                analysis_summary["neutralFollowUp"]["statementIds"]
            ),
            "overlaps": overlap,
        },
        "analysis": analysis_summary,
        "evidence": {
            "statements": results,
            "minimumEvidenceResponses": minimum_evidence,
            "dataSufficiency": _data_sufficiency(
                voter_count,
                len(statements),
                response_coverage,
            ),
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
            "neutralDefinition": (
                "Neutral is an observed neutral response. Missing responses "
                "remain missing and are never counted as neutral."
            ),
            "overlapDefinition": (
                "Overlap includes only people who answered both statements. "
                "Support means agree or strongly agree; neutral and disagreement "
                "count as not supporting that statement in this comparison."
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
        "neutralFollowUp": selected(
            story.get("neutralFollowUpStatementIds", [])
        ),
        "keyStatements": selected(
            story.get("keyStatementIds", [])
        ),
        "statements": [
            {
                "id": statement["id"],
                "text": statement["text"],
                "order": index + 1,
                "responded": statement["responded"],
                "support": statement["support"],
                "neutral": statement["neutral"],
                "oppose": statement["oppose"],
                "counts": statement["counts"],
                "supportRate": statement["supportRate"],
                "neutralRate": statement["neutralRate"],
                "opposeRate": statement["opposeRate"],
                "coverageRate": statement["coverageRate"],
            }
            for index, statement in enumerate(statements)
        ],
        "analysis": snapshot.get("analysis", {}),
        "opinionLandscape": landscape,
        "commonGroundProposal": snapshot.get("commonGroundProposal"),
    }
