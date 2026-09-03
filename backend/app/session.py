from __future__ import annotations

import re
import uuid
import time
import secrets
from dataclasses import dataclass, field
from typing import Dict, Optional


def normalize_statement(text: str) -> str:
    lowered = re.sub(r"[^\w\s]", "", text.lower())
    return " ".join(lowered.split())

from fastapi import WebSocket

from .analysis import (
    CG_PROMPT_VERSION,
    DEFAULT_COMMON_GROUND_INSTRUCTIONS,
    sanitize_host_instructions,
)


@dataclass
class Participant:
    id: str
    name: str
    websocket: WebSocket
    language: Optional[str] = None
    client_id: Optional[str] = None
    audio_level: float = 0.0
    last_level_update: float = 0.0
    last_vote_at: float = 0.0


@dataclass
class Statement:
    id: str
    text: str
    round: int
    approved: bool = False
    custom: bool = False
    tension: bool = False
    edited: bool = False
    created_at: float = field(default_factory=time.time)
    author: Optional[str] = None
    snapshot: Optional[dict] = None
    votes: Dict[str, str] = field(default_factory=dict)
    vote_times: Dict[str, float] = field(default_factory=dict)
    vote_comments: Dict[str, str] = field(default_factory=dict)
    last_vote_at: float = 0.0
    source_text: Optional[str] = None
    source_speaker: Optional[str] = None


def sync_statement_last_vote_at(stmt: Statement) -> float:
    if stmt.vote_times:
        stmt.last_vote_at = max(stmt.vote_times.values())
    elif not stmt.votes:
        stmt.last_vote_at = 0.0
    return stmt.last_vote_at


@dataclass
class Session:
    id: str
    topic: Optional[str] = None
    language: Optional[str] = None
    participants: Dict[str, Participant] = field(default_factory=dict)
    transcript: list = field(default_factory=list)
    host_participant_id: Optional[str] = None
    host_client_ids: set[str] = field(default_factory=set)
    active_mic_id: Optional[str] = None
    recording: bool = False
    statements: list[Statement] = field(default_factory=list)
    transcript_since_last_analysis: int = 0
    analysis_in_progress: bool = False
    vote_type: str = "likert"
    common_ground_mode: str = "policy"
    started: bool = False
    created_at: float = field(default_factory=time.time)
    expires_at: Optional[float] = None
    known_participants: Dict[str, str] = field(default_factory=dict)
    participant_names: Dict[str, str] = field(default_factory=dict)
    common_ground_history: list = field(default_factory=list)
    auto_approve_prefs: Dict[str, bool] = field(default_factory=dict)
    statement_perms: Dict[str, bool] = field(default_factory=dict)
    default_can_add_statement: bool = True
    voting_open: bool = True
    voting_lifetime_hours: float = 24.0
    voting_expires_at: Optional[float] = None
    voting_activity: list = field(default_factory=list)
    public_id: Optional[str] = None
    report_status: str = "none"
    report_version: int = 0
    finalized_at: Optional[float] = None
    report_snapshot: Optional[dict] = None
    common_ground_instructions: str = DEFAULT_COMMON_GROUND_INSTRUCTIONS
    vote_comments_public: bool = True


SILENCE_THRESHOLD = 0.01
LEVEL_STALE_SECONDS = 2.0
ANALYSIS_BATCH_SIZE = 3
COMMON_GROUND_REASON_MAX = 280
STATEMENT_TEXT_MAX = 600
SOURCE_TEXT_MAX = 2000
VOTE_COMMENT_MAX = 280
COMMON_GROUND_INSTRUCTIONS_MAX = 1500

VOTE_TYPES = ("binary", "likert")
DEFAULT_VOTING_LIFETIME_HOURS = 24.0
MIN_VOTING_LIFETIME_HOURS = 1.0
MAX_VOTING_LIFETIME_HOURS = 720.0
VOTING_ACTIVITY_MAX = 100
COMMON_GROUND_MODES = ("generic", "policy")
DEFAULT_COMMON_GROUND_MODE = "policy"
_LEGACY_DEPTH_TO_MODE = {
    "basic": "generic",
    "extended": "generic",
    "comprehensive": "generic",
}


def normalize_common_ground_mode(mode: str | None) -> str:
    if mode in COMMON_GROUND_MODES:
        return mode
    if mode in _LEGACY_DEPTH_TO_MODE:
        return _LEGACY_DEPTH_TO_MODE[mode]
    return DEFAULT_COMMON_GROUND_MODE
VALID_BINARY_VOTES = ("agree", "disagree", "neutral")
VALID_LIKERT_VOTES = ("strongly_agree", "agree", "neutral", "disagree", "strongly_disagree")
AGREE_VOTES = ("agree", "strongly_agree")
DISAGREE_VOTES = ("disagree", "strongly_disagree")


