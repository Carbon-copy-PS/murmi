from __future__ import annotations

import asyncio
import base64
import os
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional

from .session import SessionManager
from .transcription import TranscriptionService
from .analysis import AnalysisService
from .realtime_transcription import RealtimeTranscriptionSession
from .db import Database
from .languages import LANGUAGE_CODES as PARTICIPANT_LANGUAGES

load_dotenv()

db = Database()
sessions = SessionManager(ttl_seconds=None)
transcription = TranscriptionService()
analysis = AnalysisService()

SESSION_PURGE_INTERVAL_SECONDS = float(os.environ.get("SESSION_PURGE_INTERVAL_MINUTES", "15")) * 60


async def _safe_db(coro):
    try:
        await coro
    except Exception as exc:
        print(f"DB write error: {exc}")


async def persist_session(session):
    if not db.enabled or session is None:
        return
    await _safe_db(db.save_session(session))


async def drop_session(session_id: str):
    session = sessions.get(session_id)
    if not session:
        return
    try:
        await sessions.broadcast(session_id, {"type": "session_expired"})
    except Exception:
        pass
    await close_realtime_sessions(session_id)
    for participant in list(session.participants.values()):
        try:
            await participant.websocket.close(code=4001, reason="Session expired")
        except Exception:
            pass
    sessions.sessions.pop(session_id, None)
    mock_index.pop(session_id, None)
    auto_play_tasks.pop(session_id, None)


async def purge_expired_sessions():
    # Session data is retained indefinitely — nothing is ever purged.
    return


async def purge_loop():
    while True:
        await asyncio.sleep(SESSION_PURGE_INTERVAL_SECONDS)
        await purge_expired_sessions()


VOTING_WATCH_INTERVAL_SECONDS = 30


async def auto_close_expired_voting():
    now = time.time()
    for session_id, session in list(sessions.sessions.items()):
        if session.voting_open and session.voting_expires_at and now >= session.voting_expires_at:
            session.voting_open = False
            session.voting_expires_at = None
            sessions._log_voting_activity(session, "expired", "")
            await _safe_db(db.update_voting(session))
            await sessions.broadcast(session_id, {
                "type": "voting_status_updated",
                **sessions.voting_status(session_id),
            })


async def voting_watch_loop():
    while True:
        await asyncio.sleep(VOTING_WATCH_INTERVAL_SECONDS)
        try:
            await auto_close_expired_voting()
        except Exception as exc:
            print(f"Voting watch error: {exc}")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    purge_task = None
    try:
        connected = await db.connect()
        if connected:
            loaded = await db.load_active_sessions()
            for data in loaded:
                sessions.hydrate(data)
            print(f"DB connected — hydrated {len(loaded)} active session(s)")
    except Exception as exc:
        print(f"DB init failed ({exc}); continuing in-memory only")
        db.enabled = False
        sessions.ttl_seconds = None
    purge_task = asyncio.create_task(purge_loop())
    voting_task = asyncio.create_task(voting_watch_loop())
    try:
        yield
    finally:
        for task in (purge_task, voting_task):
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        await db.disconnect()


