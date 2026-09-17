"""Vote-backed theme descriptions, bounded and tied to exact analysis snapshots."""
from __future__ import annotations

import asyncio
from collections import OrderedDict
from copy import deepcopy
import hashlib
import json
import time

THEME_VERSION = "opinion-themes-v1"


def theme_evidence(landscape, topic=None):
    groups = landscape.get("groups", [])
    totals = {}
    for group in groups:
        for s in group["statements"]:
            total = totals.setdefault(s["id"], {k: 0 for k in ("agree", "disagree", "neutral", "responded", "missing")})
            for k in total:
                total[k] += s[k]
    evidence = []
    for group in groups:
        candidates = []
        for s in group["statements"]:
            n = s["responded"]
            if n < 2 or max(s["agree"], s["disagree"]) / n < .6:
                continue
            outside = {k: totals[s["id"]][k] - s[k] for k in totals[s["id"]]}
            # Smoothed contrast against everyone outside this group, weighted by
            # response coverage. Neither missing nor neutral becomes opposition.
            contrast = abs((s["agree"] + 1) / (n + 2) - (outside["agree"] + 1) / (outside["responded"] + 2))
            score = (contrast + .2 * max(s["agree"], s["disagree"]) / n) * n / (n + 3) * s["coverage"]
            candidates.append((score, {
                "id": s["id"], "text": s["text"],
                "support": s["agree"], "oppose": s["disagree"], "neutral": s["neutral"],
                "responded": n, "unanswered": s["missing"], "outsideGroup": outside,
            }))
        candidates.sort(key=lambda item: (-item[0], item[1]["id"]))
        selected = [item[1] for item in candidates[:8]]
        evidence.append({"groupId": group["id"], "size": group["size"],
                         "statements": selected if len(selected) >= 2 else []})
    shared = []
    if len(groups) >= 2:
        for s in groups[0]["statements"]:
            votes = [next(x for x in g["statements"] if x["id"] == s["id"]) for g in groups]
            if all(x["responded"] >= 2 and x["agreeRate"] >= .6 for x in votes):
                shared.append({"id": s["id"], "text": s["text"], "groups": [
                    {"groupId": g["id"], "support": x["agree"], "responded": x["responded"], "unanswered": x["missing"]}
                    for g, x in zip(groups, votes)]})
    return {"topic": topic, "status": landscape.get("status"), "groups": evidence, "shared": shared[:6]}


def validate_themes(data, evidence):
    if not isinstance(data, dict):
        return {"groups": [], "shared": None}

    def description(item, allowed, minimum):
        if not isinstance(item, dict):
            return None
        title, text, refs = item.get("title"), item.get("description"), item.get("evidenceStatementIds")
        if not isinstance(title, str) or not isinstance(text, str) or not isinstance(refs, list):
            return None
        if not 1 <= len(title.strip()) <= 48 or not 1 <= len(text.strip()) <= 180:
            return None
        if not all(isinstance(ref, str) and ref in allowed for ref in refs):
            return None
        refs = list(dict.fromkeys(refs))
        if not minimum <= len(refs) <= 3:
            return None
        return {"title": title.strip(), "description": text.strip(), "evidenceStatementIds": refs}

    candidates = {g["groupId"]: {s["id"] for s in g["statements"]} for g in evidence["groups"]}
    accepted, seen = [], set()
    items = data.get("groups")
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        gid = item.get("groupId")
        if type(gid) is not int or gid not in candidates or gid in seen:
            continue
        parsed = description(item, candidates[gid], 2)
        if parsed:
            accepted.append({"groupId": gid, **parsed})
            seen.add(gid)
    shared = description(data.get("shared"), {s["id"] for s in evidence["shared"]}, 1)
    return {"groups": accepted, "shared": shared}


