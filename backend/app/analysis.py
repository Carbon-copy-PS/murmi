from __future__ import annotations

import asyncio
import json
import os
from functools import partial
from typing import Optional

from openai import OpenAI

from .languages import LANGUAGE_LABELS

SYSTEM_PROMPT = """You are a discussion analyst. You extract substantive claims from a room transcript that participants could agree or disagree with.

Rules:
- Only extract claims directly relevant to the session topic
- Each statement must be a clear, standalone claim (one sentence)
- Skip pleasantries, procedural talk, and trivial observations
- Do not rephrase or duplicate any of the existing statements provided
- If no new substantive claims are found, return an empty array

Respond with a JSON object: {"statements": ["claim 1", "claim 2", ...]}"""

TURN_SYSTEM_PROMPT = """You are a discussion analyst. Convert one speaker's completed contribution into at most one votable statement.

Rules:
- Capture the speaker's overall argument or opinion, not every fragment
- The result must be a clear, standalone claim that participants can agree or disagree with
- Do not write "the speaker argues that"; write the claim itself
- Skip procedural talk, transcription chatter, greetings, filler, and incomplete thoughts
- If the speaker did not make a substantive argument, return an empty array
- Do not duplicate any existing statement
Respond with a JSON object: {"statements": ["single overall claim"]}"""

COMMON_GROUND_PROMPT = """You are an impartial deliberation mediator, inspired by the "group-aware consensus" used in Pol.is and the AI-mediator approach studied by DeepMind.

You receive, for a live room discussion: the topic, how opinion groups voted, statements that found broad agreement, and statements that divided people.

Write a short "group statement" that the whole room could endorse. It must:
- Capture genuine common ground first, in plain language
- Fairly acknowledge the main tension, respecting minority views without erasing the majority
- Propose one concrete bridging statement that people across groups might accept
- Never invent positions that are not supported by the data
- Be neutral, concise, and non-partisan

Respond ONLY with JSON:
{
  "groupStatement": "2-3 sentence statement the group could collectively endorse",
  "commonGround": ["short bullet of shared agreement", "..."],
  "divides": ["short bullet describing a key disagreement", "..."],
  "bridgingProposal": "one sentence proposal likely to gain cross-group support"
}"""

MOCK_COMMON_GROUND = {
    "groupStatement": "Most participants agree that Switzerland needs a credible response to AI risks and that public trust matters, while disagreeing on whether a broad federal law or sector-specific rules is the right vehicle. There is shared concern for protecting smaller companies from disproportionate burden.",
    "commonGround": [
        "AI oversight and public trust are widely seen as essential.",
        "Heavy-handed rules that crush startups should be avoided.",
    ],
    "divides": [
        "Horizontal AI law vs. sector-specific regulation.",
        "Whether data localization is practical for smaller firms.",
    ],
    "bridgingProposal": "Adopt a lightweight federal AI baseline focused on transparency and accountability, paired with sector-specific rules where risk is highest.",
}

