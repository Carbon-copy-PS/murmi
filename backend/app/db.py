from __future__ import annotations

import os
import time
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


NEVER_EXPIRES_SECONDS = 100 * 365 * 24 * 3600  # ~100 years


class Base(DeclarativeBase):
    pass


class SessionRow(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(12), primary_key=True)
    topic: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    language: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    current_round: Mapped[int] = mapped_column(Integer, default=1)
    threshold: Mapped[int] = mapped_column(Integer, default=5)
    vote_type: Mapped[str] = mapped_column(String(16), default="likert", server_default="likert")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    voting_open: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    voting_lifetime_hours: Mapped[float] = mapped_column(Float, default=24.0, server_default="24")
    voting_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    voting_activity: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    public_id: Mapped[Optional[str]] = mapped_column(String(24), nullable=True, unique=True, index=True)
    report_status: Mapped[str] = mapped_column(
        String(24), default="none", server_default="none"
    )
    report_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    finalized_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    common_ground_history: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    common_ground_mode: Mapped[str] = mapped_column(String(16), default="policy", server_default="policy")
    common_ground_instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    vote_comments_public: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

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
    tension: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    edited: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[float] = mapped_column(Float, default=0.0)
    source_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_speaker: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)


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
    voted_at: Mapped[float] = mapped_column(Float, default=0.0, server_default="0")
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


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
    auto_approve: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    is_host: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")