class OpinionThemeService:
    def __init__(self, generator, enabled=True, cooldown=60, timeout=25):
        self.generator, self.enabled = generator, enabled
        self.cooldown, self.timeout = cooldown, timeout
        self.cache = OrderedDict()
        self.started = OrderedDict()
        self.failures = OrderedDict()
        self.running = {}
        self.slots = asyncio.Semaphore(2)

    async def close(self):
        tasks = [value[1] for value in self.running.values()]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self.running.clear()

    async def _generate(self, key, evidence, language):
        try:
            async with self.slots:
                raw = await asyncio.wait_for(self.generator(evidence, language), self.timeout)
            if raw is None:
                self._failed(key)
                return {"status": "unavailable"}
            result = {**validate_themes(raw, evidence), "status": "ready", "generatedAt": time.time()}
            self.cache[key] = result
            self.cache.move_to_end(key)
            while len(self.cache) > 64:
                self.cache.popitem(last=False)
            return result
        except asyncio.CancelledError:
            raise
        except Exception:
            self._failed(key)
            return {"status": "unavailable"}

    def _failed(self, key):
        self.failures[key] = time.monotonic()
        self.failures.move_to_end(key)
        while len(self.failures) > 64:
            self.failures.popitem(last=False)

    async def enrich(self, session, landscape, *, wait=False, force=False):
        result = deepcopy(landscape)
        if not result.get("available"):
            return result
        source_hash = result.get("sourceHash")
        language = session.language or "en"
        key = hashlib.sha256(json.dumps([THEME_VERSION, source_hash, language, session.topic], ensure_ascii=False).encode()).hexdigest()
        meta = {"version": THEME_VERSION, "sourceHash": source_hash, "language": language}
        result["themes"] = {**meta, "status": "emerging"}
        for group in result["groups"]:
            group.pop("theme", None)
        if not self.enabled or not source_hash:
            result["themes"]["status"] = "unavailable"
            return result
        evidence = theme_evidence(result, session.topic)
        if not any(g["statements"] for g in evidence["groups"]) and not evidence["shared"]:
            return result
        failed_at = self.failures.get(key)
        if failed_at is not None and time.monotonic() - failed_at < (5 if force else self.cooldown):
            result["themes"]["status"] = "unavailable"
            return result
        if force and time.monotonic() - self.started.get(session.id, float('-inf')) >= 5 and session.id not in self.running:
            self.cache.pop(key, None)
        cached = self.cache.get(key)
        if cached is None:
            active = self.running.get(session.id)
            if active and active[0] != key and wait:
                # Reports must describe their captured grouping, even when a live
                # generation for another snapshot is already in flight.
                try:
                    await asyncio.wait_for(asyncio.shield(active[1]), self.timeout + 1)
                except asyncio.TimeoutError:
                    result["themes"]["status"] = "unavailable"
                    return result
                active = self.running.get(session.id)
                if active and active[1].done():
                    active = None
            if active and active[0] == key:
                task = active[1]
            elif active or len(self.running) >= 8:
                result["themes"]["status"] = "pending"
                return result
            else:
                now = time.monotonic()
                elapsed = now - self.started.get(session.id, float('-inf'))
                if not wait and elapsed < (5 if force else self.cooldown):
                    result["themes"]["status"] = "pending"
                    return result
                self.started[session.id] = now
                self.started.move_to_end(session.id)
                while len(self.started) > 256:
                    self.started.popitem(last=False)
                task = asyncio.create_task(self._generate(key, evidence, language))
                self.running[session.id] = (key, task)
                def done(completed):
                    if self.running.get(session.id) == (key, completed):
                        self.running.pop(session.id, None)
                task.add_done_callback(done)
            if not wait:
                result["themes"]["status"] = "pending"
                return result
            try:
                cached = await asyncio.wait_for(asyncio.shield(task), self.timeout + 1)
            except asyncio.TimeoutError:
                cached = {"status": "unavailable"}
        else:
            self.cache.move_to_end(key)
        result["themes"] = {**meta, **cached}
        by_id = {item["groupId"]: item for item in cached.get("groups", [])}
        for group in result["groups"]:
            if group["id"] in by_id:
                group["theme"] = {**by_id[group["id"]], "sourceHash": source_hash}
        return result
