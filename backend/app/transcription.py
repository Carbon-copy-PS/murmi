from __future__ import annotations

import io
import asyncio
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
