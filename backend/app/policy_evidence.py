"""Policy Common Ground evidence built from approved statements and votes.

Model-facing argument IDs are short aliases (a1, a2, …) mapped back to statement
IDs after generation. Participant names and internal participant IDs are never
included in model-facing payloads.
"""
from __future__ import annotations

import math


VOTE_VALUE = {
    "strongly_agree": 2,
    "agree": 1,
    "disagree": -1,
    "strongly_disagree": -2,
}

AGREE_SET = frozenset({"agree", "strongly_agree"})
DISAGREE_SET = frozenset({"disagree", "strongly_disagree"})
NEUTRAL_SET = frozenset({"neutral"})
GROUP_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _is_agree(v: str | None) -> bool:
    return v in AGREE_SET


def _is_disagree(v: str | None) -> bool:
    return v in DISAGREE_SET


def _dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def _mat_vec(m: list[list[float]], v: list[float]) -> list[float]:
    return [_dot(row, v) for row in m]


def _normalize(v: list[float]) -> list[float]:
    n = math.sqrt(_dot(v, v)) or 1.0
    return [x / n for x in v]


def _top_eigenvector(c: list[list[float]], iters: int = 120) -> tuple[list[float], float]:
    d = len(c)
    v = _normalize([math.sin(i + 1) + 0.5 for i in range(d)])
    for _ in range(iters):
        v = _normalize(_mat_vec(c, v))
    lam = _dot(v, _mat_vec(c, v))
    return v, lam


def _deflate(c: list[list[float]], vec: list[float], value: float) -> list[list[float]]:
    d = len(c)
    return [
        [c[i][j] - value * vec[i] * vec[j] for j in range(d)]
        for i in range(d)
    ]


def _pca2d(centered: list[list[float]], dim: int) -> list[list[float]]:
    c = [[0.0] * dim for _ in range(dim)]
    for row in centered:
        for i in range(dim):
            ri = row[i]
            if ri == 0:
                continue
            for j in range(i, dim):
                v = ri * row[j]
                c[i][j] += v
                if i != j:
                    c[j][i] += v
    e1, lam1 = _top_eigenvector(c)
    c2 = _deflate(c, e1, lam1)
    e2, _ = _top_eigenvector(c2)
    return [[_dot(row, e1), _dot(row, e2)] for row in centered]


def _sq_dist(a: list[float], b: list[float]) -> float:
    dx = a[0] - b[0]
    dy = a[1] - b[1]
    return dx * dx + dy * dy


