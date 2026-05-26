from __future__ import annotations

import asyncio
import json
import os
from functools import partial
from typing import Optional

from openai import OpenAI

SYSTEM_PROMPT = """You are a debate analyst. You extract substantive claims from a debate transcript that participants could agree or disagree with.

Rules:
- Only extract claims directly relevant to the debate topic
- Each statement must be a clear, standalone claim (one sentence)
- Skip pleasantries, procedural talk, and trivial observations
- Do not rephrase or duplicate any of the existing statements provided
- If no new substantive claims are found, return an empty array

Respond with a JSON object: {"statements": ["claim 1", "claim 2", ...]}"""

MOCK_STATEMENTS = [
    ["Switzerland needs stronger AI regulation to keep pace with the EU.",
     "Over-regulation will harm Switzerland's startup ecosystem in Zurich and Lausanne."],
    ["Public trust and oversight are essential for AI adoption in healthcare.",
     "Switzerland should pursue sector-specific AI regulation rather than a horizontal AI law."],
    ["Algorithmic bias is a cross-cutting issue that sector-specific regulation cannot address.",
     "AI transparency requirements should be risk-based, not universal."],
    ["Swiss data sovereignty must be enforced for sensitive domains like health and security.",
     "Data localization is impractical and too expensive for smaller companies."],
    ["Switzerland's existing data protection law (FADP) is insufficient for AI-specific challenges like training data and model outputs.",
     "A lightweight federal AI framework combined with sector-specific rules is the best approach."],
]


class AnalysisService:
    def __init__(self):
        self._client = None
        self._mock = not os.environ.get("OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY") == "your-key-here"
        if self._mock:
            print("AnalysisService: no API key found, using mock statements")

    @property
    def client(self):
        if self._client is None:
            self._client = OpenAI()
        return self._client

    async def extract_statements(
        self,
        transcript_entries: list[dict],
        existing_statements: list[str],
        topic: Optional[str] = None,
    ) -> list[str]:
        if not transcript_entries:
            return []

        if self._mock:
            return self._mock_extract(existing_statements)

        return await self._live_extract(transcript_entries, existing_statements, topic)

    def _mock_extract(self, existing_statements: list[str]) -> list[str]:
        existing_set = set(existing_statements)
        for batch in MOCK_STATEMENTS:
            new = [s for s in batch if s not in existing_set]
            if new:
                return new
        return []

    async def _live_extract(
        self,
        transcript_entries: list[dict],
        existing_statements: list[str],
        topic: Optional[str] = None,
    ) -> list[str]:
        transcript_text = "\n".join(
            f"{e.get('speaker', 'Unknown')}: {e.get('text', '')}"
            for e in transcript_entries
        )

        user_parts = []
        if topic:
            user_parts.append(f"Debate topic: {topic}")
        else:
            user_parts.append("Debate topic: Not specified — infer from the discussion.")

        if existing_statements:
            user_parts.append("Existing statements (do NOT duplicate):")
            for s in existing_statements:
                user_parts.append(f"- {s}")

        user_parts.append("\nTranscript:")
        user_parts.append(transcript_text)

        user_message = "\n".join(user_parts)

        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                partial(
                    self.client.chat.completions.create,
                    model="gpt-4o-mini",
                    temperature=0.3,
                    response_format={"type": "json_object"},
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_message},
                    ],
                ),
            )
            content = response.choices[0].message.content
            data = json.loads(content)
            statements = data.get("statements", [])
            return [s for s in statements if isinstance(s, str) and s.strip()]
        except (json.JSONDecodeError, KeyError, IndexError) as e:
            print(f"Analysis parse error: {e}")
            return []
        except Exception as e:
            print(f"Analysis error: {e}")
            return []