app = FastAPI(title="HearTheRoom", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
realtime_sessions: dict[tuple[str, str], RealtimeTranscriptionSession] = {}
realtime_unavailable: set[tuple[str, str]] = set()
realtime_errors_seen: set[tuple[str, str]] = set()
turn_analysis_tasks: dict[tuple[str, str], asyncio.Task] = {}
TRANSCRIPT_MERGE_WINDOW_SECONDS = 12
SPEAKER_TURN_IDLE_SECONDS = 2
FILLER_TRANSCRIPTS = {
    "uh",
    "um",
    "äh",
    "ähm",
    "eh",
    "euh",
    "hmm",
    "mm",
    "okay",
    "ok",
    "yeah",
    "yes",
    "no",
}
GENERIC_ASR_HALLUCINATION_MARKERS = (
    "ladies and gentlemen",
    "as we gather here today",
    "future of our community",
    "fundamental values that bind us together",
    "pursuit of happiness",
    "thank you for watching",
    "don't forget to subscribe",
    "like and subscribe",
)


class CreateSessionRequest(BaseModel):
    topic: Optional[str] = None
    voteType: Optional[str] = None


@app.post("/api/sessions")
async def create_session(req: CreateSessionRequest = CreateSessionRequest()):
    topic = req.topic.strip() if req.topic else None
    vote_type = req.voteType if req.voteType in ("binary", "likert") else "binary"
    session_id = sessions.create(topic=topic, vote_type=vote_type)
    await persist_session(sessions.get(session_id))
    return {
        "sessionId": session_id,
        "topic": topic,
        "voteType": vote_type,
        "publicId": sessions.get(session_id).public_id,
    }


MOCK_TRANSCRIPT = [
    ("Anna", "I think Switzerland needs to take a much stronger stance on AI regulation. We're falling behind the EU."),
    ("Beat", "I disagree. Over-regulation will kill our startup ecosystem. Zurich and Lausanne are thriving precisely because we haven't strangled innovation."),
    ("Clara", "But we need some guardrails. Look at what happened with facial recognition in public spaces — there was no framework at all."),
    ("Anna", "Exactly. And it's not just about startups. Public trust matters. People won't adopt AI in healthcare if they don't trust the oversight."),
    ("David", "Healthcare is a good example though. The Swiss approach of sector-specific guidelines has actually worked quite well there."),
    ("Beat", "I agree with David. A horizontal AI law like the EU AI Act would be too blunt for our system. We should regulate by sector."),
    ("Clara", "Sector-specific sounds nice but it creates gaps. What about cross-cutting issues like algorithmic bias? No single sector owns that."),
    ("David", "That's a fair point. Maybe we need a lightweight federal framework plus sector-specific rules on top."),
    ("Anna", "And we absolutely need transparency requirements. Citizens should know when they're interacting with an AI system."),
    ("Beat", "Transparency yes, but mandatory disclosure for every chatbot interaction is excessive. It should be risk-based."),
    ("Clara", "I think the bigger issue is data sovereignty. Swiss data should stay in Switzerland, especially for sensitive domains."),
    ("David", "Data localization is expensive and impractical for smaller companies. Cloud infrastructure doesn't respect borders."),
    ("Anna", "But national security and health data are different. We can't have patient records processed on foreign servers."),
    ("Beat", "We already have the FADP for that. Adding AI-specific data rules on top creates regulatory overlap."),
    ("Clara", "The FADP wasn't designed for AI. It doesn't address training data, model outputs, or synthetic data at all."),
]

mock_index: dict[str, int] = {}


@app.post("/api/sessions/{session_id}/mock")
async def mock_transcript(session_id: str):
    """Inject 3 fake transcript entries to trigger analysis. Call multiple times."""
    session_id = session_id.upper()
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    idx = mock_index.get(session_id, 0)
    if idx >= len(MOCK_TRANSCRIPT):
        mock_index[session_id] = 0
        idx = 0

    added = []
    for i in range(3):
        if idx + i >= len(MOCK_TRANSCRIPT):
            break
        speaker, text = MOCK_TRANSCRIPT[idx + i]
        entry = {
            "type": "transcript",
            "text": text,
            "speaker": speaker,
            "timestamp": time.time() + i,
        }
        should_analyze = sessions.add_transcript_entry(session_id, entry)
        await sessions.broadcast(session_id, entry)
        await _safe_db(db.save_transcript_entry(session, entry))
        added.append(entry)

        if should_analyze:
            sessions.mark_analysis_started(session_id)
            asyncio.create_task(run_analysis(session_id))

    mock_index[session_id] = idx + len(added)
    return {
        "added": len(added),
        "total": len(session.transcript),
        "remaining": max(0, len(MOCK_TRANSCRIPT) - mock_index[session_id]),
    }


auto_play_tasks: dict[str, asyncio.Task] = {}


async def auto_play(session_id: str):
    idx = mock_index.get(session_id, 0)
    while idx < len(MOCK_TRANSCRIPT):
        session = sessions.get(session_id)
        if not session:
            break
        speaker, text = MOCK_TRANSCRIPT[idx]
        entry = {
            "type": "transcript",
            "text": text,
            "speaker": speaker,
            "timestamp": time.time(),
        }
        should_analyze = sessions.add_transcript_entry(session_id, entry)
        await sessions.broadcast(session_id, entry)
        await _safe_db(db.save_transcript_entry(session, entry))
        idx += 1
        mock_index[session_id] = idx

        if should_analyze:
            sessions.mark_analysis_started(session_id)
            asyncio.create_task(run_analysis(session_id))

        await asyncio.sleep(2)

    auto_play_tasks.pop(session_id, None)


@app.post("/api/sessions/{session_id}/mock/auto")
async def mock_auto_play(session_id: str):
    session_id = session_id.upper()
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session_id in auto_play_tasks and not auto_play_tasks[session_id].done():
        return {"status": "already_running"}

    task = asyncio.create_task(auto_play(session_id))
    auto_play_tasks[session_id] = task
    remaining = len(MOCK_TRANSCRIPT) - mock_index.get(session_id, 0)
    return {"status": "started", "entries": remaining}


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    sid = session_id.upper()
    session = sessions.get(sid)
    if not session and db.enabled:
        restored = await db.load_session(sid)
        if restored:
            sessions.hydrate(restored)
            session = sessions.get(sid)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "sessionId": session.id,
        "participantCount": len(session.participants),
        "recording": session.recording,
    }


def auto_approve_if_no_host(session_id: str, statements: list) -> list:
    pending_ids = [s.id for s in statements if not s.approved]
    if pending_ids and not sessions.has_active_host(session_id):
        return sessions.approve_statements(session_id, set(pending_ids))
    return []


