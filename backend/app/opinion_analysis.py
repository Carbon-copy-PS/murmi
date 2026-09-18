"""One bounded, cached analysis for live results, report snapshots and policy evidence."""
from __future__ import annotations

import asyncio
from collections import OrderedDict
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path

ANALYSIS_VERSION = "shared-opinion-groups-v4"
VALID_VOTES = {"strongly_agree", "agree", "neutral", "disagree", "strongly_disagree"}
SCRIPT = Path(__file__).with_name("report-opinion-analysis.mjs")
_cache = OrderedDict()
_inflight = {}
_slots = asyncio.Semaphore(2)


def vote_matrix_data(session, participant_id=""):
    statements = sorted((s for s in session.statements if s.approved), key=lambda s: s.id)
    pids = sorted({pid for s in statements for pid, vote in s.votes.items() if vote in VALID_VOTES})
    return {
        "statements": [{"id": s.id, "text": s.text, "custom": s.custom,
                        "created_at": s.created_at} for s in statements],
        "voters": [{"key": f"p{index + 1:06d}", "isYou": pid == participant_id,
                    "votes": {s.id: s.votes[pid] for s in statements if s.votes.get(pid) in VALID_VOTES}}
                   for index, pid in enumerate(pids)],
    }


def analysis_source(session):
    matrix = vote_matrix_data(session)
    return {
        "sessionId": session.id,
        "statements": matrix["statements"],
        "votes": [{"participant_id": voter["key"], "statement_id": sid, "vote": vote}
                  for voter in matrix["voters"] for sid, vote in voter["votes"].items()],
    }


def _unavailable(reason):
    return {"landscape": {"available": False, "reason": reason,
                          "analysisVersion": ANALYSIS_VERSION, "membershipKind": "exclusive"}, "live": None}


def _contains_private_fields(value):
    forbidden = {"participantIndex", "participant_id", "participantId", "assignments", "coordinates", "points", "votes"}
    if isinstance(value, dict):
        if "dots" in value:
            dots = value["dots"]
            if not isinstance(dots, list) or len(dots) != value.get("size"):
                return True
            if any(not isinstance(dot, dict) or set(dot) != {"x", "y"} or
                   any(type(n) not in (int, float) or not math.isfinite(n) or not 0 <= n <= 1
                       for n in dot.values()) for dot in dots):
                return True
        return bool(forbidden.intersection(value)) or any(_contains_private_fields(item) for item in value.values())
    if isinstance(value, list):
        return any(_contains_private_fields(item) for item in value)
    return False


async def _calculate(source, key, timeout_seconds):
    async with _slots:
        try:
            process = await asyncio.create_subprocess_exec(
                "node", str(SCRIPT), stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
        except OSError:
            return _unavailable("analysis-runtime-unavailable")
        try:
            stdout, _ = await asyncio.wait_for(process.communicate(json.dumps(
                {"source": source, "includeLive": True}, ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8")), timeout=timeout_seconds)
        except (asyncio.TimeoutError, asyncio.CancelledError) as exc:
            if process.returncode is None:
                process.kill()
            await process.communicate()
            if isinstance(exc, asyncio.CancelledError):
                raise
            return _unavailable("analysis-timeout")
        except Exception:
            if process.returncode is None:
                process.kill()
                await process.communicate()
            return _unavailable("analysis-failed")
        if process.returncode != 0:
            return _unavailable("analysis-failed")
        try:
            result = json.loads(stdout)
            public = result["landscape"]
            if not isinstance(public, dict) or not isinstance(result.get("live"), dict):
                return _unavailable("invalid-analysis-output")
            if _contains_private_fields(public):
                return _unavailable("privacy-boundary-failed")
            if public.get("analysisVersion") != ANALYSIS_VERSION:
                return _unavailable("analysis-version-mismatch")
            public["sourceHash"] = key
            result["live"]["sourceHash"] = key
            result["live"]["landscape"] = public
        except (ValueError, KeyError, TypeError):
            return _unavailable("invalid-analysis-output")
        _cache[key] = result
        _cache.move_to_end(key)
        while len(_cache) > 64:
            _cache.popitem(last=False)
        return result


async def get_opinion_analysis(session, timeout_seconds=30):
    # Construct the entire immutable input before the first await.
    source = analysis_source(session)
    encoded = json.dumps({"version": ANALYSIS_VERSION, "source": source}, sort_keys=True,
                         ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    key = hashlib.sha256(encoded).hexdigest()
    if key in _cache:
        _cache.move_to_end(key)
        return deepcopy(_cache[key])
    if key not in _inflight:
        # Bound queued distinct snapshots too; a later results refresh retries.
        if len(_inflight) >= 16:
            return _unavailable("analysis-busy")
        task = asyncio.create_task(_calculate(source, key, timeout_seconds))
        _inflight[key] = task
        task.add_done_callback(lambda _: _inflight.pop(key, None))
    try:
        return deepcopy(await asyncio.wait_for(asyncio.shield(_inflight[key]), timeout_seconds + 1))
    except asyncio.TimeoutError:
        return _unavailable("analysis-timeout")
