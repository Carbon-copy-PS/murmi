"""Run PostgreSQL regression against an explicitly supplied disposable database.

MURMI_TEST_POSTGRES_PORT=55436 python -m unittest backend.tests.test_vote_persistence
The test database must use user murmi_test, database postgres, local trust auth.
"""
import os
import unittest
from unittest.mock import patch

from sqlalchemy import text
from backend.app.db import Database
from backend.app.session import SessionManager, Statement, VALID_LIKERT_VOTES


@unittest.skipUnless(os.environ.get('MURMI_TEST_POSTGRES_PORT'), 'Requires disposable PostgreSQL')
class VotePersistenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_legacy_schema_migrates_and_every_vote_survives_reload(self):
        with patch.dict(os.environ, {
            'POSTGRES_HOST': '127.0.0.1',
            'POSTGRES_PORT': os.environ.get('MURMI_TEST_POSTGRES_PORT', ''),
            'POSTGRES_USER': 'murmi_test', 'POSTGRES_PASSWORD': '', 'POSTGRES_DB': 'postgres',
        }):
            db = Database()
            await db.connect()
            try:
                # Start with the actual historical schema that lost votes.
                async with db.engine.begin() as conn:
                    await conn.execute(text('ALTER TABLE votes ALTER COLUMN vote TYPE varchar(16)'))
                await db.disconnect()
                await db.connect()
                async with db.engine.connect() as conn:
                    size = await conn.scalar(text("SELECT character_maximum_length FROM information_schema.columns WHERE table_name='votes' AND column_name='vote'"))
                    self.assertEqual(size, 32)
                manager = SessionManager()
                session = manager._new_session('FIXTEST')
                manager.sessions[session.id] = session
                statement = Statement(id='fix-test-statement', text='Test statement', round=1, approved=True)
                session.statements.append(statement)
                for value in VALID_LIKERT_VOTES:
                    self.assertTrue(manager.record_vote(session.id, value, statement.id, value))
                    await db.save_vote(session, statement, value, value)
                await db.disconnect()
                await db.connect()
                loaded = await db.load_active_sessions()
                hydrated = SessionManager()
                for row in loaded:
                    hydrated.hydrate(row)
                restored = hydrated.get(session.id).statements[0]
                self.assertEqual(restored.votes, {v: v for v in VALID_LIKERT_VOTES})
                # Updating and deleting the formerly rejected value also work.
                await db.save_vote(session, statement, 'agree', 'strongly_disagree')
                await db.delete_vote(statement.id, 'agree')
                async with db.engine.connect() as conn:
                    count = await conn.scalar(text("SELECT count(*) FROM votes WHERE statement_id='fix-test-statement' AND participant_id='agree'"))
                    self.assertEqual(count, 0)
            finally:
                async with db.engine.begin() as conn:
                    await conn.execute(text("DELETE FROM sessions WHERE id='FIXTEST'"))
                await db.disconnect()
