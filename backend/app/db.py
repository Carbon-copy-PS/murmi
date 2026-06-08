from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    String,
    Integer,
    Float,
    Boolean,
    Text,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    select,
    delete,
    update,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, insert as pg_insert
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class SessionRow(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(12), primary_key=True)
    topic: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    current_round: Mapped[int] = mapped_column(Integer, default=1)
    threshold: Mapped[int] = mapped_column(Integer, default=5)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    transcript = relationship(
        "TranscriptRow", cascade="all, delete-orphan", passive_deletes=True
    )
    statements = relationship(
        "StatementRow", cascade="all, delete-orphan", passive_deletes=True
    )
    votes = relationship(
        "VoteRow", cascade="all, delete-orphan", passive_deletes=True
    )


class TranscriptRow(Base):
    __tablename__ = "transcript_entries"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    ts: Mapped[float] = mapped_column(Float, default=0.0)
    payload: Mapped[dict] = mapped_column(JSONB)


class StatementRow(Base):
    __tablename__ = "statements"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    text: Mapped[str] = mapped_column(Text)
    round: Mapped[int] = mapped_column(Integer, default=1)
    approved: Mapped[bool] = mapped_column(Boolean, default=False)
    custom: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[float] = mapped_column(Float, default=0.0)


class VoteRow(Base):
    __tablename__ = "votes"
    __table_args__ = (UniqueConstraint("statement_id", "participant_id"),)

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: uuid.uuid4().hex
    )
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    statement_id: Mapped[str] = mapped_column(
        ForeignKey("statements.id", ondelete="CASCADE"), index=True
    )
    participant_id: Mapped[str] = mapped_column(String(64))
    vote: Mapped[str] = mapped_column(String(16))


