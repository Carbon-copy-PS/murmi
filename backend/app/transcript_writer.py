"""Serialize transcript upserts and retry outages without blocking caption delivery.

The retry queue lives in memory: it does not survive a process crash. Keep the
unsaved warning visible until every failed entry in the session has been saved.
"""
import asyncio
from copy import deepcopy


class TranscriptWriter:
    def __init__(self, save, on_status, retry_seconds=1.0, attempt_timeout=5.0):
        self.save = save
        self.on_status = on_status
        self.retry_seconds = retry_seconds
        self.attempt_timeout = attempt_timeout
        self.pending = {}
        self.tasks = {}
        self.failed = set()

    def enqueue(self, session, entry):
        key = (session.id, entry['id'])
        # Snapshot at enqueue time; database I/O must never serialize a dict
        # while a later caption mutates it.
        self.pending[key] = (session, deepcopy(entry))
        if key not in self.tasks:
            self.tasks[key] = asyncio.create_task(self._write(key))

    async def _write(self, key):
        delay = self.retry_seconds
        try:
            while key in self.pending:
                value = self.pending[key]
                session, entry = value
                try:
                    await asyncio.wait_for(self.save(session, entry), self.attempt_timeout)
                except Exception:
                    first_failure = key not in self.failed
                    self.failed.add(key)
                    if first_failure:
                        await self.on_status(key[0], False)
                    await asyncio.sleep(delay)
                    delay = min(delay * 2, 30.0)
                    continue
                # Another caption may have arrived during the upsert. Save its
                # newer snapshot before reporting recovery.
                if self.pending.get(key) is not value:
                    delay = self.retry_seconds
                    continue
                del self.pending[key]
                was_failed = key in self.failed
                self.failed.discard(key)
                if was_failed and not any(k[0] == key[0] for k in self.failed):
                    await self.on_status(key[0], True)
        finally:
            self.tasks.pop(key, None)

    async def drain(self, timeout=5.0):
        if self.tasks:
            await asyncio.wait(list(self.tasks.values()), timeout=timeout)

    async def close(self):
        await self.drain()
        tasks = list(self.tasks.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
