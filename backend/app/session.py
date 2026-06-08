from __future__ import annotations

import re
import uuid
import time
from dataclasses import dataclass, field
from typing import Dict, Optional


def normalize_statement(text: str) -> str:
    lowered = re.sub(r"[^\w\s]", "", text.lower())
    return " ".join(lowered.split())

from fastapi import WebSocket


@dataclass
class Participant:
    id: str
    name: str
    websocket: WebSocket
    language: Optional[str] = None
    client_id: Optional[str] = None
    audio_level: float = 0.0
    last_level_update: float = 0.0


@dataclass
class Statement:
    id: str
    text: str
    round: int
    approved: bool = False
    custom: bool = False
    created_at: float = field(default_factory=time.time)
    votes: Dict[str, str] = field(default_factory=dict)


@dataclass
class Session:
    id: str
    topic: Optional[str] = None
    participants: Dict[str, Participant] = field(default_factory=dict)
    transcript: list = field(default_factory=list)
    host_participant_id: Optional[str] = None
    host_client_ids: set[str] = field(default_factory=set)
    active_mic_id: Optional[str] = None
    recording: bool = False
    statements: list[Statement] = field(default_factory=list)
    current_round: int = 1
    transcript_since_last_analysis: int = 0
    analysis_in_progress: bool = False
    threshold: int = 5
    created_at: float = field(default_factory=time.time)
    expires_at: Optional[float] = None
    known_participants: Dict[str, str] = field(default_factory=dict)
    common_ground: Optional[dict] = None


SILENCE_THRESHOLD = 0.01
LEVEL_STALE_SECONDS = 2.0
ANALYSIS_BATCH_SIZE = 3