class ParticipantRow(Base):
    __tablename__ = "participants"
    __table_args__ = (UniqueConstraint("session_id", "client_id"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    client_id: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(120))
    language: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    auto_approve: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")


class Database:
    """Postgres persistence with per-session isolation and TTL-based deletion."""

    def __init__(self):
        self.host = os.environ.get("POSTGRES_HOST", "").strip()
        self.enabled = bool(self.host)
        self.ttl_hours = float(os.environ.get("SESSION_TTL_HOURS", "48"))
        self.engine = None
        self._sessionmaker = None

    @property
    def ttl_seconds(self) -> float:
        return self.ttl_hours * 3600

    def _url(self) -> str:
        user = os.environ.get("POSTGRES_USER", "postgres")
        password = os.environ.get("POSTGRES_PASSWORD", "")
        port = os.environ.get("POSTGRES_PORT", "5432")
        name = os.environ.get("POSTGRES_DB", "debate_sense")
        return f"postgresql+asyncpg://{user}:{password}@{self.host}:{port}/{name}"

    async def connect(self) -> bool:
        if not self.enabled:
            return False
        self.engine = create_async_engine(self._url(), pool_pre_ping=True)
        self._sessionmaker = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.execute(text(
                "ALTER TABLE participants "
                "ADD COLUMN IF NOT EXISTS auto_approve boolean NOT NULL DEFAULT true"
            ))
        return True

    async def disconnect(self):
        if self.engine is not None:
            await self.engine.dispose()
            self.engine = None

    def _session_values(self, session) -> dict:
        created = datetime.fromtimestamp(session.created_at, timezone.utc)
        expires_epoch = session.expires_at or (session.created_at + self.ttl_seconds)
        return {
            "id": session.id,
            "topic": session.topic,
            "current_round": session.current_round,
            "threshold": session.threshold,
            "created_at": created,
            "expires_at": datetime.fromtimestamp(expires_epoch, timezone.utc),
        }

    async def _ensure_session(self, db, session):
        await db.execute(
            pg_insert(SessionRow)
            .values(**self._session_values(session))
            .on_conflict_do_nothing(index_elements=["id"])
        )

    async def _ensure_statement(self, db, session_id: str, s):
        await db.execute(
            pg_insert(StatementRow)
            .values(
                id=s.id,
                session_id=session_id,
                text=s.text,
                round=s.round,
                approved=s.approved,
                custom=s.custom,
                created_at=float(s.created_at),
            )
            .on_conflict_do_update(
                index_elements=["id"],
                set_={"approved": s.approved, "text": s.text},
            )
        )

    async def save_session(self, session):
        if not self.enabled:
            return
        async with self._sessionmaker() as db:
            await self._ensure_session(db, session)
            await db.commit()

    async def update_round(self, session_id: str, current_round: int):
        if not self.enabled:
            return
        async with self._sessionmaker() as db:
            await db.execute(
                update(SessionRow).where(SessionRow.id == session_id).values(current_round=current_round)
            )
            await db.commit()

    async def update_topic(self, session_id: str, topic: str | None):
        if not self.enabled:
            return
        async with self._sessionmaker() as db:
            await db.execute(
                update(SessionRow).where(SessionRow.id == session_id).values(topic=topic)
            )
            await db.commit()

    async def save_transcript_entry(self, session, entry: dict):
        if not self.enabled:
            return
        entry_id = str(entry.get("id") or uuid.uuid4().hex)
        ts = float(entry.get("timestamp") or 0.0)
        async with self._sessionmaker() as db:
            await self._ensure_session(db, session)
            await db.execute(
                pg_insert(TranscriptRow)
                .values(id=entry_id, session_id=session.id, ts=ts, payload=entry)
                .on_conflict_do_update(index_elements=["id"], set_={"payload": entry, "ts": ts})
            )
            await db.commit()

    async def save_statements(self, session, statements: list) -> None:
        if not self.enabled or not statements:
            return
        async with self._sessionmaker() as db:
            await self._ensure_session(db, session)
            for s in statements:
                await self._ensure_statement(db, session.id, s)
            await db.commit()

    async def set_statements_approved(self, statement_ids: list[str]):
        if not self.enabled or not statement_ids:
            return
        async with self._sessionmaker() as db:
            await db.execute(
                update(StatementRow)
                .where(StatementRow.id.in_(statement_ids))
                .values(approved=True)
            )
            await db.commit()

    async def save_vote(self, session, statement, participant_id: str, vote: str):
        if not self.enabled or statement is None:
            return
        async with self._sessionmaker() as db:
            await self._ensure_session(db, session)
            await self._ensure_statement(db, session.id, statement)
            await db.execute(
                pg_insert(VoteRow)
                .values(
                    id=uuid.uuid4().hex,
                    session_id=session.id,
                    statement_id=statement.id,
                    participant_id=participant_id,
                    vote=vote,
                )
                .on_conflict_do_update(
                    index_elements=["statement_id", "participant_id"],
                    set_={"vote": vote},
                )
            )
            await db.commit()

    async def delete_vote(self, statement_id: str, participant_id: str):
        if not self.enabled:
            return
        async with self._sessionmaker() as db:
            await db.execute(
                delete(VoteRow).where(
                    VoteRow.statement_id == statement_id,
                    VoteRow.participant_id == participant_id,
                )
            )
            await db.commit()

    async def save_participant(self, session, participant_id: str, client_id: str, name: str, language):
        if not self.enabled or not client_id:
            return
        async with self._sessionmaker() as db:
            await self._ensure_session(db, session)
            await db.execute(
                pg_insert(ParticipantRow)
                .values(
                    id=participant_id,
                    session_id=session.id,
                    client_id=client_id,
                    name=name,
                    language=language,
                )
                .on_conflict_do_update(
                    index_elements=["session_id", "client_id"],
                    set_={"name": name, "language": language},
                )
            )
            await db.commit()

    async def save_auto_approve(self, session_id: str, client_id: str, value: bool):
        if not self.enabled or not client_id:
            return
        async with self._sessionmaker() as db:
            await db.execute(
                update(ParticipantRow)
                .where(
                    ParticipantRow.session_id == session_id,
                    ParticipantRow.client_id == client_id,
                )
                .values(auto_approve=value)
            )
            await db.commit()

    async def _build_session_dict(self, db, row: SessionRow) -> dict:
        transcript = (await db.execute(
            select(TranscriptRow)
            .where(TranscriptRow.session_id == row.id)
            .order_by(TranscriptRow.ts)
        )).scalars().all()
        statements = (await db.execute(
            select(StatementRow)
            .where(StatementRow.session_id == row.id)
            .order_by(StatementRow.created_at)
        )).scalars().all()
        votes = (await db.execute(
            select(VoteRow).where(VoteRow.session_id == row.id)
        )).scalars().all()
        participants = (await db.execute(
            select(ParticipantRow).where(ParticipantRow.session_id == row.id)
        )).scalars().all()

        votes_by_statement: dict[str, dict[str, str]] = {}
        for v in votes:
            votes_by_statement.setdefault(v.statement_id, {})[v.participant_id] = v.vote

        return {
            "id": row.id,
            "topic": row.topic,
            "current_round": row.current_round,
            "threshold": row.threshold,
            "created_at": row.created_at.timestamp(),
            "expires_at": row.expires_at.timestamp(),
            "transcript": [t.payload for t in transcript],
            "statements": [
                {
                    "id": s.id,
                    "text": s.text,
                    "round": s.round,
                    "approved": s.approved,
                    "custom": s.custom,
                    "created_at": s.created_at,
                    "votes": votes_by_statement.get(s.id, {}),
                }
                for s in statements
            ],
            "members": {
                p.client_id: {
                    "participant_id": p.id,
                    "name": p.name,
                    "language": p.language,
                    "auto_approve": p.auto_approve,
                }
                for p in participants
            },
        }

    async def load_active_sessions(self) -> list[dict]:
        if not self.enabled:
            return []
        now = datetime.now(timezone.utc)
        async with self._sessionmaker() as db:
            rows = (await db.execute(
                select(SessionRow).where(SessionRow.expires_at > now)
            )).scalars().all()
            return [await self._build_session_dict(db, row) for row in rows]

    async def load_session(self, session_id: str) -> Optional[dict]:
        if not self.enabled:
            return None
        now = datetime.now(timezone.utc)
        async with self._sessionmaker() as db:
            row = (await db.execute(
                select(SessionRow).where(
                    SessionRow.id == session_id, SessionRow.expires_at > now
                )
            )).scalar_one_or_none()
            if row is None:
                return None
            return await self._build_session_dict(db, row)

    async def purge_expired(self) -> list[str]:
        if not self.enabled:
            return []
        now = datetime.now(timezone.utc)
        async with self._sessionmaker() as db:
            expired = (await db.execute(
                select(SessionRow.id).where(SessionRow.expires_at <= now)
            )).scalars().all()
            if expired:
                await db.execute(
                    delete(SessionRow).where(SessionRow.id.in_(expired))
                )
                await db.commit()
            return list(expired)
