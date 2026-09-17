"""Integration test against the explicitly configured disposable PostgreSQL."""
import asyncio
import os
import unittest
from unittest.mock import AsyncMock, patch

from sqlalchemy import text
from backend.app.db import Database
from backend.app.session import SessionManager
from backend.app.transcript_writer import TranscriptWriter


@unittest.skipUnless(os.environ.get('MURMI_TEST_POSTGRES_PORT'), 'Requires disposable PostgreSQL')
class TranscriptPersistenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_retry_after_lost_commit_ack_saves_latest_text_once_and_survives_reload(self):
        with patch.dict(os.environ, {
            'POSTGRES_HOST': '127.0.0.1', 'POSTGRES_PORT': os.environ.get('MURMI_TEST_POSTGRES_PORT', ''),
            'POSTGRES_USER': 'murmi_test', 'POSTGRES_PASSWORD': '', 'POSTGRES_DB': 'postgres',
        }):
            db = Database()
            await db.connect()
            writer = None
            try:
                manager = SessionManager()
                session = manager._new_session('SAVETEST')
                calls = 0
                async def save(session, entry):
                    nonlocal calls
                    calls += 1
                    await db.save_transcript_entry(session, entry)
                    if calls == 1:
                        # The write succeeded, but its acknowledgement was lost.
                        raise ConnectionError('simulated lost commit acknowledgement')
                status = AsyncMock()
                writer = TranscriptWriter(save, status, retry_seconds=0.02)
                entry = {'id': 'save-test-entry', 'timestamp': 1.0, 'text': '不要', 'itemIds': ['a']}
                writer.enqueue(session, entry)
                await asyncio.wait_for(self.wait_for_failure(writer), 2)
                entry.update(text='不要刪掉最後一句', itemIds=['a', 'b'])
                writer.enqueue(session, entry)
                await writer.drain()
                self.assertFalse(writer.pending)
                async with db.engine.connect() as conn:
                    count = await conn.scalar(text("SELECT count(*) FROM transcript_entries WHERE session_id='SAVETEST'"))
                    self.assertEqual(count, 1)
                await db.disconnect()
                await db.connect()
                restored = next(row for row in await db.load_active_sessions() if row['id'] == 'SAVETEST')
                self.assertEqual(restored['transcript'][0]['text'], '不要刪掉最後一句')
                self.assertEqual(restored['transcript'][0]['itemIds'], ['a', 'b'])
                self.assertEqual([c.args[1] for c in status.await_args_list], [False, True])
            finally:
                if writer:
                    await writer.close()
                async with db.engine.begin() as conn:
                    await conn.execute(text("DELETE FROM sessions WHERE id='SAVETEST'"))
                await db.disconnect()

    async def wait_for_failure(self, writer):
        while not writer.failed:
            await asyncio.sleep(0.001)