class SessionManager:
    def __init__(self, ttl_seconds: float | None = None):
        self.sessions: Dict[str, Session] = {}
        self.ttl_seconds = ttl_seconds

    def _new_session(self, session_id: str, topic: str | None = None) -> Session:
        now = time.time()
        expires_at = now + self.ttl_seconds if self.ttl_seconds else None
        return Session(id=session_id, topic=topic, created_at=now, expires_at=expires_at)

    def create(self, topic: str | None = None) -> str:
        session_id = uuid.uuid4().hex[:6].upper()
        self.sessions[session_id] = self._new_session(session_id, topic)
        return session_id

    def hydrate(self, data: dict) -> Session:
        session = Session(
            id=data["id"],
            topic=data.get("topic"),
            current_round=data.get("current_round", 1),
            threshold=data.get("threshold", 5),
            created_at=data.get("created_at", time.time()),
            expires_at=data.get("expires_at"),
        )
        session.transcript = list(data.get("transcript", []))
        for client_id, member in data.get("members", {}).items():
            pid = member.get("participant_id")
            if client_id and pid:
                session.known_participants[client_id] = pid
        for s in data.get("statements", []):
            session.statements.append(Statement(
                id=s["id"],
                text=s["text"],
                round=s.get("round", 1),
                approved=s.get("approved", False),
                custom=s.get("custom", False),
                created_at=s.get("created_at", time.time()),
                votes=dict(s.get("votes", {})),
            ))
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

        no_hosts_yet = not session.host_client_ids
        if no_hosts_yet and (wants_host or session.host_participant_id is None):
            if client_id:
                session.host_client_ids.add(client_id)
            session.host_participant_id = participant_id
            session.active_mic_id = participant_id
        elif self._is_host(session, participant_id) and (
            session.host_participant_id is None
            or session.host_participant_id not in session.participants
        ):
            session.host_participant_id = participant_id
            session.active_mic_id = participant_id

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
            "currentRoundCount": self.get_current_round_count(session_id),
            "threshold": session.threshold,
            "participantsStatus": self.participants_status(session_id),
        })

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

    def add_statements(self, session_id: str, texts: list[str]) -> list[Statement]:
        session = self.sessions.get(session_id)
        if not session:
            return []
        seen = {normalize_statement(s.text) for s in session.statements}
        added = []
        for text in texts:
            key = normalize_statement(text)
            if not key or key in seen:
                continue
            seen.add(key)
            stmt = Statement(
                id=uuid.uuid4().hex[:8],
                text=text,
                round=session.current_round,
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
            text=text,
            round=session.current_round,
            approved=True,
            custom=True,
        )
        session.statements.append(stmt)
        return stmt

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

    def has_active_host(self, session_id: str) -> bool:
        session = self.sessions.get(session_id)
        if not session:
            return False
        return session.host_participant_id in session.participants

    def get_current_round_count(self, session_id: str) -> int:
        session = self.sessions.get(session_id)
        if not session:
            return 0
        return sum(1 for s in session.statements if s.round == session.current_round)

    def check_and_advance_round(self, session_id: str) -> int | None:
        session = self.sessions.get(session_id)
        if not session:
            return None
        if self.get_current_round_count(session_id) >= session.threshold:
            completed = session.current_round
            session.current_round += 1
            return completed
        return None

    def record_vote(self, session_id: str, participant_id: str, statement_id: str, vote: str) -> bool:
        if vote not in ("agree", "disagree", "neutral"):
            return False
        session = self.sessions.get(session_id)
        if not session:
            return False
        stmt = next((s for s in session.statements if s.id == statement_id), None)
        if not stmt or not stmt.approved or participant_id in stmt.votes:
            return False
        stmt.votes[participant_id] = vote
        return True

    def format_statement(self, stmt: Statement, participant_id: str) -> dict:
        agrees = sum(1 for v in stmt.votes.values() if v == "agree")
        disagrees = sum(1 for v in stmt.votes.values() if v == "disagree")
        return {
            "id": stmt.id,
            "text": stmt.text,
            "round": stmt.round,
            "approved": stmt.approved,
            "custom": stmt.custom,
            "agrees": agrees,
            "disagrees": disagrees,
            "hasVoted": participant_id in stmt.votes,
            "myVote": stmt.votes.get(participant_id),
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
        return {
            "statements": [{"id": s.id, "text": s.text, "custom": s.custom} for s in approved],
            "voters": voters,
            "commonGround": session.common_ground,
        }

    def set_common_ground(self, session_id: str, payload: Optional[dict]) -> Optional[dict]:
        session = self.sessions.get(session_id)
        if not session:
            return None
        session.common_ground = payload
        return payload

    def format_all_statements(self, session_id: str, participant_id: str, include_pending: bool = False) -> list:
        session = self.sessions.get(session_id)
        if not session:
            return []
        return [
            self.format_statement(s, participant_id)
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
        round_count = self.get_current_round_count(session_id)
        disconnected = []
        for pid, participant in session.participants.items():
            try:
                await participant.websocket.send_json({
                    "type": "statements_updated",
                    "statements": self.format_all_statements(
                        session_id, pid,
                        include_pending=self._is_host(session, pid),
                    ),
                    "currentRoundCount": round_count,
                    "threshold": session.threshold,
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
        for pid, participant in session.participants.items():
            agrees = sum(1 for v in stmt.votes.values() if v == "agree")
            disagrees = sum(1 for v in stmt.votes.values() if v == "disagree")
            try:
                await participant.websocket.send_json({
                    "type": "vote_updated",
                    "statementId": stmt.id,
                    "agrees": agrees,
                    "disagrees": disagrees,
                    "hasVoted": pid in stmt.votes,
                    "myVote": stmt.votes.get(pid),
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

    def rename_participant(self, session_id: str, participant_id: str, name: str) -> bool:
        session = self.sessions.get(session_id)
        if not session or participant_id not in session.participants:
            return False
        session.participants[participant_id].name = name.strip()[:120]
        return True

    def leave(self, session_id: str, participant_id: str) -> dict:
        result = {
            "session_removed": False,
            "host_changed": False,
            "hostParticipantId": None,
            "recording_stopped": False,
        }
        session = self.sessions.get(session_id)
        if not session:
            return result
        if participant_id in session.participants:
            del session.participants[participant_id]
        if not session.participants:
            del self.sessions[session_id]
            result["session_removed"] = True
            return result
        if session.host_participant_id not in session.participants:
            next_host = next(iter(self._host_pids(session)), None)
            if next_host:
                session.host_participant_id = next_host
                session.active_mic_id = next_host
                result["host_changed"] = True
        result["hostParticipantId"] = session.host_participant_id
        return result

    def get_participant_name(self, session_id: str, participant_id: str) -> str:
        session = self.sessions.get(session_id)
        if session and participant_id in session.participants:
            return session.participants[participant_id].name
        return "Unknown"

    def get_participant_language(self, session_id: str, participant_id: str) -> str | None:
        session = self.sessions.get(session_id)
        if session and participant_id in session.participants:
            return session.participants[participant_id].language
        return None

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
