from __future__ import annotations

import asyncio
import base64
import json
import os
import time
import uuid
from typing import Awaitable, Callable, Optional
from collections import deque

import websockets


CaptionDeltaHandler = Callable[[str, str, str, str], Awaitable[None]]
CaptionFinalHandler = Callable[[str, str, str, str], Awaitable[None]]
CaptionErrorHandler = Callable[[str, str, Optional[str]], Awaitable[None]]


class RealtimeTranscriptionSession:
    """Bridge one local speaker's PCM stream to OpenAI Realtime transcription."""

    sample_rate = 24000
    bytes_per_sample = 2

    def __init__(
        self,
        session_id: str,
        participant_id: str,
        speaker: str,
        language: str | None,
        on_delta: CaptionDeltaHandler,
        on_final: CaptionFinalHandler,
        on_error: CaptionErrorHandler,
    ):
        self.session_id = session_id
        self.participant_id = participant_id
        self.speaker = speaker
        self.language = language if language and language != "auto" else None
        self.on_delta = on_delta
        self.on_final = on_final
        self.on_error = on_error
        self.api_key = os.environ.get("OPENAI_API_KEY", "")
        self.transcription_model = os.environ.get("OPENAI_REALTIME_TRANSCRIPTION_MODEL", "gpt-4o-transcribe")
        self.prompt = os.environ.get(
            "OPENAI_REALTIME_TRANSCRIPTION_PROMPT",
            self._default_prompt(),
        )
        self.turn_detection = os.environ.get("OPENAI_REALTIME_TURN_DETECTION", "server_vad")
        self.vad_threshold = float(os.environ.get("OPENAI_REALTIME_VAD_THRESHOLD", "0.5"))
        self.vad_prefix_padding_ms = int(os.environ.get("OPENAI_REALTIME_VAD_PREFIX_PADDING_MS", "300"))
        self.vad_silence_duration_ms = int(os.environ.get("OPENAI_REALTIME_VAD_SILENCE_DURATION_MS", "500"))
        self.commit_interval = float(os.environ.get("OPENAI_REALTIME_COMMIT_SECONDS", "1.0"))
        self.url = os.environ.get(
            "OPENAI_REALTIME_URL",
            "wss://api.openai.com/v1/realtime?intent=transcription",
        )
        self.max_session_seconds = float(os.environ.get("OPENAI_REALTIME_MAX_SESSION_SECONDS", "1500"))
        self.started_at = 0.0
        self.ws = None
        self.receiver_task: Optional[asyncio.Task] = None
        self.send_lock = asyncio.Lock()
        self.bytes_since_commit = 0
        self.pending_items: deque[str] = deque()
        self.completed_items: dict[str, str] = {}
        self.items_drained = asyncio.Event()
        self.items_drained.set()
        self.closed = False
        self.closing = False
        self.close_lock = asyncio.Lock()
        self.configuration_updated = asyncio.Event()
        self.pending_commits: deque[str] = deque()
        self.audio_sent = False
        self.close_timeout = 10.0
        self.finalized_items: set[str] = set()

    @property
    def available(self) -> bool:
        return bool(self.api_key) and self.api_key != "your-key-here"

    @property
    def is_open(self) -> bool:
        return self.ws is not None and not self.closed and not self.closing

    @property
    def expired(self) -> bool:
        if self.max_session_seconds <= 0 or self.started_at <= 0:
            return False
        return (time.monotonic() - self.started_at) >= self.max_session_seconds

    async def start(self) -> bool:
        if not self.available:
            await self.on_error(self.session_id, "Realtime captions need OPENAI_API_KEY.", "captionsUnavailable")
            return False

        try:
            self.ws = await websockets.connect(
                self.url,
                extra_headers={"Authorization": f"Bearer {self.api_key}"},
                max_size=8 * 1024 * 1024,
            )
            await self._send_json(self._session_update())
            self.started_at = time.monotonic()
            self.receiver_task = asyncio.create_task(self._receive_events())
            await asyncio.wait_for(self.configuration_updated.wait(), timeout=10)
            return self.is_open
        except Exception as exc:
            await self.on_error(self.session_id, f"Realtime transcription failed to start: {exc}", "captionsUnavailable")
            await self.close(flush=False)
            return False

    async def send_audio(self, base64_pcm: str):
        if not self.is_open:
            return

        try:
            audio_bytes = base64.b64decode(base64_pcm)
        except Exception:
            return

        if not audio_bytes:
            return

        async with self.send_lock:
            if not self.is_open:
                return
            await self._send_json({
                "type": "input_audio_buffer.append",
                "audio": base64_pcm,
            })
            self.audio_sent = True
            self.bytes_since_commit += len(audio_bytes)

            if self._manual_turn_detection():
                commit_bytes = int(self.sample_rate * self.bytes_per_sample * self.commit_interval)
                if self.bytes_since_commit >= commit_bytes:
                    await self._commit_locked()

    async def close(self, flush: bool = True):
        async with self.close_lock:
            self.closing = True
            try:
                if flush and self.ws is not None and self.receiver_task and not self.receiver_task.done():
                    try:
                        await asyncio.wait_for(self._finish_audio(), timeout=self.close_timeout)
                    except (asyncio.TimeoutError, ConnectionError):
                        await self.on_error(
                            self.session_id,
                            "The final transcript may be incomplete. Some audio was not confirmed.",
                            "transcriptIncomplete",
                        )
            finally:
                self.closed = True
                if self.receiver_task:
                    self.receiver_task.cancel()
                    try:
                        await self.receiver_task
                    except asyncio.CancelledError:
                        pass
                    except Exception:
                        pass
                if self.ws is not None:
                    await self.ws.close()
                    self.ws = None

    async def _finish_audio(self):
        if self.audio_sent:
            # Stop automatic commits before requesting the final explicit commit.
            # Wait for the update acknowledgement, so earlier VAD commits cannot
            # be mistaken for the acknowledgement of our final commit.
            if not self._manual_turn_detection():
                self.configuration_updated.clear()
                await self._send_json({
                    "type": "session.update",
                    "session": {"type": "transcription", "audio": {"input": {"turn_detection": None}}},
                })
                await self.configuration_updated.wait()
            async with self.send_lock:
                await self._commit_locked(force=True)
        await self.items_drained.wait()

    def _session_update(self) -> dict:
        transcription = {
            "model": self.transcription_model,
        }
        if self.prompt:
            transcription["prompt"] = self.prompt
        if self.language:
            transcription["language"] = self.language

        turn_detection = None
        if self.turn_detection == "server_vad":
            turn_detection = {
                "type": "server_vad",
                "threshold": self.vad_threshold,
                "prefix_padding_ms": self.vad_prefix_padding_ms,
                "silence_duration_ms": self.vad_silence_duration_ms,
            }

        return {
            "type": "session.update",
            "session": {
                "type": "transcription",
                "audio": {
                    "input": {
                        "format": {
                            "type": "audio/pcm",
                            "rate": self.sample_rate,
                        },
                        "noise_reduction": {
                            "type": "near_field",
                        },
                        "transcription": transcription,
                        "turn_detection": turn_detection,
                    },
                },
            },
        }

    def _manual_turn_detection(self) -> bool:
        return self.turn_detection in ("manual", "none", "off", "null")

    def _default_prompt(self) -> str:
        return (
            "Transcribe the speech faithfully in the languages actually spoken. "
            "Do not translate, summarize, or complete unfinished sentences. "
            "Do not add words when there is no speech."
        )

    async def _commit_locked(self, force: bool = False):
        if not force and self.bytes_since_commit <= 0:
            return
        event_id = "commit_" + uuid.uuid4().hex
        self.pending_commits.append(event_id)
        self.items_drained.clear()
        await self._send_json({"type": "input_audio_buffer.commit", "event_id": event_id})
        self.bytes_since_commit = 0

    async def _send_json(self, payload: dict):
        if self.ws is None:
            raise ConnectionError("Transcription connection is closed")
        try:
            await self.ws.send(json.dumps(payload))
        except Exception as exc:
            self.closed = True
            raise ConnectionError("Transcription connection interrupted") from exc

    async def _receive_events(self):
        if self.ws is None:
            return

        try:
            async for raw in self.ws:
                event = json.loads(raw)
                event_type = event.get("type")

                if event_type == "session.updated":
                    self.configuration_updated.set()

                elif event_type == "conversation.item.input_audio_transcription.delta":
                    item_id = event.get("item_id", "")
                    delta = event.get("delta", "")
                    if item_id and delta:
                        await self.on_delta(self.session_id, self.speaker, item_id, delta)

                elif event_type == "conversation.item.input_audio_transcription.completed":
                    item_id = event.get("item_id", "")
                    transcript = (event.get("transcript") or "").strip()
                    if item_id and item_id not in self.finalized_items:
                        if item_id not in self.pending_items:
                            self.pending_items.append(item_id)
                        self.items_drained.clear()
                        self.completed_items[item_id] = transcript
                        await self._publish_completed_items()

                elif event_type == "input_audio_buffer.committed":
                    # WebSocket commit events establish turn order; transcription
                    # completions for those turns may arrive out of order.
                    item_id = event.get("item_id", "")
                    if item_id and item_id not in self.finalized_items and item_id not in self.pending_items:
                        self.pending_items.append(item_id)
                        self.items_drained.clear()
                    if self.pending_commits:
                        self.pending_commits.popleft()
                    self.bytes_since_commit = 0
                    await self._publish_completed_items()

                elif event_type == "conversation.item.input_audio_transcription.failed":
                    item_id = event.get("item_id", "")
                    if item_id in self.pending_items:
                        self.completed_items[item_id] = ""
                        await self._publish_completed_items()
                    error = event.get("error") or {}
                    code = error.get("code") or error.get("type") or ""
                    message = error.get("message") or "Realtime transcription failed"
                    if code in ("credit_balance_exhausted", "insufficient_quota"):
                        await self.on_error(
                            self.session_id,
                            message,
                            "openaiQuotaExhausted",
                        )
                    else:
                        await self.on_error(self.session_id, message, "captionsUnavailable")
                    self.closed = True

                elif event_type == "error":
                    error = event.get("error") or {}
                    code = error.get("code") or error.get("type") or ""
                    message = error.get("message") or "Realtime transcription error"
                    if code == "input_audio_buffer_commit_empty" or "buffer too small" in message.lower():
                        # Empty buffer is an acknowledgement, not a missing final result.
                        event_id = error.get("event_id")
                        if event_id in self.pending_commits:
                            self.pending_commits.remove(event_id)
                        elif not event_id and len(self.pending_commits) == 1:
                            self.pending_commits.popleft()
                        await self._publish_completed_items()
                        continue
                    error_code = "openaiQuotaExhausted" if code in ("credit_balance_exhausted", "insufficient_quota") else "captionsUnavailable"
                    await self.on_error(self.session_id, message, error_code)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            if not self.closed:
                print(f"Realtime transcription connection lost (auto-recovering): {exc}")
        finally:
            self.closed = True
            ws = self.ws
            self.ws = None
            if ws is not None:
                try:
                    await ws.close()
                except Exception:
                    pass

    async def _publish_completed_items(self):
        while self.pending_items and self.pending_items[0] in self.completed_items:
            item_id = self.pending_items.popleft()
            transcript = self.completed_items.pop(item_id)
            self.finalized_items.add(item_id)
            await self.on_final(self.session_id, self.speaker, item_id, transcript)
        if not self.pending_items and not self.pending_commits:
            self.items_drained.set()
