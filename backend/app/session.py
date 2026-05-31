from __future__ import annotations

import uuid
import time
from dataclasses import dataclass, field
from typing import Dict, Optional

from fastapi import WebSocket


@dataclass
class Participant:
    id: str
    name: str
    websocket: WebSocket
    language: Optional[str] = None
    audio_level: float = 0.0
    last_level_update: float = 0.0


@dataclass
class Statement:
    id: str
    text: str
    round: int
    votes: Dict[str, str] = field(default_factory=dict)


@dataclass
class Session:
    id: str
    topic: Optional[str] = None
    participants: Dict[str, Participant] = field(default_factory=dict)
    transcript: list = field(default_factory=list)
    host_participant_id: Optional[str] = None
    active_mic_id: Optional[str] = None
    recording: bool = False
    statements: list[Statement] = field(default_factory=list)
    current_round: int = 1
    transcript_since_last_analysis: int = 0
    analysis_in_progress: bool = False
    threshold: int = 5


SILENCE_THRESHOLD = 0.01
LEVEL_STALE_SECONDS = 2.0
ANALYSIS_BATCH_SIZE = 3


class SessionManager:
    def __init__(self):
        self.sessions: Dict[str, Session] = {}

    def create(self, topic: str | None = None) -> str:
        session_id = uuid.uuid4().hex[:6].upper()
        self.sessions[session_id] = Session(id=session_id, topic=topic)
        return session_id

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
    ) -> str:
        if session_id not in self.sessions:
            self.sessions[session_id] = Session(id=session_id)

        participant_id = uuid.uuid4().hex[:8]
        participant = Participant(
            id=participant_id,
            name=name,
            websocket=websocket,
            language=language,
        )
        session = self.sessions[session_id]
        session.participants[participant_id] = participant
        if session.host_participant_id not in session.participants or session.host_participant_id is None:
            session.host_participant_id = participant_id
            session.active_mic_id = participant_id

        await websocket.send_json({
            "type": "joined",
            "participantId": participant_id,
            "sessionId": session_id,
            "isHost": participant_id == session.host_participant_id,
            "hostParticipantId": session.host_participant_id,
            "recording": session.recording,
            "participants": self._participant_list(session),
            "transcript": session.transcript,
            "topic": session.topic,
            "statements": self.format_all_statements(session_id, participant_id),
            "currentRoundCount": self.get_current_round_count(session_id),
            "threshold": session.threshold,
        })

        await self.broadcast(session_id, {
            "type": "participant_joined",
            "participantId": participant_id,
            "name": name,
            "hostParticipantId": session.host_participant_id,
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

    def is_host(self, session_id: str, participant_id: str) -> bool:
        session = self.sessions.get(session_id)
        return session is not None and session.host_participant_id == participant_id

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
        added = []
        for text in texts:
            stmt = Statement(
                id=uuid.uuid4().hex[:8],
                text=text,
                round=session.current_round,
            )
            session.statements.append(stmt)
            added.append(stmt)
        return added

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
        if vote not in ("agree", "disagree"):
            return False
        session = self.sessions.get(session_id)
        if not session:
            return False
        stmt = next((s for s in session.statements if s.id == statement_id), None)
        if not stmt or participant_id in stmt.votes:
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
            "agrees": agrees,
            "disagrees": disagrees,
            "hasVoted": participant_id in stmt.votes,
            "myVote": stmt.votes.get(participant_id),
        }

    def format_all_statements(self, session_id: str, participant_id: str) -> list:
        session = self.sessions.get(session_id)
        if not session:
            return []
        return [self.format_statement(s, participant_id) for s in session.statements]

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
                    "statements": self.format_all_statements(session_id, pid),
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
        was_host = session.host_participant_id == participant_id
        if participant_id in session.participants:
            del session.participants[participant_id]
        if not session.participants:
            del self.sessions[session_id]
            result["session_removed"] = True
            return result
        if was_host:
            session.host_participant_id = next(iter(session.participants))
            session.active_mic_id = session.host_participant_id
            result["host_changed"] = True
            if session.recording:
                session.recording = False
                result["recording_stopped"] = True
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
                "isHost": p.id == session.host_participant_id,
            }
            for p in session.participants.values()
        ]
