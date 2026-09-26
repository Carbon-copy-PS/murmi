"""Collect completed captions into discussion windows without delaying captions."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field


@dataclass
class _Window:
    pending: dict = field(default_factory=dict)
    first: float = 0
    last: float = 0
    wake: asyncio.Event = field(default_factory=asyncio.Event)
    task: asyncio.Task | None = None
    flush: bool = False


class ArgumentQueue:
    def __init__(self, process, *, idle_seconds=4, minimum_seconds=3,
                 maximum_seconds=10, retry_seconds=30):
        self.process = process
        self.idle_seconds = idle_seconds
        self.minimum_seconds = minimum_seconds
        self.maximum_seconds = maximum_seconds
        self.retry_seconds = retry_seconds
        self.windows = {}

    def schedule(self, session_id, entry):
        if not entry.get("id"):
            return
        window = self.windows.setdefault(session_id, _Window())
        now = asyncio.get_running_loop().time()
        if not window.pending:
            window.first = now
        window.last = now
        window.pending[entry["id"]] = entry
        window.wake.set()
        if not window.task or window.task.done():
            window.task = asyncio.create_task(self._run(session_id, window))

    def flush(self, session_id):
        window = self.windows.get(session_id)
        if window:
            window.flush = True
            window.wake.set()
            if window.pending and (not window.task or window.task.done()):
                window.task = asyncio.create_task(self._run(session_id, window))

    async def _run(self, session_id, window):
        failures = 0
        try:
            while window.pending:
                deadline = min(window.first + self.maximum_seconds,
                               max(window.first + self.minimum_seconds,
                                   window.last + self.idle_seconds))
                delay = deadline - asyncio.get_running_loop().time()
                if delay > 0 and not window.flush:
                    window.wake.clear()
                    try:
                        await asyncio.wait_for(window.wake.wait(), delay)
                    except asyncio.TimeoutError:
                        pass
                    continue
                # Keep the original entries for retries, and freeze the text for
                # this request. Later speech queues another window, never cancels it.
                entries = window.pending
                window.pending = {}
                window.flush = False
                snapshots = [dict(entry) for entry in entries.values()]
                try:
                    succeeded = await self.process(session_id, snapshots)
                except Exception as exc:
                    print(f"Argument extraction failed: {type(exc).__name__}")
                    succeeded = False
                if succeeded:
                    failures = 0
                    continue
                for key, entry in entries.items():
                    window.pending.setdefault(key, entry)
                failures += 1
                if failures >= 2:
                    # Keep pending text for the next contribution or explicit flush.
                    # An outage must not cause an unbounded stream of provider calls.
                    return
                await asyncio.sleep(self.retry_seconds)
                window.flush = True
        finally:
            window.task = None
            if not window.pending and self.windows.get(session_id) is window:
                self.windows.pop(session_id, None)

    async def cancel(self, session_id):
        window = self.windows.pop(session_id, None)
        if window and window.task:
            window.task.cancel()
            await asyncio.gather(window.task, return_exceptions=True)

    async def close(self):
        await asyncio.gather(*(self.cancel(sid) for sid in list(self.windows)))