async def run_analysis(session_id: str):
    session = sessions.get(session_id)
    if not session:
        return
    try:
        new_texts = await analysis.extract_statements(
            transcript_entries=session.transcript,
            existing_statements=[s.text for s in session.statements],
            topic=session.topic,
            language=session_statement_language(session_id),
        )
        if not new_texts:
            return

        added = sessions.add_statements(session_id, new_texts)
        auto_approve_if_no_host(session_id, added)
        await _safe_db(db.save_statements(session, added))
        await sessions.broadcast_statements(session_id)
    except Exception as e:
        print(f"Analysis task error: {e}")
    finally:
        sessions.mark_analysis_done(session_id)


COMMON_GROUND_TIMEOUT_SECONDS = float(os.environ.get("COMMON_GROUND_TIMEOUT_SECONDS", "45"))
TENSION_TIMEOUT_SECONDS = float(os.environ.get("TENSION_TIMEOUT_SECONDS", "45"))
TENSION_TRANSCRIPT_MAX_TURNS = int(os.environ.get("TENSION_TRANSCRIPT_MAX_TURNS", "80"))
TENSION_TRANSCRIPT_MAX_CHARS = int(os.environ.get("TENSION_TRANSCRIPT_MAX_CHARS", "12000"))


def build_transcript_excerpt(session) -> list[dict]:
    if not session or not getattr(session, "transcript", None):
        return []
    turns = []
    for entry in session.transcript:
        text = (entry.get("text") or "").strip()
        if not text:
            continue
        turns.append({"speaker": entry.get("speaker") or "Speaker", "text": text})

    turns = turns[-TENSION_TRANSCRIPT_MAX_TURNS:]

    total = 0
    trimmed = []
    for turn in reversed(turns):
        total += len(turn["text"])
        if total > TENSION_TRANSCRIPT_MAX_CHARS and trimmed:
            break
        trimmed.append(turn)
    trimmed.reverse()
    return trimmed


