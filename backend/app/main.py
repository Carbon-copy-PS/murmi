from __future__ import annotations

import asyncio
import base64
import time
import uuid
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

load_dotenv()

app = FastAPI(title="Debate Sense")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

sessions = SessionManager()
transcription = TranscriptionService()
analysis = AnalysisService()
realtime_sessions: dict[tuple[str, str], RealtimeTranscriptionSession] = {}
realtime_unavailable: set[tuple[str, str]] = set()
realtime_errors_seen: set[tuple[str, str]] = set()
turn_analysis_tasks: dict[tuple[str, str], asyncio.Task] = {}
TRANSCRIPT_MERGE_WINDOW_SECONDS = 12
SPEAKER_TURN_IDLE_SECONDS = 3
PARTICIPANT_LANGUAGES = {"en", "de", "fr"}
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


@app.post("/api/sessions")
async def create_session(req: CreateSessionRequest = CreateSessionRequest()):
    topic = req.topic.strip() if req.topic else None
    session_id = sessions.create(topic=topic)
    return {"sessionId": session_id, "topic": topic}


MOCK_DEBATE = [
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
    """Inject 3 fake debate entries to trigger analysis. Call multiple times."""
    session_id = session_id.upper()
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    idx = mock_index.get(session_id, 0)
    if idx >= len(MOCK_DEBATE):
        mock_index[session_id] = 0
        idx = 0

    added = []
    for i in range(3):
        if idx + i >= len(MOCK_DEBATE):
            break
        speaker, text = MOCK_DEBATE[idx + i]
        entry = {
            "type": "transcript",
            "text": text,
            "speaker": speaker,
            "timestamp": time.time() + i,
        }
        should_analyze = sessions.add_transcript_entry(session_id, entry)
        await sessions.broadcast(session_id, entry)
        added.append(entry)

        if should_analyze:
            sessions.mark_analysis_started(session_id)
            asyncio.create_task(run_analysis(session_id))

    mock_index[session_id] = idx + len(added)
    return {
        "added": len(added),
        "total": len(session.transcript),
        "remaining": max(0, len(MOCK_DEBATE) - mock_index[session_id]),
    }


auto_play_tasks: dict[str, asyncio.Task] = {}


async def auto_play(session_id: str):
    idx = mock_index.get(session_id, 0)
    while idx < len(MOCK_DEBATE):
        session = sessions.get(session_id)
        if not session:
            break
        speaker, text = MOCK_DEBATE[idx]
        entry = {
            "type": "transcript",
            "text": text,
            "speaker": speaker,
            "timestamp": time.time(),
        }
        should_analyze = sessions.add_transcript_entry(session_id, entry)
        await sessions.broadcast(session_id, entry)
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
    remaining = len(MOCK_DEBATE) - mock_index.get(session_id, 0)
    return {"status": "started", "entries": remaining}


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    session = sessions.get(session_id.upper())
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "sessionId": session.id,
        "participantCount": len(session.participants),
        "recording": session.recording,
    }


async def run_analysis(session_id: str):
    session = sessions.get(session_id)
    if not session:
        return
    try:
        new_texts = await analysis.extract_statements(
            transcript_entries=session.transcript,
            existing_statements=[s.text for s in session.statements],
            topic=session.topic,
        )
        if not new_texts:
            return

        sessions.add_statements(session_id, new_texts)
        completed_round = sessions.check_and_advance_round(session_id)
        await sessions.broadcast_statements(session_id)

        if completed_round is not None:
            await sessions.broadcast(session_id, {
                "type": "threshold_reached",
                "round": completed_round,
            })
    except Exception as e:
        print(f"Analysis task error: {e}")
    finally:
        sessions.mark_analysis_done(session_id)