def _mulberry32(seed: int):
    state = seed & 0xFFFFFFFF

    def rand() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = ((t ^ (t >> 15)) * (1 | t)) & 0xFFFFFFFF
        t = ((t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return rand


def _kmeanspp_init(points: list[list[float]], k: int, seed: int) -> list[list[float]]:
    rand = _mulberry32(seed + 1)
    centers = [list(points[int(rand() * len(points))])]
    while len(centers) < k:
        dists = [min(_sq_dist(p, c) for c in centers) for p in points]
        total = sum(dists) or 1.0
        t = rand() * total
        idx = 0
        for i, d in enumerate(dists):
            t -= d
            if t <= 0:
                idx = i
                break
        centers.append(list(points[idx]))
    return centers


def _kmeans(
    points: list[list[float]],
    k: int,
    restarts: int = 6,
    iters: int = 60,
) -> dict:
    n = len(points)
    best = None
    for r in range(restarts):
        centers = _kmeanspp_init(points, k, r)
        assign = [0] * n
        for _ in range(iters):
            moved = False
            for i in range(n):
                best_c = 0
                best_d = float("inf")
                for c in range(k):
                    d = _sq_dist(points[i], centers[c])
                    if d < best_d:
                        best_d = d
                        best_c = c
                if assign[i] != best_c:
                    assign[i] = best_c
                    moved = True
            for c in range(k):
                members = [points[i] for i, a in enumerate(assign) if a == c]
                if members:
                    centers[c] = [
                        sum(p[0] for p in members) / len(members),
                        sum(p[1] for p in members) / len(members),
                    ]
            if not moved:
                break
        inertia = sum(_sq_dist(points[i], centers[assign[i]]) for i in range(n))
        if best is None or inertia < best["inertia"]:
            best = {"assign": list(assign), "centers": centers, "inertia": inertia}
    return best or {"assign": [0] * n, "centers": [], "inertia": 0}


def _silhouette(points: list[list[float]], assign: list[int], k: int) -> float:
    n = len(points)
    if k < 2 or n <= k:
        return -1.0
    total = 0.0
    count = 0
    for i in range(n):
        own = assign[i]
        groups: list[list[int]] = [[] for _ in range(k)]
        for j in range(n):
            if j != i:
                groups[assign[j]].append(j)
        if not groups[own]:
            continue
        a = sum(math.sqrt(_sq_dist(points[i], points[j])) for j in groups[own]) / len(groups[own])
        b = float("inf")
        for c in range(k):
            if c == own or not groups[c]:
                continue
            d = sum(math.sqrt(_sq_dist(points[i], points[j])) for j in groups[c]) / len(groups[c])
            if d < b:
                b = d
        if b == float("inf"):
            continue
        total += (b - a) / max(a, b)
        count += 1
    return total / count if count else -1.0


def _scale_coords(coords: list[list[float]]) -> list[list[float]]:
    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    span = max(max_x - min_x, max_y - min_y, 1e-9)
    cx = (min_x + max_x) / 2
    cy = (min_y + max_y) / 2
    return [[((x - cx) / span) * 1.7, ((y - cy) / span) * 1.7] for x, y in coords]


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


def _compute_clusters(
    statements: list,
    voters: list[dict],
    vote_type: str,
) -> dict:
    dim = len(statements)
    n = len(voters)
    if n < 3 or dim < 2:
        return {"ok": False, "k": 0, "groups": [], "assign": []}

    s_index = {s.id: i for i, s in enumerate(statements)}
    raw = []
    for v in voters:
        row = [0.0] * dim
        for sid, val in (v.get("votes") or {}).items():
            idx = s_index.get(sid)
            if idx is not None:
                row[idx] = float(VOTE_VALUE.get(val, 0))
        raw.append(row)

    means = [sum(raw[i][j] for i in range(n)) / n for j in range(dim)]
    centered = [[row[j] - means[j] for j in range(dim)] for row in raw]
    coords = _scale_coords(_pca2d(centered, dim))

    max_k = min(4, n - 1)
    best_k = 2
    best_score = -float("inf")
    best_assign = None
    for k in range(2, max_k + 1):
        km = _kmeans(coords, k)
        score = _silhouette(coords, km["assign"], k)
        if score > best_score:
            best_score = score
            best_k = k
            best_assign = km["assign"]
    if best_assign is None:
        best_k = 1
        best_assign = [0] * n

    groups = []
    for c in range(best_k):
        member_idxs = [i for i, a in enumerate(best_assign) if a == c]
        if not member_idxs:
            continue
        members = [voters[i] for i in member_idxs]
        letter = GROUP_LETTERS[len(groups)] if len(groups) < len(GROUP_LETTERS) else str(len(groups))
        min_votes = max(1, math.ceil(len(members) * 0.5))
        member_count = len(members) or 1
        stances = []
        for s in statements:
            agree = sum(1 for m in members if _is_agree((m.get("votes") or {}).get(s.id)))
            disagree = sum(1 for m in members if _is_disagree((m.get("votes") or {}).get(s.id)))
            strong_agree = sum(
                1 for m in members if (m.get("votes") or {}).get(s.id) == "strongly_agree"
            )
            strong_disagree = sum(
                1 for m in members if (m.get("votes") or {}).get(s.id) == "strongly_disagree"
            )
            directed = agree + disagree
            if vote_type == "likert":
                if strong_agree >= min_votes and strong_agree / member_count >= 0.4:
                    lean = "strongly_agree"
                elif agree >= min_votes and agree / member_count >= 0.5 and strong_agree / member_count < 0.4:
                    lean = "agree"
                elif strong_disagree >= min_votes and strong_disagree / member_count >= 0.4:
                    lean = "strongly_disagree"
                elif disagree >= min_votes and disagree / member_count >= 0.5 and strong_disagree / member_count < 0.4:
                    lean = "disagree"
                else:
                    lean = "mixed"
            else:
                rate = agree / directed if directed else 0.5
                if directed >= min_votes and rate >= 0.6:
                    lean = "agree"
                elif directed >= min_votes and rate <= 0.4:
                    lean = "disagree"
                else:
                    lean = "mixed"
            stances.append({
                "argumentId": s.id,
                "lean": lean,
                "support": agree,
                "opposition": disagree,
            })
        groups.append({
            "group": letter,
            "size": len(members),
            "stances": stances,
        })
    return {"ok": True, "k": len(groups), "groups": groups, "assign": best_assign}


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


def build_policy_evidence(session) -> dict:
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
    clusters = _compute_clusters(approved, voters, session.vote_type or "binary")
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
    groups = clusters.get("groups") or []
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