async def run_tensions(
    session_id: str,
    participant_id: str,
    payload: dict,
    count: int,
    topic: str | None,
    language: str | None,
):
    session = sessions.get(session_id)
    participant = session.participants.get(participant_id) if session else None
    if not participant:
        return

    await participant.websocket.send_json({"type": "tensions_pending"})

    payload = dict(payload)
    payload["transcript"] = build_transcript_excerpt(session)

    tensions: list[str] = []
    try:
        tensions = await asyncio.wait_for(
            analysis.generate_tension_statements(payload, count, topic, language),
            timeout=TENSION_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        print("Tension generation timed out")
    except Exception as e:
        print(f"Tension task error: {e}")

    if not sessions.exists(session_id):
        return

    participant = sessions.get(session_id).participants.get(participant_id)
    if not participant:
        return

    if tensions:
        await participant.websocket.send_json({
            "type": "tensions_draft",
            "tensions": [{"id": f"t{i}", "text": t} for i, t in enumerate(tensions)],
        })
    else:
        await participant.websocket.send_json({
            "type": "tensions_error",
            "message": "Could not generate tension statements. Try again.",
            "code": "tensionsFailed",
        })


async def broadcast_common_ground_history(session_id: str, added_id: str | None = None):
    session = sessions.get(session_id)
    if not session:
        return
    for pid, participant in session.participants.items():
        try:
            payload = {
                "type": "common_ground_history",
                "history": sessions.get_common_ground_history(session_id, pid),
            }
            if added_id:
                payload["addedId"] = added_id
            await participant.websocket.send_json(payload)
        except Exception:
            pass


async def run_common_ground(
    session_id: str,
    payload: dict,
    topic: str | None,
    language: str | None,
    depth: str = "basic",
    participant_id: str | None = None,
):
    result = None
    try:
        result = await asyncio.wait_for(
            analysis.generate_common_ground(payload, topic, language, depth=depth),
            timeout=COMMON_GROUND_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        print("Common ground generation timed out")
    except Exception as e:
        print(f"Common ground task error: {e}")

    if not sessions.exists(session_id):
        return

    if result:
        result["generatedAt"] = time.time()
        snapshot = {
            "voterCount": payload.get("voterCount"),
            "statementCount": payload.get("statementCount"),
        }
        added = sessions.add_common_ground(session_id, result, participant_id or "", snapshot)
        await broadcast_common_ground_history(
            session_id,
            added_id=added.get("id") if added else None,
        )
    else:
        await sessions.broadcast(session_id, {
            "type": "common_ground_error",
            "message": "Could not generate common ground. Please try again.",
            "code": "cgFailed",
        })


def pending_turn_text(entry: dict) -> str:
    full = (entry.get("text") or "").strip()
    analyzed = (entry.get("analyzedText") or "").strip()
    if not analyzed:
        pending = full
    elif full == analyzed:
        pending = ""
    elif full.startswith(analyzed):
        pending = full[len(analyzed):].strip()
    else:
        pending = full
    if is_low_information_transcript(pending):
        return ""
    return pending


async def run_turn_analysis(session_id: str, entry_id: str):
    await asyncio.sleep(SPEAKER_TURN_IDLE_SECONDS)

    session = sessions.get(session_id)
    if not session:
        return
    entry = next((e for e in session.transcript if e.get("id") == entry_id), None)
    if not entry:
        return

    pending_text = pending_turn_text(entry)
    if not pending_text:
        entry["argumentAnalyzed"] = True
        return
    if time.time() - entry.get("updatedAt", entry.get("timestamp", 0)) < SPEAKER_TURN_IDLE_SECONDS:
        schedule_turn_analysis(session_id, entry)
        return

    entry["argumentAnalyzed"] = True
    entry["analyzedText"] = entry.get("text", "")
    new_texts = await analysis.extract_turn_statement(
        turn_entry={**entry, "text": pending_text},
        existing_statements=[s.text for s in session.statements],
        topic=session.topic,
        language=session_statement_language(session_id),
    )
    if not new_texts:
        return

    added = sessions.add_statements(session_id, new_texts)
    auto_approve_if_no_host(session_id, added)
    await _safe_db(db.save_statements(session, added))
    await sessions.broadcast_statements(session_id)


def schedule_turn_analysis(session_id: str, entry: dict):
    entry_id = entry.get("id")
    if not entry_id:
        return

    key = (session_id, entry_id)
    existing = turn_analysis_tasks.pop(key, None)
    if existing and not existing.done():
        existing.cancel()
    turn_analysis_tasks[key] = asyncio.create_task(run_turn_analysis(session_id, entry_id))


def normalize_language(value) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        return None
    language = value.strip().lower()
    if not language or language == "auto":
        return None
    return language if language in PARTICIPANT_LANGUAGES else None


def session_statement_language(session_id: str) -> str | None:
    return sessions.get_recorder_language(session_id)


def should_merge_transcript(last_entry: dict | None, speaker: str, now: float) -> bool:
    if not last_entry or last_entry.get("speaker") != speaker:
        return False
    last_updated = last_entry.get("updatedAt", last_entry.get("timestamp", 0))
    return now - last_updated <= TRANSCRIPT_MERGE_WINDOW_SECONDS


def merge_transcript_text(existing: str, addition: str) -> str:
    existing = existing.rstrip()
    addition = addition.lstrip()
    if not existing:
        return addition
    if existing.endswith("-"):
        return f"{existing[:-1]}{addition}"
    return f"{existing} {addition}"


def is_low_information_transcript(text: str) -> bool:
    normalized = " ".join(text.strip().lower().split())
    if not normalized:
        return True
    stripped = normalized.strip(".,!?;:…-—()[]\"'")
    if stripped in FILLER_TRANSCRIPTS:
        return True
    if any(marker in stripped for marker in GENERIC_ASR_HALLUCINATION_MARKERS):
        return True
    words = [w for w in stripped.replace("'", " ").split() if w]
    return len(words) == 1 and len(stripped) <= 2


async def add_transcript_text(
    session_id: str,
    text: str,
    speaker: str,
    item_id: str | None = None,
) -> bool:
    text = text.strip()
    if is_low_information_transcript(text):
        return False
    now = time.time()
    session = sessions.get(session_id)
    if not session:
        return False

    last_entry = session.transcript[-1] if session.transcript else None
    if should_merge_transcript(last_entry, speaker, now):
        last_entry["text"] = merge_transcript_text(last_entry.get("text", ""), text)
        last_entry["updatedAt"] = now
        last_entry.setdefault("itemIds", [])
        if item_id:
            last_entry["itemIds"].append(item_id)

        await sessions.broadcast(session_id, {
            "type": "transcript_update",
            "entry": last_entry,
        })
        await _safe_db(db.save_transcript_entry(session, last_entry))
        schedule_turn_analysis(session_id, last_entry)
        return True

    entry = {
        "type": "transcript",
        "id": uuid.uuid4().hex[:10],
        "text": text,
        "speaker": speaker,
        "timestamp": now,
        "updatedAt": now,
        "argumentAnalyzed": False,
        "analyzedText": "",
    }
    if item_id:
        entry["itemId"] = item_id
        entry["itemIds"] = [item_id]

    sessions.add_transcript_entry(session_id, entry)
    await sessions.broadcast(session_id, entry)
    await _safe_db(db.save_transcript_entry(session, entry))
    schedule_turn_analysis(session_id, entry)
    return True


async def broadcast_caption_delta(session_id: str, speaker: str, item_id: str, delta: str):
    await sessions.broadcast(session_id, {
        "type": "caption_delta",
        "speaker": speaker,
        "itemId": item_id,
        "delta": delta,
        "timestamp": time.time(),
    })


async def finalize_caption(
    session_id: str,
    speaker: str,
    item_id: str,
    transcript_text: str,
    audio_bytes: Optional[bytes] = None,
):
    final_text = transcript_text
    corrected_text = await transcription.transcribe_pcm16(audio_bytes or b"")
    if corrected_text and not is_low_information_transcript(corrected_text):
        final_text = corrected_text

    added = await add_transcript_text(session_id, final_text, speaker, item_id=item_id)
    if not added:
        await sessions.broadcast(session_id, {
            "type": "caption_rejected",
            "itemId": item_id,
        })


async def broadcast_caption_error(session_id: str, message: str, code: str | None = None):
    key = (session_id, code or message)
    if key in realtime_errors_seen:
        return
    realtime_errors_seen.add(key)
    await sessions.broadcast(session_id, {
        "type": "caption_error",
        "message": message,
        "code": code,
    })


async def get_realtime_session(
    session_id: str,
    participant_id: str,
) -> RealtimeTranscriptionSession | None:
    key = (session_id, participant_id)
    if key in realtime_unavailable:
        return None

    existing = realtime_sessions.get(key)
    if existing and existing.is_open and not existing.expired:
        return existing

    if existing:
        realtime_sessions.pop(key, None)
        asyncio.create_task(existing.close())

    speaker = sessions.get_participant_name(session_id, participant_id)
    language = sessions.get_participant_language(session_id, participant_id)

    async def on_bridge_error(sid: str, message: str, code: str | None = None):
        realtime_unavailable.add((session_id, participant_id))
        await broadcast_caption_error(sid, message, code)

    bridge = RealtimeTranscriptionSession(
        session_id=session_id,
        participant_id=participant_id,
        speaker=speaker,
        language=language,
        on_delta=broadcast_caption_delta,
        on_final=finalize_caption,
        on_error=on_bridge_error,
    )
    realtime_sessions[key] = bridge

    if await bridge.start():
        return bridge

    realtime_sessions.pop(key, None)
    if not bridge.available:
        realtime_unavailable.add(key)
    return None


async def close_realtime_sessions(session_id: str, participant_id: str | None = None):
    keys = [
        key for key in realtime_sessions
        if key[0] == session_id and (participant_id is None or key[1] == participant_id)
    ]
    for key in keys:
        bridge = realtime_sessions.pop(key, None)
        if bridge:
            await bridge.close()


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    session_id = session_id.upper()

    init = await websocket.receive_json()
    if init.get("type") != "join":
        await websocket.close(code=4000, reason="First message must be join")
        return

    name = init.get("name", "Anonymous")
    language = normalize_language(init.get("language"))
    wants_host = bool(init.get("wantsHost"))
    client_id = init.get("clientId") or None

    restored_missing_public_id = False
    if not sessions.exists(session_id) and db.enabled:
        restored = await db.load_session(session_id)
        if restored:
            restored_missing_public_id = not restored.get("public_id")
            sessions.hydrate(restored)

    existed = sessions.exists(session_id)
    participant_id = await sessions.join(
        session_id, websocket, name, language, wants_host=wants_host, client_id=client_id
    )
    if not existed:
        await persist_session(sessions.get(session_id))
    elif restored_missing_public_id:
        _restored = sessions.get(session_id)
        if _restored and _restored.public_id:
            await _safe_db(db.update_public_id(session_id, _restored.public_id))
    await _safe_db(db.save_participant(
        sessions.get(session_id), participant_id, client_id, name, language,
        is_host=sessions.is_host(session_id, participant_id),
    ))
    await sessions.broadcast_participants(session_id)
    await sessions.broadcast_hosts(session_id)
    await sessions.broadcast_presence(session_id)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "audio_level":
                if not sessions.is_host(session_id, participant_id):
                    continue
                new_active = sessions.update_level(
                    session_id, participant_id, data.get("level", 0)
                )
                if new_active is not None:
                    await sessions.broadcast(session_id, {
                        "type": "active_mic",
                        "participantId": new_active,
                        "name": sessions.get_participant_name(session_id, new_active),
                    })

            elif msg_type == "audio_chunk":
                session = sessions.get(session_id)
                if not session or not session.recording:
                    continue
                if not sessions.is_recorder(session_id, participant_id):
                    continue

                audio_bytes = base64.b64decode(data["audio"])
                text = await transcription.transcribe(audio_bytes)
                if text:
                    await add_transcript_text(
                        session_id,
                        text,
                        sessions.get_participant_name(session_id, participant_id),
                    )

            elif msg_type == "audio_frame":
                session = sessions.get(session_id)
                if not session or not session.recording:
                    continue
                if not sessions.is_recorder(session_id, participant_id):
                    continue

                audio = data.get("audio")
                if not isinstance(audio, str):
                    continue

                bridge = await get_realtime_session(session_id, participant_id)
                if bridge:
                    await bridge.send_audio(audio)
                elif (session_id, participant_id) in realtime_unavailable:
                    continue
                else:
                    await broadcast_caption_error(
                        session_id,
                        "Realtime captions unavailable.",
                        "captionsUnavailable",
                    )

            elif msg_type == "set_recording":
                if not sessions.is_recorder(session_id, participant_id):
                    continue
                recording = data.get("recording", False)
                if recording:
                    realtime_unavailable.discard((session_id, participant_id))
                await sessions.set_recording(session_id, recording)
                if not recording:
                    await close_realtime_sessions(session_id)

            elif msg_type == "vote":
                statement_id = data.get("statementId", "")
                vote_value = data.get("vote", "")
                if not sessions.is_voting_open(session_id):
                    await websocket.send_json({
                        "type": "voting_rejected",
                        "code": "votingClosed",
                    })
                    continue
                ok = sessions.record_vote(
                    session_id, participant_id, statement_id, vote_value,
                )
                if ok:
                    await sessions.broadcast_vote(session_id, statement_id)
                    await sessions.broadcast_participants(session_id)
                    await sessions.broadcast_presence(session_id)
                    session = sessions.get(session_id)
                    statement = next(
                        (s for s in session.statements if s.id == statement_id), None
                    ) if session else None
                    if vote_value == "undo":
                        await _safe_db(db.delete_vote(statement_id, participant_id))
                    else:
                        await _safe_db(db.save_vote(
                            session, statement, participant_id, vote_value
                        ))

            elif msg_type == "get_results":
                await websocket.send_json({
                    "type": "results",
                    **sessions.vote_matrix(session_id, participant_id),
                })

            elif msg_type == "generate_tensions":
                if not sessions.is_host(session_id, participant_id):
                    continue
                payload = data.get("analysis")
                if not isinstance(payload, dict):
                    continue
                count = data.get("count", 3)
                session = sessions.get(session_id)
                topic = session.topic if session else None
                language = session_statement_language(session_id) if session else None
                asyncio.create_task(
                    run_tensions(session_id, participant_id, payload, count, topic, language)
                )

            elif msg_type == "publish_tensions":
                if not sessions.is_host(session_id, participant_id):
                    continue
                raw = data.get("texts")
                if not isinstance(raw, list):
                    continue
                texts = [t.strip() for t in raw if isinstance(t, str) and t.strip()]
                if not texts:
                    continue
                added = sessions.add_tension_statements(session_id, texts)
                if not added:
                    continue
                session = sessions.get(session_id)
                await _safe_db(db.save_statements(session, added))
                await sessions.broadcast_statements(session_id)

            elif msg_type == "get_common_ground":
                if not sessions.is_host(session_id, participant_id):
                    continue
                payload = data.get("analysis")
                if not isinstance(payload, dict):
                    continue
                session = sessions.get(session_id)
                depth = data.get("depth") or (session.common_ground_depth if session else "extended")
                if depth not in ("basic", "extended", "comprehensive"):
                    depth = "extended"
                payload = dict(payload)
                payload["previousFeedback"] = sessions.collect_common_ground_feedback(session_id)
                topic = session.topic if session else None
                language = session_statement_language(session_id) if session else None
                await sessions.broadcast(session_id, {"type": "common_ground_pending", "depth": depth})
                asyncio.create_task(
                    run_common_ground(session_id, payload, topic, language, depth, participant_id)
                )

            elif msg_type == "set_auto_approve":
                if not sessions.is_host(session_id, participant_id):
                    continue
                value = bool(data.get("autoApprove"))
                client_id = sessions.set_auto_approve(session_id, participant_id, value)
                if client_id:
                    await _safe_db(db.save_auto_approve(session_id, client_id, value))

            elif msg_type == "set_default_statement_permission":
                if not sessions.is_host(session_id, participant_id):
                    continue
                allowed = bool(data.get("allowed", True))
                if sessions.set_default_can_add_statement(session_id, allowed):
                    await sessions.broadcast(session_id, {
                        "type": "default_statement_permission_updated",
                        "allowed": allowed,
                    })

            elif msg_type == "set_voting_open":
                if not sessions.is_host(session_id, participant_id):
                    continue
                is_open = bool(data.get("open", True))
                actor = sessions.get_participant_name(session_id, participant_id)
                if sessions.set_voting_open(session_id, is_open, actor):
                    session = sessions.get(session_id)
                    await _safe_db(db.update_voting(session))
                    await sessions.broadcast(session_id, {
                        "type": "voting_status_updated",
                        **sessions.voting_status(session_id),
                    })

            elif msg_type == "set_voting_lifetime":
                if not sessions.is_host(session_id, participant_id):
                    continue
                hours = data.get("hours")
                actor = sessions.get_participant_name(session_id, participant_id)
                if sessions.set_voting_lifetime(session_id, hours, actor):
                    session = sessions.get(session_id)
                    await _safe_db(db.update_voting(session))
                    await sessions.broadcast(session_id, {
                        "type": "voting_status_updated",
                        **sessions.voting_status(session_id),
                    })

            elif msg_type == "set_statement_permission":
                if not sessions.is_host(session_id, participant_id):
                    continue
                target = data.get("participantId")
                allowed = bool(data.get("allowed", True))
                if not target:
                    continue
                if sessions.set_statement_permission(session_id, target, allowed) is None:
                    continue
                await sessions.broadcast_participants(session_id)
                session = sessions.get(session_id)
                target_p = session.participants.get(target) if session else None
                if target_p:
                    try:
                        await target_p.websocket.send_json({
                            "type": "permissions_updated",
                            "canAddStatement": allowed,
                        })
                    except Exception:
                        pass

            elif msg_type == "vote_common_ground":
                cg_id = data.get("id") or ""
                vote_value = data.get("vote", "")
                reason = data.get("reason")
                ok = sessions.record_common_ground_vote(
                    session_id, cg_id, participant_id, vote_value, reason=reason,
                )
                if ok:
                    await broadcast_common_ground_history(session_id)

            elif msg_type == "dismiss_common_ground":
                if not sessions.is_host(session_id, participant_id):
                    continue
                cg_id = data.get("id") or ""
                if not cg_id or not sessions.remove_common_ground(session_id, cg_id):
                    continue
                await broadcast_common_ground_history(session_id)

            elif msg_type == "approve_statement":
                if not sessions.is_host(session_id, participant_id):
                    continue
                ids = data.get("statementIds")
                if isinstance(ids, list):
                    target = set(ids)
                elif data.get("statementId"):
                    target = {data["statementId"]}
                else:
                    target = None
                approved = sessions.approve_statements(session_id, target)
                if approved:
                    await sessions.broadcast_statements(session_id)
                    await sessions.broadcast_participants(session_id)
                    await _safe_db(db.set_statements_approved([s.id for s in approved]))

            elif msg_type == "reject_statement":
                if not sessions.is_host(session_id, participant_id):
                    continue
                ids = data.get("statementIds")
                if isinstance(ids, list):
                    target = set(ids)
                elif data.get("statementId"):
                    target = {data["statementId"]}
                else:
                    target = set()
                removed = sessions.reject_statements(session_id, target)
                if removed:
                    await sessions.broadcast_statements(session_id)
                    await sessions.broadcast_participants(session_id)
                    await _safe_db(db.delete_statements(removed))

            elif msg_type == "delete_statement":
                if not sessions.is_host(session_id, participant_id):
                    continue
                ids = data.get("statementIds")
                if isinstance(ids, list):
                    target = set(ids)
                elif data.get("statementId"):
                    target = {data["statementId"]}
                else:
                    target = set()
                removed = sessions.delete_statements(session_id, target)
                if removed:
                    await sessions.broadcast_statements(session_id)
                    await sessions.broadcast_participants(session_id)
                    await _safe_db(db.delete_statements(removed))

            elif msg_type == "add_statement":
                text = (data.get("text") or "").strip()
                if not text:
                    continue
                is_host = sessions.is_host(session_id, participant_id)
                if is_host:
                    stmt = sessions.add_custom_statement(session_id, text)
                elif sessions.can_add_statement(session_id, participant_id):
                    stmt = sessions.add_participant_statement(
                        session_id, text, sessions.get_participant_name(session_id, participant_id)
                    )
                else:
                    continue
                if stmt:
                    await _safe_db(db.save_statements(sessions.get(session_id), [stmt]))
                    await sessions.broadcast_statements(session_id)
                    if not is_host:
                        await websocket.send_json({"type": "statement_submitted"})

            elif msg_type == "edit_statement":
                if not sessions.is_host(session_id, participant_id):
                    continue
                statement_id = data.get("statementId")
                text = data.get("text")
                if not statement_id or not isinstance(text, str):
                    continue
                stmt = sessions.edit_statement(session_id, statement_id, text)
                if stmt:
                    session = sessions.get(session_id)
                    await _safe_db(db.save_statements(session, [stmt]))
                    await sessions.broadcast_statements(session_id)

            elif msg_type == "set_host":
                if not sessions.is_host(session_id, participant_id):
                    continue
                target = data.get("participantId")
                make_host = bool(data.get("host", True))
                if target and sessions.set_host(session_id, target, make_host):
                    session = sessions.get(session_id)
                    target_p = session.participants.get(target) if session else None
                    if target_p and target_p.client_id:
                        await _safe_db(db.set_host_flag(session_id, target_p.client_id, make_host))
                    await sessions.broadcast_hosts(session_id)
                    await sessions.broadcast_participants(session_id)
                    await sessions.broadcast_statements(session_id)

            elif msg_type == "set_recorder":
                if not sessions.is_host(session_id, participant_id):
                    continue
                target = data.get("participantId")
                if target and sessions.set_recorder(session_id, target):
                    await sessions.broadcast_hosts(session_id)
                    await sessions.broadcast_participants(session_id)

            elif msg_type == "set_vote_type":
                if not sessions.is_host(session_id, participant_id):
                    continue
                vote_type = sessions.set_vote_type(session_id, data.get("voteType"))
                if vote_type:
                    await _safe_db(db.update_vote_type(session_id, vote_type))
                    await sessions.broadcast(session_id, {
                        "type": "vote_type_updated",
                        "voteType": vote_type,
                    })

            elif msg_type == "set_common_ground_depth":
                if not sessions.is_host(session_id, participant_id):
                    continue
                depth = sessions.set_common_ground_depth(session_id, data.get("depth"))
                if depth:
                    await sessions.broadcast(session_id, {
                        "type": "common_ground_depth_updated",
                        "depth": depth,
                    })

            elif msg_type == "set_topic":
                if not sessions.is_host(session_id, participant_id):
                    continue
                topic = sessions.set_topic(session_id, data.get("topic"))
                await _safe_db(db.update_topic(session_id, topic))
                await sessions.broadcast(session_id, {
                    "type": "topic_updated",
                    "topic": topic,
                })

            elif msg_type == "set_language":
                if not sessions.is_host(session_id, participant_id):
                    continue
                session = sessions.get(session_id)
                if not session or not session.host_participant_id:
                    continue
                recorder_id = session.host_participant_id
                raw = data.get("language")
                if raw in (None, "", "auto"):
                    language = None
                else:
                    language = normalize_language(raw)
                    if language is None:
                        continue
                recorder = session.participants.get(recorder_id)
                if not recorder or not sessions.set_participant_language(session_id, recorder_id, language):
                    continue
                await _safe_db(db.save_participant(
                    session,
                    recorder_id,
                    recorder.client_id,
                    recorder.name,
                    language,
                    is_host=sessions.is_host(session_id, recorder_id),
                ))
                await close_realtime_sessions(session_id, recorder_id)
                await sessions.broadcast(session_id, {
                    "type": "language_updated",
                    "participantId": recorder_id,
                    "language": language,
                })

            elif msg_type == "rename":
                new_name = (data.get("name") or "").strip()
                if new_name and sessions.rename_participant(session_id, participant_id, new_name):
                    await _safe_db(db.save_participant(
                        sessions.get(session_id), participant_id, client_id, new_name,
                        sessions.get_participant_language(session_id, participant_id),
                        is_host=sessions.is_host(session_id, participant_id),
                    ))
                    await sessions.broadcast_participants(session_id)
                    await sessions.broadcast(session_id, {
                        "type": "participant_renamed",
                        "participantId": participant_id,
                        "name": new_name,
                    })

    except WebSocketDisconnect:
        name = sessions.get_participant_name(session_id, participant_id)
        leave_result = sessions.leave(session_id, participant_id, websocket)
        if not leave_result.get("removed"):
            return
        await close_realtime_sessions(session_id, participant_id)
        session = sessions.get(session_id)
        if session:
            await sessions.broadcast(session_id, {
                "type": "participant_left",
                "participantId": participant_id,
                "name": name,
                "participants": sessions._participant_list(session),
            })
            await sessions.broadcast_participants(session_id)
            await sessions.broadcast_hosts(session_id)
            await sessions.broadcast_presence(session_id)
            if leave_result.get("recording_stopped"):
                await sessions.broadcast(session_id, {"type": "recording_stopped"})


async def _resolve_public_session(public_id: str) -> Optional[str]:
    session_id = sessions.get_by_public_id(public_id)
    if session_id:
        return session_id
    if db.enabled:
        restored = await db.load_by_public_id(public_id)
        if restored:
            sessions.hydrate(restored)
            session_id = restored["id"]
            if not restored.get("public_id"):
                pid = sessions.ensure_public_id(session_id)
                await _safe_db(db.update_public_id(session_id, pid))
            return session_id
    return None


@app.get("/api/public/results/{public_id}")
async def public_results(public_id: str):
    session_id = await _resolve_public_session(public_id)
    if not session_id:
        raise HTTPException(status_code=404, detail="Results not found")
    data = sessions.public_results(session_id)
    if not data:
        raise HTTPException(status_code=404, detail="Results not found")
    return data


def _inject_public_meta(html: str, public_id: str, topic: Optional[str]) -> str:
    import html as _html

    title = _html.escape(topic) if topic else "Live results"
    full_title = f"{title} · HearTheRoom"
    desc = "See the live opinion map, common ground and open tensions from this conversation."
    url = f"/r/{_html.escape(public_id, quote=True)}"

    replacements = {
        '<meta property="og:title" content="HearTheRoom" />':
            f'<meta property="og:title" content="{full_title}" />',
        '<meta property="og:description" content="Real-time collaborative sense-making for live rooms and workshops." />':
            f'<meta property="og:description" content="{desc}" />',
        '<meta name="twitter:title" content="HearTheRoom" />':
            f'<meta name="twitter:title" content="{full_title}" />',
        '<meta name="twitter:description" content="Real-time collaborative sense-making for live rooms and workshops." />':
            f'<meta name="twitter:description" content="{desc}" />',
        '<meta name="description" content="Real-time collaborative sense-making for live rooms and workshops." />':
            f'<meta name="description" content="{desc}" />',
        "<title>HearTheRoom</title>":
            f"<title>{full_title}</title>",
    }
    for old, new in replacements.items():
        html = html.replace(old, new)
    html = html.replace(
        "</head>",
        f'    <meta property="og:url" content="{url}" />\n  </head>',
    )
    return html


if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    from fastapi.responses import HTMLResponse

    @app.get("/r/{public_id}", response_class=HTMLResponse)
    async def serve_public_results(public_id: str):
        index_html = (FRONTEND_DIST / "index.html").read_text(encoding="utf-8")
        session_id = await _resolve_public_session(public_id)
        topic = None
        if session_id:
            data = sessions.public_results(session_id)
            topic = data.get("topic") if data else None
        return HTMLResponse(_inject_public_meta(index_html, public_id, topic))

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        candidate = (FRONTEND_DIST / full_path).resolve()
        if (
            full_path
            and FRONTEND_DIST in candidate.parents
            and candidate.is_file()
        ):
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