async def run_turn_analysis(session_id: str, entry_id: str):
    await asyncio.sleep(SPEAKER_TURN_IDLE_SECONDS)

    session = sessions.get(session_id)
    if not session:
        return
    entry = next((e for e in session.transcript if e.get("id") == entry_id), None)
    if not entry or entry.get("argumentAnalyzed"):
        return
    if time.time() - entry.get("updatedAt", entry.get("timestamp", 0)) < SPEAKER_TURN_IDLE_SECONDS:
        schedule_turn_analysis(session_id, entry)
        return

    entry["argumentAnalyzed"] = True
    new_texts = await analysis.extract_turn_statement(
        turn_entry=entry,
        existing_statements=[s.text for s in session.statements],
        topic=session.topic,
    )
    if not new_texts:
        return

    sessions.add_statements(session_id, new_texts)
    completed_round = sessions.check_and_advance_round(session_id)
    await sessions.broadcast_statements(session_id)

    if completed_round is not None:
        await sessions.broadcast(session_id, {
            "type": "threshold_reached",
            "round": completed_round,
        })


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
    if not isinstance(value, str):
        return None
    language = value.strip().lower()
    return language if language in PARTICIPANT_LANGUAGES else None


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
        last_entry["argumentAnalyzed"] = False
        last_entry.setdefault("itemIds", [])
        if item_id:
            last_entry["itemIds"].append(item_id)

        await sessions.broadcast(session_id, {
            "type": "transcript_update",
            "entry": last_entry,
        })
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
    }
    if item_id:
        entry["itemId"] = item_id
        entry["itemIds"] = [item_id]

    sessions.add_transcript_entry(session_id, entry)
    await sessions.broadcast(session_id, entry)
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


async def broadcast_caption_error(session_id: str, message: str):
    key = (session_id, message)
    if key in realtime_errors_seen:
        return
    realtime_errors_seen.add(key)
    await sessions.broadcast(session_id, {
        "type": "caption_error",
        "message": message,
    })


async def get_realtime_session(
    session_id: str,
    participant_id: str,
) -> RealtimeTranscriptionSession | None:
    key = (session_id, participant_id)
    if key in realtime_unavailable:
        return None

    existing = realtime_sessions.get(key)
    if existing and existing.is_open:
        return existing

    speaker = sessions.get_participant_name(session_id, participant_id)
    language = sessions.get_participant_language(session_id, participant_id)
    bridge = RealtimeTranscriptionSession(
        session_id=session_id,
        participant_id=participant_id,
        speaker=speaker,
        language=language,
        on_delta=broadcast_caption_delta,
        on_final=finalize_caption,
        on_error=broadcast_caption_error,
    )
    realtime_sessions[key] = bridge

    if await bridge.start():
        return bridge

    realtime_sessions.pop(key, None)
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
    participant_id = await sessions.join(session_id, websocket, name, language, wants_host=wants_host)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "audio_level":
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
                if not sessions.is_host(session_id, participant_id):
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
                if not sessions.is_host(session_id, participant_id):
                    continue

                audio = data.get("audio")
                if not isinstance(audio, str):
                    continue

                bridge = await get_realtime_session(session_id, participant_id)
                if bridge:
                    await bridge.send_audio(audio)

            elif msg_type == "set_recording":
                if not sessions.is_host(session_id, participant_id):
                    continue
                recording = data.get("recording", False)
                await sessions.set_recording(session_id, recording)
                if not recording:
                    await close_realtime_sessions(session_id)

            elif msg_type == "vote":
                ok = sessions.record_vote(
                    session_id, participant_id,
                    data.get("statementId", ""),
                    data.get("vote", ""),
                )
                if ok:
                    await sessions.broadcast_vote(session_id, data["statementId"])

    except WebSocketDisconnect:
        name = sessions.get_participant_name(session_id, participant_id)
        await close_realtime_sessions(session_id, participant_id)
        leave_result = sessions.leave(session_id, participant_id)
        session = sessions.get(session_id)
        if session:
            await sessions.broadcast(session_id, {
                "type": "participant_left",
                "participantId": participant_id,
                "name": name,
                "hostParticipantId": session.host_participant_id,
                "participants": [
                    {
                        "id": p.id,
                        "name": p.name,
                        "language": p.language,
                        "isHost": p.id == session.host_participant_id,
                    }
                    for p in session.participants.values()
                ],
            })
            if leave_result.get("recording_stopped"):
                await sessions.broadcast(session_id, {"type": "recording_stopped"})
            if leave_result.get("host_changed"):
                await sessions.broadcast(session_id, {
                    "type": "host_updated",
                    "hostParticipantId": session.host_participant_id,
                })


if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        return FileResponse(FRONTEND_DIST / "index.html")
