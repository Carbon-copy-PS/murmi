import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from backend.app.transcript_writer import TranscriptWriter


class TranscriptWriterTests(unittest.IsolatedAsyncioTestCase):
    async def test_failed_save_retries_latest_text_and_reports_recovery(self):
        save = AsyncMock(side_effect=[ConnectionError('offline'), None])
        status = AsyncMock()
        writer = TranscriptWriter(save, status, retry_seconds=0.01)
        session = SimpleNamespace(id='s')
        entry = {'id': 'entry', 'text': '第一句'}
        writer.enqueue(session, entry)
        while not status.await_count:
            await asyncio.sleep(0)
        entry['text'] = '第一句 第二句'
        writer.enqueue(session, entry)
        await writer.drain()
        self.assertEqual(save.await_count, 2)
        self.assertEqual(save.await_args_list[0].args[1]['text'], '第一句')
        self.assertEqual(save.await_args.args[1]['text'], '第一句 第二句')
        self.assertEqual([c.args for c in status.await_args_list], [('s', False), ('s', True)])
        self.assertFalse(writer.pending)

    async def test_newer_snapshot_is_saved_after_inflight_upsert_without_parallel_writes(self):
        started = asyncio.Event()
        release = asyncio.Event()
        texts = []
        async def save(session, entry):
            texts.append(entry['text'])
            if len(texts) == 1:
                started.set()
                await release.wait()
        writer = TranscriptWriter(save, AsyncMock())
        session = SimpleNamespace(id='s')
        writer.enqueue(session, {'id': 'e', 'text': 'first'})
        await started.wait()
        writer.enqueue(session, {'id': 'e', 'text': 'first second'})
        self.assertEqual(texts, ['first'])
        release.set()
        await writer.drain()
        self.assertEqual(texts, ['first', 'first second'])

    async def test_hung_database_attempt_times_out_and_retries(self):
        calls = 0
        async def save(*args):
            nonlocal calls
            calls += 1
            if calls == 1:
                await asyncio.Event().wait()
        status = AsyncMock()
        writer = TranscriptWriter(save, status, retry_seconds=0.001, attempt_timeout=0.01)
        writer.enqueue(SimpleNamespace(id='s'), {'id': 'e', 'text': 'no'})
        await writer.drain()
        self.assertEqual(calls, 2)
        self.assertEqual([c.args[1] for c in status.await_args_list], [False, True])

    async def test_recovery_is_not_announced_while_another_entry_is_unsaved(self):
        release = asyncio.Event()
        async def save(session, entry):
            if not release.is_set():
                raise ConnectionError('offline')
        status = AsyncMock()
        writer = TranscriptWriter(save, status, retry_seconds=0.01)
        session = SimpleNamespace(id='s')
        writer.enqueue(session, {'id': 'a'})
        writer.enqueue(session, {'id': 'b'})
        while len(writer.failed) < 2:
            await asyncio.sleep(0)
        self.assertFalse(any(c.args[1] for c in status.await_args_list))
        release.set()
        await writer.drain()
        self.assertEqual(sum(c.args[1] for c in status.await_args_list), 1)