def _language_rule(language: Optional[str] = None) -> str:
    if language and language in LANGUAGE_LABELS:
        label = LANGUAGE_LABELS[language]
        if language == "de":
            label = "German (including Swiss German)"
        return (
            f"\nLanguage rule (critical):\n"
            f"- Write every statement in {label}.\n"
            f"- Do not translate into English or any other language.\n"
        )
    return (
        "\nLanguage rule (critical):\n"
        "- Write every statement in the same language as the speaker's contribution.\n"
        "- Never default to English when the contribution is in another language.\n"
    )


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
        language: Optional[str] = None,
    ) -> list[str]:
        if not transcript_entries:
            return []

        if self._mock:
            return self._mock_extract(existing_statements)

        return await self._live_extract(transcript_entries, existing_statements, topic, language)

    async def extract_turn_statement(
        self,
        turn_entry: dict,
        existing_statements: list[str],
        topic: Optional[str] = None,
        language: Optional[str] = None,
    ) -> list[str]:
        if not turn_entry or not turn_entry.get("text"):
            return []

        if self._mock:
            return self._mock_extract(existing_statements)[:1]

        return await self._live_extract_turn(turn_entry, existing_statements, topic, language)

    async def generate_common_ground(
        self,
        analysis: dict,
        topic: Optional[str] = None,
        language: Optional[str] = None,
    ) -> Optional[dict]:
        if self._mock:
            return MOCK_COMMON_GROUND

        return await self._live_common_ground(analysis, topic, language)

    async def _live_common_ground(
        self,
        analysis: dict,
        topic: Optional[str] = None,
        language: Optional[str] = None,
    ) -> Optional[dict]:
        parts = []
        parts.append(f"Session topic: {topic}" if topic else "Session topic: Not specified — infer from the data.")
        parts.append(f"\nParticipants who voted: {analysis.get('voterCount', 0)}")

        consensus = analysis.get("consensus") or []
        if consensus:
            parts.append("\nStatements with broad agreement:")
            for s in consensus:
                parts.append(f"- \"{s.get('text', '')}\" ({s.get('agree', 0)} agree / {s.get('disagree', 0)} disagree)")

        divisive = analysis.get("divisive") or []
        if divisive:
            parts.append("\nStatements that divided the room:")
            for s in divisive:
                parts.append(f"- \"{s.get('text', '')}\" ({s.get('agree', 0)} agree / {s.get('disagree', 0)} disagree)")

        groups = analysis.get("groups") or []
        if groups:
            parts.append("\nOpinion groups:")
            for g in groups:
                parts.append(f"Group {g.get('letter', '?')} ({g.get('size', 0)} people):")
                for t in (g.get("agree") or []):
                    parts.append(f"  tends to agree: \"{t}\"")
                for t in (g.get("disagree") or []):
                    parts.append(f"  tends to disagree: \"{t}\"")

        user_message = "\n".join(parts)

        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                partial(
                    self.client.chat.completions.create,
                    model="gpt-4o-mini",
                    temperature=0.4,
                    response_format={"type": "json_object"},
                    messages=[
                        {"role": "system", "content": COMMON_GROUND_PROMPT + _language_rule(language)},
                        {"role": "user", "content": user_message},
                    ],
                ),
            )
            data = json.loads(response.choices[0].message.content)
            statement = (data.get("groupStatement") or "").strip()
            if not statement:
                return None
            return {
                "groupStatement": statement,
                "commonGround": [s for s in (data.get("commonGround") or []) if isinstance(s, str) and s.strip()],
                "divides": [s for s in (data.get("divides") or []) if isinstance(s, str) and s.strip()],
                "bridgingProposal": (data.get("bridgingProposal") or "").strip(),
            }
        except (json.JSONDecodeError, KeyError, IndexError) as e:
            print(f"Common ground parse error: {e}")
            return None
        except Exception as e:
            print(f"Common ground error: {e}")
            return None

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
        language: Optional[str] = None,
    ) -> list[str]:
        transcript_text = "\n".join(
            f"{e.get('speaker', 'Unknown')}: {e.get('text', '')}"
            for e in transcript_entries
        )

        user_parts = []
        if topic:
            user_parts.append(f"Session topic: {topic}")
        else:
            user_parts.append("Session topic: Not specified — infer from the discussion.")

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
                        {"role": "system", "content": SYSTEM_PROMPT + _language_rule(language)},
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

    async def _live_extract_turn(
        self,
        turn_entry: dict,
        existing_statements: list[str],
        topic: Optional[str] = None,
        language: Optional[str] = None,
    ) -> list[str]:
        speaker = turn_entry.get("speaker", "Unknown")
        text = turn_entry.get("text", "")

        user_parts = []
        if topic:
            user_parts.append(f"Session topic: {topic}")
        else:
            user_parts.append("Session topic: Not specified — infer from the contribution.")

        if existing_statements:
            user_parts.append("Existing statements (do NOT duplicate):")
            for s in existing_statements:
                user_parts.append(f"- {s}")

        if language and language in LANGUAGE_LABELS:
            label = LANGUAGE_LABELS[language]
            if language == "de":
                label = "German (including Swiss German)"
            user_parts.append(f"Required output language: {label}")

        user_parts.append("\nCompleted speaker contribution:")
        user_parts.append(f"{speaker}: {text}")
        user_message = "\n".join(user_parts)

        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                partial(
                    self.client.chat.completions.create,
                    model="gpt-4o-mini",
                    temperature=0.2,
                    response_format={"type": "json_object"},
                    messages=[
                        {"role": "system", "content": TURN_SYSTEM_PROMPT + _language_rule(language)},
                        {"role": "user", "content": user_message},
                    ],
                ),
            )
            content = response.choices[0].message.content
            data = json.loads(content)
            statements = data.get("statements", [])
            return [s.strip() for s in statements if isinstance(s, str) and s.strip()][:1]
        except (json.JSONDecodeError, KeyError, IndexError) as e:
            print(f"Turn analysis parse error: {e}")
            return []
        except Exception as e:
            print(f"Turn analysis error: {e}")
            return []