class SessionManager:
    def __init__(self, ttl_seconds: float | None = None):
        self.sessions: Dict[str, Session] = {}
        self.ttl_seconds = ttl_seconds

    def _new_session(
        self,
        session_id: str,
        topic: str | None = None,
        vote_type: str = "likert",
        language: str | None = None,
    ) -> Session:
        now = time.time()
        expires_at = now + self.ttl_seconds if self.ttl_seconds else None
        vt = vote_type if vote_type in VOTE_TYPES else "likert"
        return Session(
            id=session_id,
            topic=topic,
            language=language,
            vote_type=vt,
            common_ground_mode=DEFAULT_COMMON_GROUND_MODE,
            created_at=now,
            expires_at=expires_at,
            voting_lifetime_hours=DEFAULT_VOTING_LIFETIME_HOURS,
            voting_expires_at=now + DEFAULT_VOTING_LIFETIME_HOURS * 3600,
            common_ground_instructions=DEFAULT_COMMON_GROUND_INSTRUCTIONS,
            vote_comments_public=True,
        )

    def _gen_public_id(self) -> str:
        existing = {s.public_id for s in self.sessions.values() if s.public_id}
        while True:
            token = secrets.token_urlsafe(9).replace("-", "").replace("_", "")[:12]
            if token and token not in existing:
                return token

    def create(
        self,
        topic: str | None = None,
        vote_type: str = "likert",
        language: str | None = None,
    ) -> str:
        session_id = uuid.uuid4().hex[:6].upper()
        session = self._new_session(session_id, topic, vote_type, language)
        session.public_id = self._gen_public_id()
        self.sessions[session_id] = session
        return session_id

    def get_by_public_id(self, public_id: str) -> Optional[str]:
        if not public_id:
            return None
        for s in self.sessions.values():
            if s.public_id == public_id:
                return s.id
        return None

    def ensure_public_id(self, session_id: str) -> Optional[str]:
        session = self.sessions.get(session_id)
        if not session:
            return None
        if not session.public_id:
            session.public_id = self._gen_public_id()
        return session.public_id

    def hydrate(self, data: dict) -> Session:
        session = Session(
            id=data["id"],
            topic=data.get("topic"),
            language=data.get("language"),
            vote_type=data.get("vote_type", "likert"),
            created_at=data.get("created_at", time.time()),
            expires_at=data.get("expires_at"),
        )
        session.transcript = list(data.get("transcript", []))
        raw_mode = data.get("common_ground_mode") or data.get("common_ground_depth")
        session.common_ground_mode = normalize_common_ground_mode(raw_mode)
        session.common_ground_history = list(data.get("common_ground_history") or [])
        for item in session.common_ground_history:
            if isinstance(item, dict) and "mode" not in item:
                item["mode"] = normalize_common_ground_mode(item.get("depth"))
        if "default_can_add_statement" in data:
            session.default_can_add_statement = bool(data["default_can_add_statement"])
        if "voting_open" in data and data["voting_open"] is not None:
            session.voting_open = bool(data["voting_open"])
        if data.get("voting_lifetime_hours"):
            session.voting_lifetime_hours = float(data["voting_lifetime_hours"])
        session.voting_expires_at = data.get("voting_expires_at")
        session.voting_activity = list(data.get("voting_activity") or [])
        session.public_id = data.get("public_id")
        session.report_status = data.get("report_status") or "none"
        session.report_version = int(data.get("report_version") or 0)
        session.finalized_at = data.get("finalized_at")
        session.report_snapshot = data.get("report_snapshot")
        session.started = bool(data.get("started")) or bool(session.transcript)
        if data.get("common_ground_instructions") is None:
            session.common_ground_instructions = DEFAULT_COMMON_GROUND_INSTRUCTIONS
        else:
            session.common_ground_instructions = sanitize_host_instructions(
                data.get("common_ground_instructions")
            )
        if "vote_comments_public" in data and data["vote_comments_public"] is not None:
            session.vote_comments_public = bool(data["vote_comments_public"])
        for client_id, member in data.get("members", {}).items():
            pid = member.get("participant_id")
            if client_id and pid:
                session.known_participants[client_id] = pid
            if pid and member.get("name"):
                session.participant_names[pid] = member["name"]
            if client_id and member.get("is_host"):
                session.host_client_ids.add(client_id)
                if not session.language and member.get("language"):
                    session.language = member["language"]
            if client_id and "auto_approve" in member:
                session.auto_approve_prefs[client_id] = bool(member["auto_approve"])
            if client_id and "can_add_statement" in member:
                session.statement_perms[client_id] = bool(member["can_add_statement"])
        for s in data.get("statements", []):
            votes = dict(s.get("votes", {}))
            vote_times = {k: float(v) for k, v in (s.get("vote_times") or {}).items()}
            last_vote_at = float(s.get("last_vote_at") or 0)
            if votes and not vote_times and not last_vote_at:
                last_vote_at = float(s.get("created_at") or time.time())
            stmt = Statement(
                id=s["id"],
                text=s["text"],
                round=s.get("round", 1),
                approved=s.get("approved", False),
                custom=s.get("custom", False),
                tension=s.get("tension", False),
                edited=s.get("edited", False),
                created_at=s.get("created_at", time.time()),
                author=s.get("author"),
                snapshot=s.get("snapshot"),
                votes=votes,
                vote_times=vote_times,
                vote_comments={
                    k: str(v) for k, v in (s.get("vote_comments") or {}).items() if v
                },
                last_vote_at=last_vote_at,
                source_text=s.get("source_text") or s.get("sourceText"),
                source_speaker=s.get("source_speaker") or s.get("sourceSpeaker"),
            )
            sync_statement_last_vote_at(stmt)
            session.statements.append(stmt)
        self.sessions[session.id] = session
        return session

    def get(self, session_id: str) -> Optional[Session]:
        return self.sessions.get(session_id)

    def exists(self, session_id: str) -> bool:
        return session_id in self.sessions

    async def join(
        self,
        session_id: str,
        websocket: WebSocket,
        name: str,
        language: str | None = None,
        wants_host: bool = False,
        client_id: str | None = None,
    ) -> str:
        if session_id not in self.sessions:
            self.sessions[session_id] = self._new_session(session_id)

        session = self.sessions[session_id]
        if not session.public_id:
            session.public_id = self._gen_public_id()

        returning = bool(client_id and client_id in session.known_participants)
        participant_id = session.known_participants.get(client_id) if returning else uuid.uuid4().hex[:8]

        participant = Participant(
            id=participant_id,
            name=name,
            websocket=websocket,
            language=language,
            client_id=client_id,
        )
        session.participants[participant_id] = participant
        if client_id:
            session.known_participants[client_id] = participant_id
        session.participant_names[participant_id] = name.strip()[:120]

        perm_key = client_id or participant_id
        if perm_key not in session.statement_perms:
            session.statement_perms[perm_key] = session.default_can_add_statement

        already_host = self._is_host(session, participant_id)
        if not already_host and wants_host and not session.host_client_ids:
            if client_id:
                session.host_client_ids.add(client_id)
            else:
                session.host_participant_id = participant_id
            already_host = self._is_host(session, participant_id)
        if already_host and (
            session.host_participant_id is None
            or session.host_participant_id not in session.participants
        ):
            session.host_participant_id = participant_id
            session.active_mic_id = participant_id
        if already_host and language and not session.language:
            session.language = language

        await websocket.send_json({
            "type": "joined",
            "participantId": participant_id,
            "sessionId": session_id,
            "isHost": self._is_host(session, participant_id),
            "hostIds": self._host_pids(session),
            "recorderId": session.host_participant_id,
            "recording": session.recording,
            "returning": returning,
            "participants": self._participant_list(session),
            "transcript": session.transcript,
            "topic": session.topic,
            "statements": self.format_all_statements(
                session_id, participant_id,
                include_pending=self._is_host(session, participant_id),
            ),
            "voteType": session.vote_type,
            "voteTypeLocked": session.started,
            "expiresAt": session.expires_at,
            "votingOpen": session.voting_open,
            "votingLifetimeHours": session.voting_lifetime_hours,
            "votingExpiresAt": session.voting_expires_at,
            "votingActivity": session.voting_activity,
            "commonGroundMode": session.common_ground_mode,
            "participantsStatus": self.participants_status(session_id),
            "presence": self.presence(session_id),
            "autoApprove": self.get_auto_approve(session_id, participant_id),
            "canAddStatement": self.can_add_statement(session_id, participant_id),
            "defaultCanAddStatement": session.default_can_add_statement,
            "language": language,
            "recorderLanguage": self.get_session_language(session_id),
            "commonGroundHistory": self.get_common_ground_history(session_id, participant_id),
            "publicId": session.public_id,
            "voteCommentsPublic": session.vote_comments_public,
            **(
                {"commonGroundInstructions": session.common_ground_instructions}
                if self._is_host(session, participant_id)
                else {}
            ),
            **self.report_state(
                session_id,
                include_snapshot=self._is_host(session, participant_id),
            ),
        })

        if not returning:
            await self.broadcast(session_id, {
                "type": "participant_joined",
                "participantId": participant_id,
                "name": name,
                "hostIds": self._host_pids(session),
                "recorderId": session.host_participant_id,
                "participants": self._participant_list(session),
            }, exclude=participant_id)

        return participant_id

    def update_level(self, session_id: str, participant_id: str, level: float):
        session = self.sessions.get(session_id)
        if not session:
            return
        participant = session.participants.get(participant_id)
        if not participant:
            return
        if not self.is_host(session_id, participant_id):
            return

        participant.audio_level = level
        participant.last_level_update = time.time()

        now = time.time()
        best = None
        best_level = 0.0
        for p in session.participants.values():
            if now - p.last_level_update < LEVEL_STALE_SECONDS and p.audio_level > best_level:
                best = p
                best_level = p.audio_level

        new_active = best.id if best and best_level > SILENCE_THRESHOLD else None
        if new_active != session.active_mic_id:
            session.active_mic_id = new_active
            return new_active
        return None

    def is_active_mic(self, session_id: str, participant_id: str) -> bool:
        return self.is_host(session_id, participant_id)

    def _is_host(self, session: Session, participant_id: str) -> bool:
        p = session.participants.get(participant_id)
        if not p:
            return False
        if p.client_id:
            return p.client_id in session.host_client_ids
        return participant_id == session.host_participant_id

    def _host_pids(self, session: Session) -> list:
        return [pid for pid in session.participants if self._is_host(session, pid)]

    def is_host(self, session_id: str, participant_id: str) -> bool:
        session = self.sessions.get(session_id)
        return session is not None and self._is_host(session, participant_id)

    def is_recorder(self, session_id: str, participant_id: str) -> bool:
        session = self.sessions.get(session_id)
        return session is not None and session.host_participant_id == participant_id

    def set_recorder(self, session_id: str, participant_id: str) -> bool:
        session = self.sessions.get(session_id)
        if not session or participant_id not in session.participants:
            return False
        if not self._is_host(session, participant_id):
            return False
        session.host_participant_id = participant_id
        session.active_mic_id = participant_id
        return True

    def set_host(self, session_id: str, participant_id: str, make_host: bool = True) -> bool:
        session = self.sessions.get(session_id)
        if not session:
            return False
        target = session.participants.get(participant_id)
        if not target or not target.client_id:
            return False
        if make_host:
            session.host_client_ids.add(target.client_id)
            if session.host_participant_id not in session.participants:
                session.host_participant_id = participant_id
                session.active_mic_id = participant_id
        else:
            if len(session.host_client_ids) <= 1:
                return False
            session.host_client_ids.discard(target.client_id)
            if session.host_participant_id == participant_id:
                next_host = next(iter(self._host_pids(session)), None)
                session.host_participant_id = next_host
                session.active_mic_id = next_host
        return True

    def get_host_id(self, session_id: str) -> str | None:
        session = self.sessions.get(session_id)
        if not session:
            return None
        return session.host_participant_id

    async def set_recording(self, session_id: str, recording: bool):
        session = self.sessions.get(session_id)
        if not session or session.recording == recording:
            return
        session.recording = recording
        if recording:
            session.started = True
            session.active_mic_id = session.host_participant_id
        msg_type = "recording_started" if recording else "recording_stopped"
        await self.broadcast(session_id, {"type": msg_type})

    def add_transcript_entry(self, session_id: str, entry: dict) -> bool:
        session = self.sessions.get(session_id)
        if not session:
            return False
        session.transcript.append(entry)
        return self.note_transcript_activity(session_id)

    def note_transcript_activity(self, session_id: str) -> bool:
        session = self.sessions.get(session_id)
        if not session:
            return False
        session.transcript_since_last_analysis += 1
        return session.transcript_since_last_analysis >= ANALYSIS_BATCH_SIZE and not session.analysis_in_progress

    def should_analyze(self, session_id: str) -> bool:
        session = self.sessions.get(session_id)
        if not session:
            return False
        return session.transcript_since_last_analysis >= ANALYSIS_BATCH_SIZE and not session.analysis_in_progress

    def mark_analysis_started(self, session_id: str):
        session = self.sessions.get(session_id)
        if session:
            session.analysis_in_progress = True
            session.transcript_since_last_analysis = 0

    def mark_analysis_done(self, session_id: str):
        session = self.sessions.get(session_id)
        if session:
            session.analysis_in_progress = False

    def add_statements(
        self,
        session_id: str,
        texts: list[str],
        *,
        source_text: str | None = None,
        source_speaker: str | None = None,
    ) -> list[Statement]:
        session = self.sessions.get(session_id)
        if not session:
            return []
        seen = {normalize_statement(s.text) for s in session.statements}
        added = []
        src = (source_text or "").strip()[:SOURCE_TEXT_MAX] or None
        speaker = (source_speaker or "").strip()[:120] or None
        for text in texts:
            clean = (text or "").strip()[:STATEMENT_TEXT_MAX]
            key = normalize_statement(clean)
            if not key or key in seen:
                continue
            seen.add(key)
            stmt = Statement(
                id=uuid.uuid4().hex[:8],
                text=clean,
                round=1,
                source_text=src,
                source_speaker=speaker,
            )
            session.statements.append(stmt)
            added.append(stmt)
        return added

    def add_custom_statement(self, session_id: str, text: str) -> Optional[Statement]:
        session = self.sessions.get(session_id)
        if not session:
            return None
        stmt = Statement(
            id=uuid.uuid4().hex[:8],
            text=(text or "").strip()[:STATEMENT_TEXT_MAX],
            round=1,
            approved=True,
            custom=True,
        )
        session.statements.append(stmt)
        return stmt

    def add_tension_statements(self, session_id: str, texts: list[str]) -> list[Statement]:
        session = self.sessions.get(session_id)
        if not session:
            return []
        seen = {normalize_statement(s.text) for s in session.statements}
        added = []
        for raw in texts:
            text = (raw or "").strip()[:STATEMENT_TEXT_MAX]
            if not text:
                continue
            key = normalize_statement(text)
            if key in seen:
                continue
            seen.add(key)
            stmt = Statement(
                id=uuid.uuid4().hex[:8],
                text=text,
                round=1,
                approved=True,
                custom=True,
                tension=True,
            )
            session.statements.append(stmt)
            added.append(stmt)
        return added

    def approve_statements(self, session_id: str, statement_ids: set[str] | None = None) -> list[Statement]:
        session = self.sessions.get(session_id)
        if not session:
            return []
        approved = []
        for stmt in session.statements:
            if not stmt.approved and (statement_ids is None or stmt.id in statement_ids):
                stmt.approved = True
                approved.append(stmt)
        return approved

    def edit_statement(self, session_id: str, statement_id: str, text: str) -> Optional[Statement]:
        session = self.sessions.get(session_id)
        if not session:
            return None
        stmt = next((s for s in session.statements if s.id == statement_id), None)
        if not stmt:
            return None
        new_text = (text or "").strip()[:STATEMENT_TEXT_MAX]
        if not new_text:
            return None
        if new_text != stmt.text:
            stmt.text = new_text
            stmt.edited = True
        return stmt

    def delete_statements(self, session_id: str, statement_ids: set[str]) -> list[str]:
        session = self.sessions.get(session_id)
        if not session or not statement_ids:
            return []
        removed = [s.id for s in session.statements if s.id in statement_ids]
        if removed:
            session.statements = [s for s in session.statements if s.id not in statement_ids]
        return removed

    def reject_statements(self, session_id: str, statement_ids: set[str]) -> list[str]:
        session = self.sessions.get(session_id)
        if not session or not statement_ids:
            return []
        pending_ids = {s.id for s in session.statements if not s.approved}
        return self.delete_statements(session_id, statement_ids & pending_ids)

    def has_active_host(self, session_id: str) -> bool:
        session = self.sessions.get(session_id)
        if not session:
            return False
        return session.host_participant_id in session.participants

    def is_voting_open(self, session_id: str) -> bool:
        session = self.sessions.get(session_id)
        if not session:
            return False
        return self._voting_open(session)

    def _voting_open(self, session: Session) -> bool:
        if not session.voting_open:
            return False
        if session.voting_expires_at is not None and time.time() >= session.voting_expires_at:
            return False
        return True

    def _log_voting_activity(self, session: Session, action: str, actor: str, extra: dict | None = None) -> dict:
        entry = {"action": action, "at": time.time(), "by": actor or ""}
        if extra:
            entry.update(extra)
        session.voting_activity.append(entry)
        if len(session.voting_activity) > VOTING_ACTIVITY_MAX:
            session.voting_activity = session.voting_activity[-VOTING_ACTIVITY_MAX:]
        return entry

    def set_voting_open(self, session_id: str, is_open: bool, actor: str = "") -> bool:
        session = self.sessions.get(session_id)
        if not session:
            return False
        was_open = self._voting_open(session)
        session.voting_open = is_open
        if is_open:
            session.voting_expires_at = time.time() + session.voting_lifetime_hours * 3600
        else:
            session.voting_expires_at = None
        if self._voting_open(session) == was_open:
            return True
        self._log_voting_activity(session, "resumed" if is_open else "stopped", actor)
        return True

    def set_voting_lifetime(self, session_id: str, hours: float, actor: str = "") -> bool:
        session = self.sessions.get(session_id)
        if not session:
            return False
        try:
            hours = float(hours)
        except (TypeError, ValueError):
            return False
        hours = max(MIN_VOTING_LIFETIME_HOURS, min(MAX_VOTING_LIFETIME_HOURS, hours))
        session.voting_lifetime_hours = hours
        session.voting_expires_at = time.time() + hours * 3600
        self._log_voting_activity(session, "lifetime", actor, {"hours": hours})
        return True

    def voting_status(self, session_id: str) -> dict:
        session = self.sessions.get(session_id)
        if not session:
            return {}
        return {
            "votingOpen": session.voting_open,
            "votingLifetimeHours": session.voting_lifetime_hours,
            "votingExpiresAt": session.voting_expires_at,
            "votingActivity": session.voting_activity,
        }

    def record_vote(
        self,
        session_id: str,
        participant_id: str,
        statement_id: str,
        vote: str,
        comment: str | None = None,
    ) -> bool:
        session = self.sessions.get(session_id)
        if not session:
            return False
        if not self._voting_open(session):
            return False
        stmt = next((s for s in session.statements if s.id == statement_id), None)
        if not stmt or not stmt.approved:
            return False
        if vote == "undo":
            removed = stmt.votes.pop(participant_id, None) is not None
            stmt.vote_comments.pop(participant_id, None)
            if removed:
                stmt.vote_times.pop(participant_id, None)
                sync_statement_last_vote_at(stmt)
            return removed
        valid = VALID_LIKERT_VOTES if session.vote_type == "likert" else VALID_BINARY_VOTES
        if vote not in valid:
            return False
        same_vote = stmt.votes.get(participant_id) == vote
        comment_provided = comment is not None
        if same_vote and not comment_provided:
            return False
        now = time.time()
        if not same_vote:
            stmt.votes[participant_id] = vote
            stmt.vote_times[participant_id] = now
            stmt.last_vote_at = now
        if comment_provided:
            trimmed = (comment or "").strip()[:VOTE_COMMENT_MAX]
            if trimmed:
                stmt.vote_comments[participant_id] = trimmed
            else:
                stmt.vote_comments.pop(participant_id, None)
        p = session.participants.get(participant_id)
        if p:
            p.last_vote_at = now
        return True

    def format_statement(self, stmt: Statement, participant_id: str, session: Session | None = None) -> dict:
        agrees = sum(1 for v in stmt.votes.values() if v in AGREE_VOTES)
        disagrees = sum(1 for v in stmt.votes.values() if v in DISAGREE_VOTES)
        if session is None:
            session = next((s for s in self.sessions.values() if stmt in s.statements), None)
        is_host = bool(session and self._is_host(session, participant_id))
        comments_public = bool(session.vote_comments_public) if session else True
        comments = []
        if is_host or comments_public:
            for pid, text in (stmt.vote_comments or {}).items():
                if not text:
                    continue
                comments.append({
                    "name": self.get_participant_name(session.id, pid) if session else "",
                    "text": text,
                    "isYou": pid == participant_id,
                })
        return {
            "id": stmt.id,
            "text": stmt.text,
            "round": stmt.round,
            "approved": stmt.approved,
            "custom": stmt.custom,
            "tension": stmt.tension,
            "edited": stmt.edited,
            "author": stmt.author,
            "createdAt": stmt.created_at,
            "snapshot": stmt.snapshot,
            "sourceText": stmt.source_text,
            "sourceSpeaker": stmt.source_speaker,
            "agrees": agrees,
            "disagrees": disagrees,
            "hasVoted": participant_id in stmt.votes,
            "myVote": stmt.votes.get(participant_id),
            "myComment": (stmt.vote_comments or {}).get(participant_id) or "",
            "comments": comments,
            "lastVoteAt": sync_statement_last_vote_at(stmt),
        }

    def vote_matrix(self, session_id: str, participant_id: str) -> dict:
        session = self.sessions.get(session_id)
        if not session:
            return {"statements": [], "voters": []}
        approved = [s for s in session.statements if s.approved]
        pids: list[str] = []
        seen: set[str] = set()
        for s in approved:
            for pid in s.votes.keys():
                if pid not in seen:
                    seen.add(pid)
                    pids.append(pid)
        voters = []
        for idx, pid in enumerate(pids):
            votes = {s.id: s.votes[pid] for s in approved if pid in s.votes}
            voters.append({
                "key": "you" if pid == participant_id else f"p{idx + 1}",
                "isYou": pid == participant_id,
                "votes": votes,
            })
        history = self.get_common_ground_history(session_id, participant_id)
        return {
            "statements": [{"id": s.id, "text": s.text, "custom": s.custom} for s in approved],
            "voters": voters,
            "commonGroundHistory": history,
            "commonGroundMode": session.common_ground_mode,
        }

    def public_results(self, session_id: str) -> Optional[dict]:
        session = self.sessions.get(session_id)
        if not session:
            return None
        result = {
            "publicId": session.public_id,
            "topic": session.topic,
            "language": self.get_session_language(session_id),
            "voteType": session.vote_type,
            "createdAt": session.created_at,
            "participantCount": len(session.known_participants) or len(session.participants),
            "votingOpen": self._voting_open(session),
            **self.report_state(session_id, include_snapshot=False),
        }
        if (
            session.report_snapshot
            and session.report_status in ("published", "stale")
        ):
            result["report"] = session.report_snapshot
            return result
        result.update(self.vote_matrix(session_id, ""))
        return result

    def report_state(
        self,
        session_id: str,
        include_snapshot: bool = False,
    ) -> dict:
        session = self.sessions.get(session_id)
        if not session:
            return {
                "reportStatus": "none",
                "reportVersion": 0,
                "finalizedAt": None,
            }
        result = {
            "reportStatus": session.report_status,
            "reportVersion": session.report_version,
            "finalizedAt": session.finalized_at,
        }
        if include_snapshot and session.report_snapshot:
            result["report"] = session.report_snapshot
        return result

    def begin_report_generation(self, session_id: str) -> bool:
        session = self.sessions.get(session_id)
        if not session:
            return False
        session.report_status = "generating"
        session.voting_open = False
        session.voting_expires_at = None
        return True

    def attach_report_snapshot(self, session_id: str, snapshot: dict) -> bool:
        session = self.sessions.get(session_id)
        if not session or not snapshot:
            return False
        session.report_snapshot = snapshot
        session.report_version = int(snapshot.get("version") or 0)
        session.finalized_at = float(
            snapshot.get("meta", {}).get("finalizedAt")
            or snapshot.get("generatedAt")
            or time.time()
        )
        session.report_status = snapshot.get("status") or "draft_ready"
        return True

    def publish_report(self, session_id: str) -> Optional[dict]:
        session = self.sessions.get(session_id)
        if not session or not session.report_snapshot:
            return None
        now = time.time()
        session.report_status = "published"
        session.report_snapshot["status"] = "published"
        session.report_snapshot["publishedAt"] = now
        return session.report_snapshot

    def mark_report_stale(self, session_id: str) -> bool:
        session = self.sessions.get(session_id)
        if not session or not session.report_snapshot:
            return False
        session.report_status = "stale"
        session.report_snapshot["status"] = "stale"
        return True

    def get_auto_approve(self, session_id: str, participant_id: str) -> bool:
        session = self.sessions.get(session_id)
        if not session:
            return False
        participant = session.participants.get(participant_id)
        client_id = participant.client_id if participant else None
        if not client_id:
            return False
        return session.auto_approve_prefs.get(client_id, False)

    def set_auto_approve(self, session_id: str, participant_id: str, value: bool) -> Optional[str]:
        session = self.sessions.get(session_id)
        if not session:
            return None
        participant = session.participants.get(participant_id)
        client_id = participant.client_id if participant else None
        if not client_id:
            return None
        session.auto_approve_prefs[client_id] = value
        return client_id

    def can_add_statement(self, session_id: str, participant_id: str) -> bool:
        session = self.sessions.get(session_id)
        if not session:
            return False
        if self._is_host(session, participant_id):
            return True
        participant = session.participants.get(participant_id)
        client_id = participant.client_id if participant else None
        if not client_id:
            return session.statement_perms.get(participant_id, True)
        return session.statement_perms.get(client_id, True)

    def set_default_can_add_statement(self, session_id: str, allowed: bool) -> bool:
        session = self.sessions.get(session_id)
        if not session:
            return False
        session.default_can_add_statement = allowed
        return True

    def set_statement_permission(
        self, session_id: str, participant_id: str, allowed: bool
    ) -> Optional[str]:
        session = self.sessions.get(session_id)
        if not session:
            return None
        participant = session.participants.get(participant_id)
        if not participant:
            return None
        key = participant.client_id or participant_id
        session.statement_perms[key] = allowed
        return key

    def add_participant_statement(
        self, session_id: str, text: str, author: str | None = None
    ) -> Optional[Statement]:
        session = self.sessions.get(session_id)
        if not session:
            return None
        clean = (text or "").strip()[:STATEMENT_TEXT_MAX]
        if not clean:
            return None
        if normalize_statement(clean) in {normalize_statement(s.text) for s in session.statements}:
            return None
        snapshot = {
            "participantCount": len(session.participants),
            "statementCount": sum(1 for s in session.statements if s.approved),
        }
        stmt = Statement(
            id=uuid.uuid4().hex[:8],
            text=clean,
            round=1,
            approved=False,
            custom=True,
            author=author,
            snapshot=snapshot,
        )
        session.statements.append(stmt)
        return stmt

    def _cg_vote_tally(self, participant_votes: dict) -> dict:
        agree = sum(1 for v in participant_votes.values() if v.get("vote") == "agree")
        disagree = sum(1 for v in participant_votes.values() if v.get("vote") == "disagree")
        return {"agree": agree, "disagree": disagree, "total": agree + disagree}

    def _find_common_ground(self, session: Session, cg_id: str) -> Optional[dict]:
        for item in session.common_ground_history:
            if item.get("id") == cg_id:
                return item
        return None

    def format_common_ground_item(self, item: dict, participant_id: str) -> dict:
        participant_votes = item.get("participantVotes") or {}
        mine = participant_votes.get(participant_id) or {}
        public = {k: v for k, v in item.items() if k != "participantVotes"}
        public["mode"] = normalize_common_ground_mode(public.get("mode") or public.get("depth"))
        feedback_reasons = []
        for entry in participant_votes.values():
            reason = (entry.get("reason") or "").strip()
            if not reason:
                continue
            feedback_reasons.append({
                "vote": entry.get("vote"),
                "reason": reason,
            })
        return {
            **public,
            "votes": self._cg_vote_tally(participant_votes),
            "myVote": mine.get("vote"),
            "myReason": mine.get("reason") or "",
            "feedbackReasons": feedback_reasons,
        }

    def get_common_ground_history(self, session_id: str, participant_id: str) -> list:
        session = self.sessions.get(session_id)
        if not session:
            return []
        return [
            self.format_common_ground_item(item, participant_id)
            for item in session.common_ground_history
        ]

    def add_common_ground(
        self,
        session_id: str,
        payload: dict,
        participant_id: str,
        snapshot: Optional[dict] = None,
    ) -> Optional[dict]:
        session = self.sessions.get(session_id)
        if not session:
            return None
        snapshot = snapshot or {}
        item = {
            "id": uuid.uuid4().hex[:10],
            **payload,
            "generatedAt": payload.get("generatedAt", time.time()),
            "generatedBy": participant_id,
            "generatedByName": self.get_participant_name(session_id, participant_id),
            "voterCountAtGeneration": snapshot.get("voterCount"),
            "statementCountAtGeneration": snapshot.get("statementCount"),
            "status": payload.get("status") or "working_draft",
            "participantVotes": {},
            "promptVersion": payload.get("promptVersion") or CG_PROMPT_VERSION,
            "customInstructionsUsed": payload.get("customInstructionsUsed") or "",
        }
        if normalize_common_ground_mode(item.get("mode")) == "policy" and "previousVersionId" not in item:
            item["previousVersionId"] = None
        session.common_ground_history.append(item)
        return self.format_common_ground_item(item, participant_id)

    def remove_common_ground(self, session_id: str, cg_id: str) -> bool:
        session = self.sessions.get(session_id)
        if not session:
            return False
        before = len(session.common_ground_history)
        session.common_ground_history = [
            item for item in session.common_ground_history if item.get("id") != cg_id
        ]
        return len(session.common_ground_history) < before

    def record_common_ground_vote(
        self,
        session_id: str,
        cg_id: str,
        participant_id: str,
        vote: str,
        reason: str | None = None,
    ) -> bool:
        session = self.sessions.get(session_id)
        if not session:
            return False
        item = self._find_common_ground(session, cg_id)
        if not item:
            return False
        if item.get("status") == "endorsed":
            return False
        participant_votes = item.setdefault("participantVotes", {})
        if vote == "undo":
            participant_votes.pop(participant_id, None)
            return True
        if vote not in ("agree", "disagree"):
            return False
        trimmed_reason = (reason or "").strip()[:COMMON_GROUND_REASON_MAX]
        participant_votes[participant_id] = {
            "vote": vote,
            "reason": trimmed_reason or None,
            "name": self.get_participant_name(session_id, participant_id),
        }
        return True

    def common_ground_vote_tally(self, session_id: str, cg_id: str) -> dict:
        session = self.sessions.get(session_id)
        if not session:
            return {"agree": 0, "disagree": 0, "total": 0}
        item = self._find_common_ground(session, cg_id)
        if not item:
            return {"agree": 0, "disagree": 0, "total": 0}
        return self._cg_vote_tally(item.get("participantVotes") or {})

    def collect_common_ground_feedback(self, session_id: str, mode: str | None = None) -> list:
        session = self.sessions.get(session_id)
        if not session:
            return []
        target = normalize_common_ground_mode(mode) if mode else None
        if target == "policy":
            from .policy_evidence import build_anonymous_policy_feedback
            history = [
                item for item in session.common_ground_history
                if normalize_common_ground_mode(item.get("mode") or item.get("depth")) == "policy"
            ]
            return build_anonymous_policy_feedback(history)

        feedback_history = []
        for item in session.common_ground_history:
            item_mode = normalize_common_ground_mode(item.get("mode") or item.get("depth"))
            if target and item_mode != target:
                continue
            participant_votes = item.get("participantVotes") or {}
            reactions = []
            for entry in participant_votes.values():
                reaction = {"vote": entry.get("vote"), "name": entry.get("name")}
                if entry.get("reason"):
                    reaction["reason"] = entry["reason"]
                reactions.append(reaction)
            feedback_history.append({
                "id": item.get("id"),
                "generatedAt": item.get("generatedAt"),
                "mode": item_mode,
                "groupStatement": item.get("groupStatement"),
                "votes": self._cg_vote_tally(participant_votes),
                "feedback": reactions,
            })
        return feedback_history

    def endorse_common_ground(self, session_id: str, cg_id: str, participant_id: str) -> Optional[dict]:
        """Mark a version as Final/endorsed and freeze the current reaction tally."""
        session = self.sessions.get(session_id)
        if not session:
            return None
        item = self._find_common_ground(session, cg_id)
        if not item:
            return None
        # Only endorse the latest version.
        if not session.common_ground_history or session.common_ground_history[-1].get("id") != cg_id:
            return None
        if item.get("status") == "endorsed":
            return self.format_common_ground_item(item, participant_id)

        tally = self._cg_vote_tally(item.get("participantVotes") or {})
        # Respondents = people who reacted; also remember roster size at endorsement.
        roster = set(session.known_participants.values()) | set(session.participants.keys())
        for s in session.statements:
            if s.approved:
                roster.update(s.votes.keys())
        roster_size = max(len(roster), tally["total"])
        item["status"] = "endorsed"
        item["endorsedAt"] = time.time()
        item["endorsedBy"] = participant_id
        item["endorsedByName"] = self.get_participant_name(session_id, participant_id)
        item["endorsement"] = {
            "agree": tally["agree"],
            "disagree": tally["disagree"],
            "total": tally["total"],
            "respondentCount": tally["total"],
            "rosterSize": roster_size,
            "summary": (
                f"Endorsed as good enough by {tally['agree']} of "
                f"{tally['total'] or roster_size} respondents"
                if tally["total"]
                else "Endorsed as final (no reactions recorded yet)"
            ),
            "remainingConcerns": [
                {"reason": (entry.get("reason") or "").strip()}
                for entry in (item.get("participantVotes") or {}).values()
                if entry.get("vote") == "disagree" and (entry.get("reason") or "").strip()
            ],
        }
        return self.format_common_ground_item(item, participant_id)

    def format_all_statements(self, session_id: str, participant_id: str, include_pending: bool = False) -> list:
        session = self.sessions.get(session_id)
        if not session:
            return []
        return [
            self.format_statement(s, participant_id, session)
            for s in session.statements
            if include_pending or s.approved
        ]

    async def broadcast(self, session_id: str, message: dict, exclude: str | None = None):
        session = self.sessions.get(session_id)
        if not session:
            return
        disconnected = []
        for pid, participant in session.participants.items():
            if pid == exclude:
                continue
            try:
                await participant.websocket.send_json(message)
            except Exception:
                disconnected.append(pid)
        for pid in disconnected:
            del session.participants[pid]

    async def broadcast_statements(self, session_id: str):
        session = self.sessions.get(session_id)
        if not session:
            return
        disconnected = []
        for pid, participant in session.participants.items():
            try:
                await participant.websocket.send_json({
                    "type": "statements_updated",
                    "statements": self.format_all_statements(
                        session_id, pid,
                        include_pending=self._is_host(session, pid),
                    ),
                    "voteType": session.vote_type,
                })
            except Exception:
                disconnected.append(pid)
        for pid in disconnected:
            del session.participants[pid]

    async def broadcast_vote(self, session_id: str, statement_id: str):
        session = self.sessions.get(session_id)
        if not session:
            return
        stmt = next((s for s in session.statements if s.id == statement_id), None)
        if not stmt:
            return
        disconnected = []
        agrees = sum(1 for v in stmt.votes.values() if v in AGREE_VOTES)
        disagrees = sum(1 for v in stmt.votes.values() if v in DISAGREE_VOTES)
        for pid, participant in session.participants.items():
            try:
                await participant.websocket.send_json({
                    "type": "vote_updated",
                    "statementId": stmt.id,
                    "agrees": agrees,
                    "disagrees": disagrees,
                    "hasVoted": pid in stmt.votes,
                    "myVote": stmt.votes.get(pid),
                    "myComment": (stmt.vote_comments or {}).get(pid) or "",
                    "comments": self.format_statement(stmt, pid, session).get("comments") or [],
                    "lastVoteAt": sync_statement_last_vote_at(stmt),
                })
            except Exception:
                disconnected.append(pid)
        for pid in disconnected:
            del session.participants[pid]

    def participants_status(self, session_id: str) -> list:
        session = self.sessions.get(session_id)
        if not session:
            return []
        approved = [s for s in session.statements if s.approved]
        required = len(approved)
        return [
            {
                "id": p.id,
                "name": p.name,
                "language": p.language,
                "isHost": self._is_host(session, p.id),
                "isRecorder": p.id == session.host_participant_id,
                "canAddStatement": self.can_add_statement(session_id, p.id),
                "votesCast": sum(1 for s in approved if p.id in s.votes),
                "votesRequired": required,
            }
            for p in session.participants.values()
        ]

    async def broadcast_participants(self, session_id: str):
        await self.broadcast(session_id, {
            "type": "participants_status",
            "participants": self.participants_status(session_id),
        })

    def presence(self, session_id: str, window: float = 8.0) -> dict:
        session = self.sessions.get(session_id)
        if not session:
            return {"here": 0, "votingNow": 0}
        now = time.time()
        voting = sum(
            1 for p in session.participants.values()
            if p.last_vote_at and now - p.last_vote_at <= window
        )
        return {"here": len(session.participants), "votingNow": voting}

    async def broadcast_presence(self, session_id: str):
        await self.broadcast(session_id, {
            "type": "presence",
            **self.presence(session_id),
        })

    async def broadcast_hosts(self, session_id: str):
        session = self.sessions.get(session_id)
        if not session:
            return
        await self.broadcast(session_id, {
            "type": "hosts_updated",
            "hostIds": self._host_pids(session),
            "recorderId": session.host_participant_id,
        })

    def set_topic(self, session_id: str, topic: str | None) -> str | None:
        session = self.sessions.get(session_id)
        if not session:
            return None
        session.topic = (topic or "").strip()[:200] or None
        return session.topic

    def set_common_ground_mode(self, session_id: str, mode: str) -> str | None:
        session = self.sessions.get(session_id)
        if not session or mode not in COMMON_GROUND_MODES:
            return None
        session.common_ground_mode = mode
        return mode

    def set_common_ground_instructions(self, session_id: str, text: str | None) -> str | None:
        session = self.sessions.get(session_id)
        if not session:
            return None
        session.common_ground_instructions = sanitize_host_instructions(text)
        return session.common_ground_instructions

    def set_vote_comments_public(self, session_id: str, public: bool) -> bool | None:
        session = self.sessions.get(session_id)
        if not session:
            return None
        session.vote_comments_public = bool(public)
        return session.vote_comments_public

    def set_vote_type(self, session_id: str, vote_type: str) -> str | None:
        session = self.sessions.get(session_id)
        if not session or vote_type not in VOTE_TYPES or session.started:
            return None
        session.vote_type = vote_type
        return vote_type

    def rename_participant(self, session_id: str, participant_id: str, name: str) -> bool:
        session = self.sessions.get(session_id)
        if not session or participant_id not in session.participants:
            return False
        clean = name.strip()[:120]
        session.participants[participant_id].name = clean
        session.participant_names[participant_id] = clean
        return True

    def leave(self, session_id: str, participant_id: str, websocket: WebSocket | None = None) -> dict:
        result = {
            "removed": False,
            "session_removed": False,
            "host_changed": False,
            "hostParticipantId": None,
            "recording_stopped": False,
        }
        session = self.sessions.get(session_id)
        if not session:
            return result
        participant = session.participants.get(participant_id)
        if not participant:
            return result
        if websocket is not None and participant.websocket is not websocket:
            return result
        del session.participants[participant_id]
        result["removed"] = True
        if not session.participants:
            del self.sessions[session_id]
            result["session_removed"] = True
            return result
        if session.host_participant_id not in session.participants:
            session.host_participant_id = None
            session.active_mic_id = None
            if session.recording:
                session.recording = False
                result["recording_stopped"] = True
        result["hostParticipantId"] = session.host_participant_id
        return result

    def get_participant_name(self, session_id: str, participant_id: str) -> str:
        session = self.sessions.get(session_id)
        if not session:
            return "Unknown"
        if participant_id in session.participants:
            return session.participants[participant_id].name
        return session.participant_names.get(participant_id, "Unknown")

    def get_participant_language(self, session_id: str, participant_id: str) -> str | None:
        session = self.sessions.get(session_id)
        if session and participant_id in session.participants:
            return session.participants[participant_id].language
        return None

    def get_session_language(self, session_id: str) -> str | None:
        session = self.sessions.get(session_id)
        if not session:
            return None
        if session.language:
            return session.language
        if not session.host_participant_id:
            return None
        return self.get_participant_language(session_id, session.host_participant_id)

    def get_recorder_language(self, session_id: str) -> str | None:
        """Compatibility alias for callers that still use the former name."""
        return self.get_session_language(session_id)

    def set_session_language(self, session_id: str, language: str | None) -> bool:
        session = self.sessions.get(session_id)
        if not session:
            return False
        session.language = language
        return True

    def set_participant_language(
        self,
        session_id: str,
        participant_id: str,
        language: str | None,
    ) -> bool:
        session = self.sessions.get(session_id)
        if not session:
            return False
        participant = session.participants.get(participant_id)
        if not participant:
            return False
        participant.language = language
        return True

    def _participant_list(self, session: Session) -> list:
        return [
            {
                "id": p.id,
                "name": p.name,
                "language": p.language,
                "isHost": self._is_host(session, p.id),
            }
            for p in session.participants.values()
        ]