class CommonGroundRow(Base):
    __tablename__ = "common_ground_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    payload: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ReportSnapshotRow(Base):
    __tablename__ = "report_snapshots"
    __table_args__ = (UniqueConstraint("session_id", "version"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(24), default="draft_ready")
    source_hash: Mapped[str] = mapped_column(String(64), index=True)
    source_language: Mapped[str] = mapped_column(String(8), default="en")
    analysis_version: Mapped[str] = mapped_column(String(32))
    payload: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


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
        name = os.environ.get("POSTGRES_DB", "hear_the_room")
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
                "ADD COLUMN IF NOT EXISTS auto_approve boolean NOT NULL DEFAULT false"
            ))
            await conn.execute(text(
                "ALTER TABLE participants "
                "ALTER COLUMN auto_approve SET DEFAULT false"
            ))
            await conn.execute(text(
                "ALTER TABLE participants "
                "ADD COLUMN IF NOT EXISTS is_host boolean NOT NULL DEFAULT false"
            ))
            await conn.execute(text(
                "ALTER TABLE sessions "
                "ADD COLUMN IF NOT EXISTS vote_type varchar(16) NOT NULL DEFAULT 'likert'"
            ))
            await conn.execute(text(
                "ALTER TABLE sessions "
                "ADD COLUMN IF NOT EXISTS language varchar(8)"
            ))
            await conn.execute(text(
                "UPDATE sessions AS s SET language = host.language "
                "FROM ("
                "SELECT DISTINCT ON (session_id) session_id, language "
                "FROM participants "
                "WHERE is_host = true AND language IS NOT NULL "
                "ORDER BY session_id, id"
                ") AS host "
                "WHERE s.id = host.session_id AND s.language IS NULL"
            ))
            await conn.execute(text(
                "ALTER TABLE statements "
                "ADD COLUMN IF NOT EXISTS tension boolean NOT NULL DEFAULT false"
            ))
            await conn.execute(text(
                "ALTER TABLE statements "
                "ADD COLUMN IF NOT EXISTS edited boolean NOT NULL DEFAULT false"
            ))
            await conn.execute(text(
                "ALTER TABLE sessions "
                "ADD COLUMN IF NOT EXISTS voting_open boolean NOT NULL DEFAULT true"
            ))
            await conn.execute(text(
                "ALTER TABLE sessions "
                "ADD COLUMN IF NOT EXISTS voting_lifetime_hours double precision NOT NULL DEFAULT 24"
            ))
            await conn.execute(text(
                "ALTER TABLE sessions "
                "ADD COLUMN IF NOT EXISTS voting_expires_at timestamptz"
            ))
            await conn.execute(text(
                "ALTER TABLE sessions "
                "ADD COLUMN IF NOT EXISTS voting_activity jsonb"
            ))
            await conn.execute(text(
                "ALTER TABLE sessions "
                "ADD COLUMN IF NOT EXISTS public_id varchar(24)"
            ))
            await conn.execute(text(
                "ALTER TABLE sessions "
                "ADD COLUMN IF NOT EXISTS report_status varchar(24) NOT NULL DEFAULT 'none'"
            ))
            await conn.execute(text(
                "ALTER TABLE sessions "
                "ADD COLUMN IF NOT EXISTS report_version integer NOT NULL DEFAULT 0"
            ))
            await conn.execute(text(
                "ALTER TABLE sessions "
                "ADD COLUMN IF NOT EXISTS finalized_at timestamptz"
            ))
            await conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_sessions_public_id "
                "ON sessions (public_id)"
            ))
            await conn.execute(text(
                "ALTER TABLE votes "
                "ADD COLUMN IF NOT EXISTS voted_at double precision NOT NULL DEFAULT 0"
            ))
            await conn.execute(text(
                "ALTER TABLE sessions "
                "ADD COLUMN IF NOT EXISTS common_ground_history jsonb"
            ))
            await conn.execute(text(
                "ALTER TABLE sessions "
                "ADD COLUMN IF NOT EXISTS common_ground_depth varchar(16) NOT NULL DEFAULT 'extended'"
            ))
            await conn.execute(text(
                "ALTER TABLE sessions "
                "ADD COLUMN IF NOT EXISTS common_ground_mode varchar(16) NOT NULL DEFAULT 'policy'"
            ))
            await conn.execute(text(
                "ALTER TABLE sessions "
                "ADD COLUMN IF NOT EXISTS common_ground_instructions text"
            ))
            await conn.execute(text(
                "ALTER TABLE sessions "
                "ADD COLUMN IF NOT EXISTS vote_comments_public boolean NOT NULL DEFAULT true"
            ))
            await conn.execute(text(
                "ALTER TABLE statements "
                "ADD COLUMN IF NOT EXISTS source_text text"
            ))
            await conn.execute(text(
                "ALTER TABLE statements "
                "ADD COLUMN IF NOT EXISTS source_speaker varchar(120)"
            ))
            await conn.execute(text(
                "ALTER TABLE votes "
                "ADD COLUMN IF NOT EXISTS comment text"
            ))
            await conn.execute(text(
                """
                UPDATE sessions
                SET common_ground_mode = 'policy'
                WHERE common_ground_mode IS NULL
                   OR common_ground_mode = ''
                   OR common_ground_mode IN ('basic', 'extended', 'comprehensive')
                """
            ))
        return True

    async def disconnect(self):
        if self.engine is not None:
            await self.engine.dispose()
            self.engine = None

    def _session_values(self, session) -> dict:
        created = datetime.fromtimestamp(session.created_at, timezone.utc)
        # Sessions are retained indefinitely; keep a far-future expiry so the
        # not-null column stays populated and load queries always include the row.
        expires_epoch = session.expires_at or (session.created_at + NEVER_EXPIRES_SECONDS)
        voting_expires = getattr(session, "voting_expires_at", None)
        return {
            "id": session.id,
            "topic": session.topic,
            "language": getattr(session, "language", None),
            "current_round": 1,
            "threshold": 5,
            "vote_type": getattr(session, "vote_type", "likert"),
            "created_at": created,
            "expires_at": datetime.fromtimestamp(expires_epoch, timezone.utc),
            "voting_open": getattr(session, "voting_open", True),
            "voting_lifetime_hours": getattr(session, "voting_lifetime_hours", 24.0),
            "voting_expires_at": datetime.fromtimestamp(voting_expires, timezone.utc) if voting_expires else None,
            "voting_activity": getattr(session, "voting_activity", []),
            "public_id": getattr(session, "public_id", None),
            "report_status": getattr(session, "report_status", "none"),
            "report_version": getattr(session, "report_version", 0),
            "finalized_at": (
                datetime.fromtimestamp(session.finalized_at, timezone.utc)
                if getattr(session, "finalized_at", None)
                else None
            ),
            "common_ground_history": getattr(session, "common_ground_history", []) or [],
            "common_ground_mode": getattr(session, "common_ground_mode", "policy") or "policy",
            "common_ground_instructions": getattr(session, "common_ground_instructions", None),
            "vote_comments_public": bool(getattr(session, "vote_comments_public", True)),
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
                tension=getattr(s, "tension", False),
                edited=getattr(s, "edited", False),
                created_at=float(s.created_at),
                source_text=getattr(s, "source_text", None),
                source_speaker=getattr(s, "source_speaker", None),
            )
            .on_conflict_do_update(
                index_elements=["id"],
                set_={
                    "approved": s.approved,
                    "text": s.text,
                    "edited": getattr(s, "edited", False),
                    "source_text": getattr(s, "source_text", None),
                    "source_speaker": getattr(s, "source_speaker", None),
                },
            )
        )

    async def save_session(self, session):
        if not self.enabled:
            return
        async with self._sessionmaker() as db:
            await self._ensure_session(db, session)
            await db.commit()

    async def save_common_ground(self, session_or_id, item=None):
        """Persist common ground for a session.

        Supports both call styles used across the codebase:
        - save_common_ground(session) → mode + full history JSONB (+ upsert rows)
        - save_common_ground(session_id, item) → upsert one CommonGroundRow item
        """
        if not self.enabled:
            return

        # Item-style: save_common_ground(session_id: str, item: dict)
        if item is not None:
            session_id = session_or_id
            if not item or not item.get("id"):
                return
            generated_at = float(item.get("generatedAt") or 0.0) or datetime.now(
                timezone.utc
            ).timestamp()
            async with self._sessionmaker() as db:
                await db.execute(
                    pg_insert(CommonGroundRow)
                    .values(
                        id=item["id"],
                        session_id=session_id,
                        payload=item,
                        created_at=datetime.fromtimestamp(generated_at, timezone.utc),
                    )
                    .on_conflict_do_update(
                        index_elements=["id"],
                        set_={"payload": item},
                    )
                )
                await db.commit()
            return

        session = session_or_id
        if session is None:
            return
        history = getattr(session, "common_ground_history", []) or []
        mode = getattr(session, "common_ground_mode", "policy") or "policy"
        async with self._sessionmaker() as db:
            await self._ensure_session(db, session)
            await db.execute(
                update(SessionRow)
                .where(SessionRow.id == session.id)
                .values(
                    common_ground_history=history,
                    common_ground_mode=mode,
                )
            )
            for entry in history:
                if not isinstance(entry, dict) or not entry.get("id"):
                    continue
                generated_at = float(entry.get("generatedAt") or 0.0) or datetime.now(
                    timezone.utc
                ).timestamp()
                await db.execute(
                    pg_insert(CommonGroundRow)
                    .values(
                        id=entry["id"],
                        session_id=session.id,
                        payload=entry,
                        created_at=datetime.fromtimestamp(generated_at, timezone.utc),
                    )
                    .on_conflict_do_update(
                        index_elements=["id"],
                        set_={"payload": entry},
                    )
                )
            await db.commit()

    async def update_round(self, session_id: str, current_round: int):
        if not self.enabled:
            return
        async with self._sessionmaker() as db:
            await db.execute(
                update(SessionRow).where(SessionRow.id == session_id).values(current_round=current_round)
            )
            await db.commit()

    async def update_vote_type(self, session_id: str, vote_type: str):
        if not self.enabled:
            return
        async with self._sessionmaker() as db:
            await db.execute(
                update(SessionRow).where(SessionRow.id == session_id).values(vote_type=vote_type)
            )
            await db.commit()

    async def update_voting(self, session):
        if not self.enabled:
            return
        voting_expires = getattr(session, "voting_expires_at", None)
        async with self._sessionmaker() as db:
            await self._ensure_session(db, session)
            await db.execute(
                update(SessionRow)
                .where(SessionRow.id == session.id)
                .values(
                    voting_open=getattr(session, "voting_open", True),
                    voting_lifetime_hours=getattr(session, "voting_lifetime_hours", 24.0),
                    voting_expires_at=datetime.fromtimestamp(voting_expires, timezone.utc) if voting_expires else None,
                    voting_activity=getattr(session, "voting_activity", []),
                )
            )
            await db.commit()

    async def update_public_id(self, session_id: str, public_id: str):
        if not self.enabled:
            return
        async with self._sessionmaker() as db:
            await db.execute(
                update(SessionRow).where(SessionRow.id == session_id).values(public_id=public_id)
            )
            await db.commit()

    async def load_by_public_id(self, public_id: str) -> Optional[dict]:
        if not self.enabled or not public_id:
            return None
        async with self._sessionmaker() as db:
            result = await db.execute(
                select(SessionRow).where(SessionRow.public_id == public_id)
            )
            row = result.scalar_one_or_none()
            if not row:
                return None
            return await self._build_session_dict(db, row)

    async def update_common_ground_instructions(self, session):
        if not self.enabled or session is None:
            return
        async with self._sessionmaker() as db:
            await self._ensure_session(db, session)
            await db.execute(
                update(SessionRow)
                .where(SessionRow.id == session.id)
                .values(common_ground_instructions=getattr(session, "common_ground_instructions", None))
            )
            await db.commit()

    async def update_vote_comments_public(self, session):
        if not self.enabled or session is None:
            return
        async with self._sessionmaker() as db:
            await self._ensure_session(db, session)
            await db.execute(
                update(SessionRow)
                .where(SessionRow.id == session.id)
                .values(vote_comments_public=bool(getattr(session, "vote_comments_public", True)))
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

    async def update_language(self, session_id: str, language: str | None):
        if not self.enabled:
            return
        async with self._sessionmaker() as db:
            await db.execute(
                update(SessionRow).where(SessionRow.id == session_id).values(language=language)
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

    async def delete_statements(self, statement_ids: list[str]):
        if not self.enabled or not statement_ids:
            return
        async with self._sessionmaker() as db:
            await db.execute(
                delete(StatementRow).where(StatementRow.id.in_(statement_ids))
            )
            await db.commit()

    async def save_vote(self, session, statement, participant_id: str, vote: str, comment: str | None = None):
        if not self.enabled or statement is None:
            return
        now = time.time()
        comment_value = comment
        if comment_value is None:
            comments = getattr(statement, "vote_comments", None) or {}
            comment_value = comments.get(participant_id)
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
                    voted_at=now,
                    comment=comment_value or None,
                )
                .on_conflict_do_update(
                    index_elements=["statement_id", "participant_id"],
                    set_={"vote": vote, "voted_at": now, "comment": comment_value or None},
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

    async def save_participant(self, session, participant_id: str, client_id: str, name: str, language, is_host: bool = False):
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
                    is_host=is_host,
                )
                .on_conflict_do_update(
                    index_elements=["session_id", "client_id"],
                    set_={"name": name, "language": language, "is_host": is_host},
                )
            )
            await db.commit()

    async def set_host_flag(self, session_id: str, client_id: str, is_host: bool):
        if not self.enabled or not client_id:
            return
        async with self._sessionmaker() as db:
            await db.execute(
                update(ParticipantRow)
                .where(
                    ParticipantRow.session_id == session_id,
                    ParticipantRow.client_id == client_id,
                )
                .values(is_host=is_host)
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

    async def delete_common_ground(self, common_ground_id: str):
        if not self.enabled or not common_ground_id:
            return
        async with self._sessionmaker() as db:
            await db.execute(
                delete(CommonGroundRow).where(
                    CommonGroundRow.id == common_ground_id
                )
            )
            await db.commit()

    async def update_report_status(self, session):
        if not self.enabled or session is None:
            return
        finalized_at = getattr(session, "finalized_at", None)
        async with self._sessionmaker() as db:
            await db.execute(
                update(SessionRow)
                .where(SessionRow.id == session.id)
                .values(
                    report_status=getattr(session, "report_status", "none"),
                    report_version=getattr(session, "report_version", 0),
                    finalized_at=(
                        datetime.fromtimestamp(finalized_at, timezone.utc)
                        if finalized_at
                        else None
                    ),
                )
            )
            await db.commit()

    async def save_report_snapshot(self, session, snapshot: dict):
        if not self.enabled or session is None or not snapshot:
            return
        created_at = float(snapshot.get("generatedAt") or time.time())
        published_at = snapshot.get("publishedAt")
        async with self._sessionmaker() as db:
            await self._ensure_session(db, session)
            await db.execute(
                pg_insert(ReportSnapshotRow)
                .values(
                    id=uuid.uuid4().hex,
                    session_id=session.id,
                    version=int(snapshot["version"]),
                    status=snapshot.get("status", "draft_ready"),
                    source_hash=snapshot["sourceHash"],
                    source_language=snapshot.get("sourceLanguage", "en"),
                    analysis_version=snapshot.get("analysisVersion", "unknown"),
                    payload=snapshot,
                    created_at=datetime.fromtimestamp(created_at, timezone.utc),
                    published_at=(
                        datetime.fromtimestamp(float(published_at), timezone.utc)
                        if published_at
                        else None
                    ),
                )
                .on_conflict_do_update(
                    index_elements=["session_id", "version"],
                    set_={
                        "status": snapshot.get("status", "draft_ready"),
                        "payload": snapshot,
                        "published_at": (
                            datetime.fromtimestamp(float(published_at), timezone.utc)
                            if published_at
                            else None
                        ),
                    },
                )
            )
            await db.execute(
                update(SessionRow)
                .where(SessionRow.id == session.id)
                .values(
                    voting_open=getattr(session, "voting_open", False),
                    voting_expires_at=(
                        datetime.fromtimestamp(
                            float(session.voting_expires_at), timezone.utc
                        )
                        if getattr(session, "voting_expires_at", None)
                        else None
                    ),
                    report_status=getattr(session, "report_status", "draft_ready"),
                    report_version=getattr(session, "report_version", 0),
                    finalized_at=datetime.fromtimestamp(
                        float(session.finalized_at), timezone.utc
                    ),
                )
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
        common_ground = (await db.execute(
            select(CommonGroundRow)
            .where(CommonGroundRow.session_id == row.id)
            .order_by(CommonGroundRow.created_at)
        )).scalars().all()
        latest_report = (await db.execute(
            select(ReportSnapshotRow)
            .where(ReportSnapshotRow.session_id == row.id)
            .order_by(ReportSnapshotRow.version.desc())
            .limit(1)
        )).scalar_one_or_none()

        votes_by_statement: dict[str, dict[str, str]] = {}
        vote_times_by_statement: dict[str, dict[str, float]] = {}
        comments_by_statement: dict[str, dict[str, str]] = {}
        for v in votes:
            votes_by_statement.setdefault(v.statement_id, {})[v.participant_id] = v.vote
            voted_at = float(getattr(v, "voted_at", 0) or 0)
            if voted_at > 0:
                vote_times_by_statement.setdefault(v.statement_id, {})[v.participant_id] = voted_at
            comment = getattr(v, "comment", None)
            if comment:
                comments_by_statement.setdefault(v.statement_id, {})[v.participant_id] = comment

        statement_payloads = []
        for s in statements:
            stmt_votes = votes_by_statement.get(s.id, {})
            vote_times = vote_times_by_statement.get(s.id, {})
            last_vote_at = max(vote_times.values()) if vote_times else 0.0
            if stmt_votes and not last_vote_at:
                last_vote_at = float(s.created_at or 0)
            statement_payloads.append({
                "id": s.id,
                "text": s.text,
                "round": s.round,
                "approved": s.approved,
                "custom": s.custom,
                "tension": getattr(s, "tension", False),
                "edited": getattr(s, "edited", False),
                "created_at": s.created_at,
                "source_text": getattr(s, "source_text", None),
                "source_speaker": getattr(s, "source_speaker", None),
                "votes": stmt_votes,
                "vote_times": vote_times,
                "vote_comments": comments_by_statement.get(s.id, {}),
                "last_vote_at": last_vote_at,
            })

        return {
            "id": row.id,
            "topic": row.topic,
            "language": getattr(row, "language", None),
            "current_round": row.current_round,
            "threshold": row.threshold,
            "vote_type": row.vote_type,
            "created_at": row.created_at.timestamp(),
            "expires_at": row.expires_at.timestamp(),
            "voting_open": getattr(row, "voting_open", True),
            "voting_lifetime_hours": getattr(row, "voting_lifetime_hours", 24.0),
            "voting_expires_at": row.voting_expires_at.timestamp() if getattr(row, "voting_expires_at", None) else None,
            "voting_activity": getattr(row, "voting_activity", None) or [],
            "public_id": getattr(row, "public_id", None),
            "report_status": getattr(row, "report_status", "none"),
            "report_version": getattr(row, "report_version", 0),
            "finalized_at": (
                row.finalized_at.timestamp()
                if getattr(row, "finalized_at", None)
                else None
            ),
            "report_snapshot": latest_report.payload if latest_report else None,
            "common_ground_history": (
                [item.payload for item in common_ground]
                if common_ground
                else (getattr(row, "common_ground_history", None) or [])
            ),
            "common_ground_mode": getattr(row, "common_ground_mode", None)
                or getattr(row, "common_ground_depth", None)
                or "policy",
            "common_ground_instructions": getattr(row, "common_ground_instructions", None),
            "vote_comments_public": bool(getattr(row, "vote_comments_public", True)),
            "transcript": [t.payload for t in transcript],
            "statements": statement_payloads,
            "members": {
                p.client_id: {
                    "participant_id": p.id,
                    "name": p.name,
                    "language": p.language,
                    "auto_approve": p.auto_approve,
                    "is_host": p.is_host,
                }
                for p in participants
            },
        }

    async def load_active_sessions(self) -> list[dict]:
        if not self.enabled:
            return []
        async with self._sessionmaker() as db:
            rows = (await db.execute(select(SessionRow))).scalars().all()
            return [await self._build_session_dict(db, row) for row in rows]

    async def load_session(self, session_id: str) -> Optional[dict]:
        if not self.enabled:
            return None
        async with self._sessionmaker() as db:
            row = (await db.execute(
                select(SessionRow).where(SessionRow.id == session_id)
            )).scalar_one_or_none()
            if row is None:
                return None
            return await self._build_session_dict(db, row)

    async def purge_expired(self) -> list[str]:
        # Session data is retained indefinitely — never delete anything.
        return []
