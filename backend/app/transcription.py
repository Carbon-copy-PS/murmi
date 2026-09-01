from __future__ import annotations

import io
import asyncio
import os
import wave
from functools import partial

from openai import OpenAI


class TranscriptionService:
    def __init__(self):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            self._client = OpenAI()
        return self._client

    async def transcribe(self, audio_bytes: bytes) -> str | None:
        if len(audio_bytes) < 1000:
            return None

        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = "audio.webm"

        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                partial(
                    self.client.audio.transcriptions.create,
                    model="whisper-1",
                    file=audio_file,
                ),
            )
            text = response.text.strip()
            return text if text else None
        except Exception as e:
            print(f"Transcription error: {e}")
            return None

    async def transcribe_pcm16(self, audio_bytes: bytes, sample_rate: int = 24000) -> str | None:
        if len(audio_bytes) < sample_rate:
            return None

        audio_file = io.BytesIO()
        with wave.open(audio_file, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample_rate)
            wav.writeframes(audio_bytes)
        audio_file.seek(0)
        audio_file.name = "turn.wav"

        model = os.environ.get("OPENAI_FINAL_TRANSCRIPTION_MODEL", "gpt-4o-transcribe")
        prompt = os.environ.get(
            "OPENAI_FINAL_TRANSCRIPTION_PROMPT",
            "Transcribe the user's speech exactly. Preserve English, German, Swiss German, "
            "and French as spoken. Do not translate. If there is no speech, return no text.",
        )

        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                partial(
                    self.client.audio.transcriptions.create,
                    model=model,
                    file=audio_file,
                    prompt=prompt,
                    temperature=0,
                ),
            )
            text = response.text.strip()
            return text if text else None
        except Exception as e:
            print(f"Final transcription error: {e}")
            return None
