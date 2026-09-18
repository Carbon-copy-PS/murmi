"""Policy Common Ground evidence built from approved statements and votes.

Model-facing argument IDs are short aliases (a1, a2, …) mapped back to statement
IDs after generation. Participant names and internal participant IDs are never
included in model-facing payloads.
"""
from __future__ import annotations

AGREE_SET = frozenset({"agree", "strongly_agree"})
DISAGREE_SET = frozenset({"disagree", "strongly_disagree"})
NEUTRAL_SET = frozenset({"neutral"})
GROUP_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _is_agree(v: str | None) -> bool:
    return v in AGREE_SET


def _is_disagree(v: str | None) -> bool:
    return v in DISAGREE_SET


def _pct(n: int, d: int) -> float:
    return round((100.0 * n / d), 1) if d else 0.0


def _statement_stats(statements: list, voters: list[dict], roster_size: int) -> list[dict]:
    stats = []
    for s in statements:
        dist = {
            "strongly_agree": 0,
            "agree": 0,
            "neutral": 0,
            "disagree": 0,
            "strongly_disagree": 0,
        }
        for v in voters:
            val = (v.get("votes") or {}).get(s.id)
            if val in dist:
                dist[val] += 1
        support = dist["strongly_agree"] + dist["agree"]
        opposition = dist["strongly_disagree"] + dist["disagree"]
        neutrality = dist["neutral"]
        responded = support + opposition + neutrality
        missing = max(0, roster_size - responded)
        coverage = _pct(responded, roster_size)
        directed = support + opposition
        support_rate = round(support / directed, 3) if directed else 0.0
        split = round(1 - abs(support_rate - 0.5) * 2, 3) if directed else 0.0
        stats.append({
            "id": s.id,
            "text": s.text,
            "support": support,
            "neutrality": neutrality,
            "opposition": opposition,
            "missing": missing,
            "responded": responded,
            "coveragePct": coverage,
            "supportRate": support_rate,
            "split": split,
            "dist": dist,
        })
    return stats


def _co_support_pairs(statements: list, voters: list[dict], min_shared: int = 2) -> list[dict]:
    """Pairs where the same respondents support both arguments (safe to combine)."""
    pairs = []
    ids = [s.id for s in statements]
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            a, b = ids[i], ids[j]
            both_support = 0
            both_oppose = 0
            conflict = 0
            shared = 0
            for v in voters:
                votes = v.get("votes") or {}
                va, vb = votes.get(a), votes.get(b)
                if va is None or vb is None:
                    continue
                if va in NEUTRAL_SET or vb in NEUTRAL_SET:
                    continue
                shared += 1
                a_agree, b_agree = _is_agree(va), _is_agree(vb)
                a_dis, b_dis = _is_disagree(va), _is_disagree(vb)
                if a_agree and b_agree:
                    both_support += 1
                elif a_dis and b_dis:
                    both_oppose += 1
                elif (a_agree and b_dis) or (a_dis and b_agree):
                    conflict += 1
            if shared < min_shared:
                continue
            support_overlap = round(both_support / shared, 3) if shared else 0.0
            conflict_rate = round(conflict / shared, 3) if shared else 0.0
            pairs.append({
                "argumentIds": [a, b],
                "sharedRespondents": shared,
                "bothSupport": both_support,
                "bothOppose": both_oppose,
                "conflict": conflict,
                "supportOverlap": support_overlap,
                "conflictRate": conflict_rate,
                "safeToCombine": support_overlap >= 0.5 and conflict_rate <= 0.3,
            })
    pairs.sort(key=lambda p: (-p["supportOverlap"], p["conflictRate"]))
    return pairs


