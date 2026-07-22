from __future__ import annotations

import asyncio
import base64
import json
import os
import time
from typing import Awaitable, Callable, Optional

import websockets

from .languages import LANGUAGE_LABELS


CaptionDeltaHandler = Callable[[str, str, str, str], Awaitable[None]]
CaptionFinalHandler = Callable[[str, str, str, str, Optional[bytes]], Awaitable[None]]
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
        self.language = language or os.environ.get("OPENAI_REALTIME_LANGUAGE")
        self.on_delta = on_delta
        self.on_final = on_final
        self.on_error = on_error
        self.api_key = os.environ.get("OPENAI_API_KEY", "")
        self.transcription_model = os.environ.get("OPENAI_REALTIME_TRANSCRIPTION_MODEL", "gpt-4o-transcribe")
        self.prompt = os.environ.get(
            "OPENAI_REALTIME_TRANSCRIPTION_PROMPT",
            self._default_prompt(language),
        )
        self.turn_detection = os.environ.get("OPENAI_REALTIME_TURN_DETECTION", "server_vad")
        self.vad_threshold = float(os.environ.get("OPENAI_REALTIME_VAD_THRESHOLD", "0.5"))
        self.vad_prefix_padding_ms = int(os.environ.get("OPENAI_REALTIME_VAD_PREFIX_PADDING_MS", "300"))
        self.vad_silence_duration_ms = int(os.environ.get("OPENAI_REALTIME_VAD_SILENCE_DURATION_MS", "500"))
        self.commit_interval = float(os.environ.get("OPENAI_REALTIME_COMMIT_SECONDS", "1.0"))
        self.max_turn_seconds = float(os.environ.get("OPENAI_REALTIME_MAX_TURN_SECONDS", "10"))
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
        self.max_turn_audio_bytes = int(
            self.sample_rate
            * self.bytes_per_sample
            * float(os.environ.get("OPENAI_REALTIME_FINAL_AUDIO_MAX_SECONDS", "90"))
        )
        self.turn_audio = bytearray()
        self.audio_energy_sum = 0.0
        self.audio_energy_samples = 0
        self.peak_sample = 0
        self.closed = False
        self.finalized_items: set[str] = set()

    @property
    def available(self) -> bool:
        return bool(self.api_key) and self.api_key != "your-key-here"

    @property
    def is_open(self) -> bool:
        return self.ws is not None and not self.closed

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
            return True
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
        self._track_audio_energy(audio_bytes)
        self._track_turn_audio(audio_bytes)

        async with self.send_lock:
            if not self.is_open:
                return
            await self._send_json({
                "type": "input_audio_buffer.append",
                "audio": base64_pcm,
            })
            self.bytes_since_commit += len(audio_bytes)

            if self._manual_turn_detection():
                commit_bytes = int(self.sample_rate * self.bytes_per_sample * self.commit_interval)
                if self.bytes_since_commit >= commit_bytes:
                    await self._commit_locked()
            else:
                max_turn_bytes = int(self.sample_rate * self.bytes_per_sample * self.max_turn_seconds)
                if max_turn_bytes > 0 and self.bytes_since_commit >= max_turn_bytes:
                    await self._commit_locked()

    async def close(self, flush: bool = True):
        if self.closed:
            return
        self.closed = True

        if flush and self.ws is not None and self.bytes_since_commit > 0 and self._manual_turn_detection():
            try:
                async with self.send_lock:
                    await self._commit_locked()
                await asyncio.sleep(0.5)
            except Exception:
                pass
        elif flush and self.ws is not None and self.bytes_since_commit > 0:
            try:
                silence_ms = self.vad_silence_duration_ms + 300
                silence_bytes = int(self.sample_rate * self.bytes_per_sample * silence_ms / 1000)
                await self._send_json({
                    "type": "input_audio_buffer.append",
                    "audio": base64.b64encode(b"\x00" * silence_bytes).decode("ascii"),
                })
                await asyncio.sleep(silence_ms / 1000)
            except Exception:
                pass

        if self.receiver_task:
            self.receiver_task.cancel()
            try:
                await self.receiver_task
            except asyncio.CancelledError:
                pass
            except Exception:
                pass

        if self.ws is not None:
            try:
                await self.ws.close()
            except Exception:
                pass
            self.ws = None

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

    def _default_prompt(self, language: str | None) -> str:
        base = (
            "Transcribe a live discussion. Preserve the language being spoken; do not translate. "
            "Ignore non-speech sounds and brief filler noises."
        )
        if language and language in LANGUAGE_LABELS:
            label = LANGUAGE_LABELS[language]
            if language == "de":
                label = "German or Swiss German"
            return f"The speaker selected {label} as their primary spoken language. {base}"
        supported = ", ".join(LANGUAGE_LABELS.values())
        return (
            f"Transcribe a live multilingual discussion. Speakers may use any of these languages: "
            f"{supported}. Preserve the language being spoken; do not translate. "
            "Ignore non-speech sounds and brief filler noises."
        )

    async def _commit_locked(self):
        if self.bytes_since_commit <= 0:
            return
        await self._send_json({"type": "input_audio_buffer.commit"})
        self.bytes_since_commit = 0

    async def _send_json(self, payload: dict):
        if self.ws is None:
            return
        try:
            await self.ws.send(json.dumps(payload))
        except Exception:
            self.closed = True

    async def _receive_events(self):
        if self.ws is None:
            return

        try:
            async for raw in self.ws:
                event = json.loads(raw)
                event_type = event.get("type")

                if event_type == "conversation.item.input_audio_transcription.delta":
                    item_id = event.get("item_id", "")
                    delta = event.get("delta", "")
                    if item_id and delta:
                        await self.on_delta(self.session_id, self.speaker, item_id, delta)

                elif event_type == "conversation.item.input_audio_transcription.completed":
                    item_id = event.get("item_id", "")
                    transcript = (event.get("transcript") or "").strip()
                    turn_audio = bytes(self.turn_audio) if self.turn_audio else None
                    if (
                        item_id
                        and transcript
                        and item_id not in self.finalized_items
                        and self._has_enough_audio_energy()
                    ):
                        self.finalized_items.add(item_id)
                        await self.on_final(
                            self.session_id,
                            self.speaker,
                            item_id,
                            transcript,
                            turn_audio,
                        )
                    self._reset_audio_energy()
                    self._reset_turn_audio()
                    self.bytes_since_commit = 0

                elif event_type == "error":
                    error = event.get("error") or {}
                    code = error.get("code") or ""
                    message = error.get("message") or "Realtime transcription error"
                    if code == "input_audio_buffer_commit_empty" or "buffer too small" in message.lower():
                        continue
                    await self.on_error(self.session_id, message, "captionsUnavailable")
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

    def _track_audio_energy(self, audio_bytes: bytes):
        for i in range(0, len(audio_bytes) - 1, 2):
            sample = int.from_bytes(audio_bytes[i:i + 2], "little", signed=True)
            abs_sample = abs(sample)
            self.audio_energy_sum += abs_sample
            self.audio_energy_samples += 1
            if abs_sample > self.peak_sample:
                self.peak_sample = abs_sample

    def _track_turn_audio(self, audio_bytes: bytes):
        self.turn_audio.extend(audio_bytes)
        overflow = len(self.turn_audio) - self.max_turn_audio_bytes
        if overflow > 0:
            del self.turn_audio[:overflow]

    def _has_enough_audio_energy(self) -> bool:
        if self.audio_energy_samples == 0:
            return False
        mean = self.audio_energy_sum / self.audio_energy_samples
        return mean >= 140 or self.peak_sample >= 1200

    def _reset_audio_energy(self):
        self.audio_energy_sum = 0.0
        self.audio_energy_samples = 0
        self.peak_sample = 0

    def _reset_turn_audio(self):
        self.turn_audio.clear()
