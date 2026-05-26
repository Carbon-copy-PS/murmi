from __future__ import annotations

import asyncio
import base64
import time
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
        await sessions.broadcast_statements(session_id)

        completed_round = sessions.check_and_advance_round(session_id)
        if completed_round is not None:
            await sessions.broadcast(session_id, {
                "type": "threshold_reached",
                "round": completed_round,
            })
    except Exception as e:
        print(f"Analysis task error: {e}")
    finally:
        sessions.mark_analysis_done(session_id)


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    session_id = session_id.upper()

    init = await websocket.receive_json()
    if init.get("type") != "join":
        await websocket.close(code=4000, reason="First message must be join")
        return

    name = init.get("name", "Anonymous")
    participant_id = await sessions.join(session_id, websocket, name)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "audio_level":
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
                if not sessions.is_active_mic(session_id, participant_id):
                    continue

                audio_bytes = base64.b64decode(data["audio"])
                text = await transcription.transcribe(audio_bytes)
                if text:
                    entry = {
                        "type": "transcript",
                        "text": text,
                        "speaker": sessions.get_participant_name(session_id, participant_id),
                        "timestamp": time.time(),
                    }
                    should_analyze = sessions.add_transcript_entry(session_id, entry)
                    await sessions.broadcast(session_id, entry)

                    if should_analyze:
                        sessions.mark_analysis_started(session_id)
                        asyncio.create_task(run_analysis(session_id))

            elif msg_type == "set_recording":
                await sessions.set_recording(session_id, data.get("recording", False))

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
        sessions.leave(session_id, participant_id)
        session = sessions.get(session_id)
        if session:
            await sessions.broadcast(session_id, {
                "type": "participant_left",
                "participantId": participant_id,
                "name": name,
                "participants": [
                    {"id": p.id, "name": p.name}
                    for p in session.participants.values()
                ],
            })


if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        return FileResponse(FRONTEND_DIST / "index.html")