def build_policy_evidence(session, landscape=None) -> dict:
    """Build model-facing evidence from approved statements and votes on a Session."""
    approved = [s for s in session.statements if s.approved]
    roster_pids = set(session.known_participants.values()) | set(session.participants.keys())
    # Anyone who voted on any approved statement counts toward the roster.
    for s in approved:
        roster_pids.update(s.votes.keys())
    roster_size = max(len(roster_pids), 1)

    voters = []
    for pid in sorted(roster_pids):
        votes = {s.id: s.votes[pid] for s in approved if pid in s.votes}
        if votes:
            voters.append({"pid": pid, "votes": votes})

    stats = _statement_stats(approved, voters, roster_size)
    groups = []
    for group in (landscape or {}).get("groups", []):
        stances = []
        for statement in group["statements"]:
            responded = statement["responded"]
            lean = "mixed"
            if responded:
                if statement["dist"]["strongly_agree"] / responded > 0.5:
                    lean = "strongly_agree"
                elif statement["agree"] / responded > 0.5:
                    lean = "agree"
                elif statement["dist"]["strongly_disagree"] / responded > 0.5:
                    lean = "strongly_disagree"
                elif statement["disagree"] / responded > 0.5:
                    lean = "disagree"
            stances.append({"argumentId": statement["id"], "lean": lean,
                            "support": statement["agree"], "opposition": statement["disagree"],
                            "neutral": statement["neutral"], "missing": statement["missing"],
                            "responded": responded})
        groups.append({"group": group["letter"], "size": group["size"], "stances": stances})
    co_support = _co_support_pairs(approved, voters)

    # Short aliases are much more reliable for the model than opaque hex statement ids.
    alias_map: dict[str, str] = {}
    real_to_alias: dict[str, str] = {}
    for i, st in enumerate(stats, start=1):
        alias = f"a{i}"
        alias_map[alias] = st["id"]
        real_to_alias[st["id"]] = alias

    arguments = [
        {
            "id": real_to_alias[st["id"]],
            "text": st["text"],
            "support": st["support"],
            "neutrality": st["neutrality"],
            "opposition": st["opposition"],
            "missing": st["missing"],
            "responded": st["responded"],
            "coveragePct": st["coveragePct"],
            "supportRate": st["supportRate"],
            "split": st["split"],
        }
        for st in stats
    ]

    # Group differences: which arguments diverge most across clusters.
    group_differences = []
    if len(groups) >= 2:
        for st in stats:
            leans = []
            for g in groups:
                stance = next((x for x in g["stances"] if x["argumentId"] == st["id"]), None)
                if stance:
                    leans.append({"group": g["group"], "lean": stance["lean"]})
            unique = {x["lean"] for x in leans if x["lean"] != "mixed"}
            if len(unique) >= 2:
                group_differences.append({
                    "argumentId": real_to_alias[st["id"]],
                    "groupLeans": leans,
                })

    opinion_groups = []
    for g in groups:
        stances = []
        for stance in g.get("stances") or []:
            real_id = stance.get("argumentId")
            alias = real_to_alias.get(real_id)
            if not alias:
                continue
            stances.append({**stance, "argumentId": alias})
        opinion_groups.append({
            "group": g["group"],
            "size": g["size"],
            "stances": stances,
        })

    co_support_aliased = []
    for pair in co_support:
        ids = [real_to_alias[rid] for rid in (pair.get("argumentIds") or []) if rid in real_to_alias]
        if len(ids) < 2:
            continue
        co_support_aliased.append({**pair, "argumentIds": ids})

    return {
        "voterCount": len(voters),
        "rosterSize": roster_size,
        "statementCount": len(approved),
        "voteType": session.vote_type or "binary",
        "arguments": arguments,
        "opinionGroups": opinion_groups,
        "opinionAnalysisStatus": (landscape or {}).get("status", "unavailable"),
        "opinionSourceHash": (landscape or {}).get("sourceHash"),
        "opinionCaveat": "Provisional groups are early patterns for discussion, not reliable or fixed camps. Retain response and missing-answer counts in every interpretation.",
        "groupDifferences": group_differences,
        "coSupport": co_support_aliased,
        "validArgumentIds": list(alias_map.keys()),
        "argumentIdMap": alias_map,
    }


def build_anonymous_policy_feedback(history: list[dict]) -> list[dict]:
    """Prior policy versions + anonymous feedback IDs (no names / participant ids)."""
    out = []
    for item in history:
        participant_votes = item.get("participantVotes") or {}
        fb_items = []
        fb_n = 0
        for entry in participant_votes.values():
            fb_n += 1
            fb_id = f"fb{fb_n}"
            reaction = {
                "id": fb_id,
                "vote": entry.get("vote"),
            }
            if entry.get("reason"):
                reaction["reason"] = entry["reason"]
            # Attach targets if the reaction referenced itemized content (optional).
            if entry.get("targets"):
                reaction["targets"] = entry["targets"]
            fb_items.append(reaction)

        agree = sum(1 for e in participant_votes.values() if e.get("vote") == "agree")
        disagree = sum(1 for e in participant_votes.values() if e.get("vote") == "disagree")
        out.append({
            "versionId": item.get("id"),
            "status": item.get("status") or "working_draft",
            "generatedAt": item.get("generatedAt"),
            "groupStatement": item.get("groupStatement"),
            "changeSummary": item.get("changeSummary"),
            "recommendations": item.get("recommendations") or [],
            "essentialConditions": item.get("essentialConditions") or [],
            "tradeoffs": item.get("tradeoffs") or [],
            "unresolvedQuestions": item.get("unresolvedQuestions") or [],
            "votes": {"agree": agree, "disagree": disagree, "total": agree + disagree},
            "feedback": fb_items,
            "validFeedbackIds": [f["id"] for f in fb_items],
        })
    return out


def valid_evidence_ids(evidence: dict, previous_feedback: list[dict]) -> set[str]:
    ids = set(evidence.get("validArgumentIds") or [])
    for prev in previous_feedback:
        ids.update(prev.get("validFeedbackIds") or [])
        for rec in prev.get("recommendations") or []:
            if isinstance(rec, dict) and rec.get("id"):
                ids.add(rec["id"])
            # Nested citation ids already covered via arguments/feedback.
        for cond in prev.get("essentialConditions") or []:
            if isinstance(cond, dict) and cond.get("id"):
                ids.add(cond["id"])
    return ids
