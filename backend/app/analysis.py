from __future__ import annotations

import asyncio
import json
import os
import re
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

COMMON_GROUND_BASE = """You are an impartial deliberation mediator, inspired by the "group-aware consensus" used in Pol.is and the AI-mediator approach studied by DeepMind.

You receive, for a live room discussion: the topic, how opinion groups voted, statements that found broad agreement, and statements that divided people.

Never invent positions that are not supported by the data. Be neutral, concise, and non-partisan.

For "groupAnalysis": add one entry per opinion group provided in the input, using the same group letters. Each entry gets a short title and a 1-2 sentence description of that group's stance. If no opinion-group data is provided, return an empty array."""

COMMON_GROUND_PROMPTS = {
    "basic": COMMON_GROUND_BASE + """

Write a short "group statement" the whole room could endorse. Capture genuine common ground first, acknowledge the main tension, and propose one bridging statement.

Respond ONLY with JSON:
{
  "groupAnalysis": [{"group": "A", "title": "2-4 word label for this opinion group", "description": "1-2 sentence description of what this group believes, grounded in the vote data"}],
  "groupStatement": "2-3 sentence statement the group could collectively endorse",
  "commonGround": ["exactly 2 short bullets of shared agreement"],
  "divides": ["exactly 2 short bullets describing key disagreements"],
  "bridgingProposal": "one sentence proposal likely to gain cross-group support"
}""",
    "extended": COMMON_GROUND_BASE + """

Produce a richer mediation summary. Surface more nuance across opinion groups while staying grounded in the vote data.

Respond ONLY with JSON:
{
  "groupAnalysis": [{"group": "A", "title": "2-4 word label for this opinion group", "description": "1-2 sentence description of what this group believes, grounded in the vote data"}],
  "groupStatement": "3-4 sentence statement balancing shared values and main tensions",
  "commonGround": ["3-5 short bullets of shared agreement, ordered from strongest to weaker"],
  "divides": ["3-5 short bullets describing open tensions, ordered by importance"],
  "bridgingProposal": "one concrete bridging sentence",
  "insights": ["2-3 short observations about how groups align or diverge"]
}""",
    "comprehensive": COMMON_GROUND_BASE + """

Produce the deepest analysis available from the data. Map multiple layers of agreement, disagreement, trade-offs, and group-specific perspectives.

Respond ONLY with JSON:
{
  "groupAnalysis": [{"group": "A", "title": "2-4 word label for this opinion group", "description": "1-2 sentence description of what this group believes, grounded in the vote data"}],
  "groupStatement": "3-5 sentence synthesis the room could discuss collectively",
  "commonGround": ["4-6 bullets of shared agreement across groups"],
  "divides": ["4-6 bullets of open tensions and unresolved disagreements"],
  "bridgingProposal": "primary bridging sentence most likely to gain cross-group support",
  "bridgingAlternatives": ["1-2 alternative bridging approaches"],
  "insights": ["3-4 observations about group dynamics and voting patterns"],
  "tradeoffs": ["2-3 bullets on what each side gains or risks in compromise"],
  "groupNotes": [{"group": "A", "note": "one sentence on this group's core concern"}]
}

Include groupNotes only when opinion-group data is provided. Use the group letters from the input."""
}

COMMON_GROUND_DEPTHS = frozenset(COMMON_GROUND_PROMPTS)

TENSION_PROMPT = """You are a deliberation facilitator. Given the live discussion transcript and vote results, write crisp votable statements that surface the key OPEN TENSIONS — the unresolved disagreements underneath the conversation that are worth testing with the room.

What an open tension IS:
- A fresh, sharply framed proposition that forces a choice between two defensible positions the room is actually split on
- Something that would divide the room roughly down the middle if voted on now
- Often the underlying trade-off, principle, or edge case that the existing statements only hint at

What an open tension is NOT (do NOT output these):
- A paraphrase, rewording, or merge of any existing statement
- A restatement of something already broadly agreed (consensus) — that is settled, not a tension
- A vague, compound, or double-barrelled sentence, or a leading/loaded question

Method:
- Read the transcript to understand context, then look at which statements split the room
- Identify the deeper disagreement driving those splits and phrase it as ONE new claim
- Frame neutrally so either side could plausibly vote agree; no straw-manning
- Be specific to this discussion and topic; never invent positions unsupported by the data
- Each output must be materially different from every existing statement AND from the other tensions you output
- You MUST return the requested number of tensions — always hit the count. If obvious tensions run out, surface finer-grained trade-offs, edge cases, or second-order implications rather than returning fewer

Respond ONLY with JSON:
{"tensions": ["statement 1", "statement 2", ...]}"""

MOCK_TENSIONS = [
    "Switzerland should adopt a horizontal federal AI law rather than relying mainly on sector-specific rules.",
    "Mandatory AI transparency should apply to every consumer-facing system, not only high-risk use cases.",
    "Sensitive Swiss data must be processed only on infrastructure located in Switzerland.",
]

MOCK_COMMON_GROUND = {
    "basic": {
        "groupAnalysis": [
            {"group": "A", "title": "Federal-law advocates", "description": "Favor a broad federal AI law and EU-compatible guardrails to ensure consistent oversight."},
            {"group": "B", "title": "Sector pragmatists", "description": "Prefer sector-specific rules that keep the burden on startups low while still protecting public trust."},
        ],
        "groupStatement": "Most participants agree that Switzerland needs a credible response to AI risks and that public trust matters, while disagreeing on whether a broad federal law or sector-specific rules is the right vehicle.",
        "commonGround": [
            "AI oversight and public trust are widely seen as essential.",
            "Heavy-handed rules that crush startups should be avoided.",
        ],
        "divides": [
            "Horizontal AI law vs. sector-specific regulation.",
            "Whether data localization is practical for smaller firms.",
        ],
        "bridgingProposal": "Adopt a lightweight federal AI baseline focused on transparency and accountability, paired with sector-specific rules where risk is highest.",
    },
    "extended": {
        "groupAnalysis": [
            {"group": "A", "title": "Federal-harmonization advocates", "description": "Push for federal coherence and EU alignment, accepting more scope in exchange for predictability across sectors."},
            {"group": "B", "title": "Sector-specific pragmatists", "description": "Want domain-tailored rules and minimal cost for smaller firms, while still backing baseline transparency."},
        ],
        "groupStatement": "Most participants agree that Switzerland needs a credible response to AI risks and that public trust matters, while disagreeing on whether a broad federal law or sector-specific rules is the right vehicle. There is shared concern for protecting smaller companies from disproportionate burden, yet disagreement on how far federal harmonization should go.",
        "commonGround": [
            "AI oversight and public trust are widely seen as essential.",
            "Heavy-handed rules that crush startups should be avoided.",
            "Sector-specific expertise should inform high-risk domains like health.",
            "Transparency obligations should be proportionate to risk.",
        ],
        "divides": [
            "Horizontal AI law vs. sector-specific regulation.",
            "Whether data localization is practical for smaller firms.",
            "How strictly training-data rules should apply beyond FADP.",
            "Whether EU alignment should drive Swiss AI policy.",
        ],
        "bridgingProposal": "Adopt a lightweight federal AI baseline focused on transparency and accountability, paired with sector-specific rules where risk is highest.",
        "insights": [
            "Groups that favor sector rules still support baseline transparency.",
            "Data-sovereignty advocates and pragmatists split mainly on cost, not principle.",
        ],
    },
    "comprehensive": {
        "groupAnalysis": [
            {"group": "A", "title": "Federal coherence camp", "description": "Prioritizes federal coherence and EU-compatible guardrails, favoring horizontal rules for predictability."},
            {"group": "B", "title": "Innovation-first camp", "description": "Wants sector nuance and minimal burden on innovators, wary of one-size-fits-all obligations."},
        ],
        "groupStatement": "Most participants agree that Switzerland needs a credible response to AI risks and that public trust matters, while disagreeing on whether a broad federal law or sector-specific rules is the right vehicle. There is shared concern for protecting smaller companies from disproportionate burden. The room also shares skepticism toward one-size-fits-all rules that ignore domain risk.",
        "commonGround": [
            "AI oversight and public trust are widely seen as essential.",
            "Heavy-handed rules that crush startups should be avoided.",
            "Sector-specific expertise should inform high-risk domains like health.",
            "Transparency obligations should be proportionate to risk.",
            "Existing FADP protections are a floor, not a complete AI answer.",
        ],
        "divides": [
            "Horizontal AI law vs. sector-specific regulation.",
            "Whether data localization is practical for smaller firms.",
            "How strictly training-data rules should apply beyond FADP.",
            "Whether EU alignment should drive Swiss AI policy.",
            "Mandatory audits vs. voluntary industry standards.",
        ],
        "bridgingProposal": "Adopt a lightweight federal AI baseline focused on transparency and accountability, paired with sector-specific rules where risk is highest.",
        "bridgingAlternatives": [
            "Pilot federal rules in health and finance first, then evaluate expansion.",
            "Create an independent AI oversight body with sector advisory panels.",
        ],
        "insights": [
            "Groups that favor sector rules still support baseline transparency.",
            "Data-sovereignty advocates and pragmatists split mainly on cost, not principle.",
            "Startup-protection language appears across otherwise opposing clusters.",
            "EU-alignment divides are sharper among groups skeptical of horizontal law.",
        ],
        "tradeoffs": [
            "Horizontal law trades flexibility for predictability across sectors.",
            "Strict localization improves sovereignty but raises compliance cost for SMEs.",
            "Risk-based transparency may leave gaps that universal rules would close.",
        ],
        "groupNotes": [
            {"group": "A", "note": "Prioritizes federal coherence and EU-compatible guardrails."},
            {"group": "B", "note": "Wants sector nuance and minimal burden on innovators."},
        ],
    },
}

def _normalize_text(text: str) -> set[str]:
    cleaned = re.sub(r"[^\w\s]", " ", (text or "").lower())
    return {w for w in cleaned.split() if len(w) > 2}


def _too_similar(tokens: set[str], others: list[set[str]], threshold: float = 0.6) -> bool:
    if not tokens:
        return False
    for other in others:
        if not other:
            continue
        overlap = len(tokens & other)
        union = len(tokens | other)
        if union and overlap / union >= threshold:
            return True
        smaller = min(len(tokens), len(other))
        if smaller and overlap / smaller >= 0.85:
            return True
    return False


def _dedupe_tensions(tensions: list[str], existing: list[str]) -> list[str]:
    existing_tokens = [_normalize_text(s) for s in existing]
    accepted: list[str] = []
    accepted_tokens: list[set[str]] = []
    for tension in tensions:
        tokens = _normalize_text(tension)
        if _too_similar(tokens, existing_tokens) or _too_similar(tokens, accepted_tokens):
            continue
        accepted.append(tension)
        accepted_tokens.append(tokens)
    return accepted


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

    async def generate_tension_statements(
        self,
        analysis: dict,
        count: int = 3,
        topic: Optional[str] = None,
        language: Optional[str] = None,
    ) -> list[str]:
        count = max(1, min(5, int(count or 3)))
        if self._mock:
            existing = set(analysis.get("existingStatements") or [])
            return [t for t in MOCK_TENSIONS if t not in existing][:count]

        return await self._live_tension_statements(analysis, count, topic, language)

    async def generate_common_ground(
        self,
        analysis: dict,
        topic: Optional[str] = None,
        language: Optional[str] = None,
        depth: str = "basic",
    ) -> Optional[dict]:
        depth = depth if depth in COMMON_GROUND_DEPTHS else "basic"
        if self._mock:
            return {**MOCK_COMMON_GROUND[depth], "depth": depth}

        return await self._live_common_ground(analysis, topic, language, depth)

    def _normalize_common_ground(self, data: dict, depth: str) -> Optional[dict]:
        statement = (data.get("groupStatement") or "").strip()
        if not statement:
            return None
        group_notes = []
        for item in data.get("groupNotes") or []:
            if not isinstance(item, dict):
                continue
            group = (item.get("group") or "").strip()
            note = (item.get("note") or "").strip()
            if group and note:
                group_notes.append({"group": group, "note": note})
        group_analysis = []
        for item in data.get("groupAnalysis") or []:
            if not isinstance(item, dict):
                continue
            group = (item.get("group") or "").strip()
            title = (item.get("title") or "").strip()
            description = (item.get("description") or "").strip()
            if group and description:
                group_analysis.append({"group": group, "title": title, "description": description})
        result = {
            "depth": depth,
            "groupAnalysis": group_analysis,
            "groupStatement": statement,
            "commonGround": [s for s in (data.get("commonGround") or []) if isinstance(s, str) and s.strip()],
            "divides": [s for s in (data.get("divides") or []) if isinstance(s, str) and s.strip()],
            "bridgingProposal": (data.get("bridgingProposal") or "").strip(),
        }
        insights = [s for s in (data.get("insights") or []) if isinstance(s, str) and s.strip()]
        if insights:
            result["insights"] = insights
        tradeoffs = [s for s in (data.get("tradeoffs") or []) if isinstance(s, str) and s.strip()]
        if tradeoffs:
            result["tradeoffs"] = tradeoffs
        alternatives = [s for s in (data.get("bridgingAlternatives") or []) if isinstance(s, str) and s.strip()]
        if alternatives:
            result["bridgingAlternatives"] = alternatives
        if group_notes:
            result["groupNotes"] = group_notes
        return result

    async def _live_tension_statements(
        self,
        analysis: dict,
        count: int,
        topic: Optional[str] = None,
        language: Optional[str] = None,
    ) -> list[str]:
        request_count = count + 4
        parts = []
        parts.append(f"Session topic: {topic}" if topic else "Session topic: Not specified — infer from the data.")
        parts.append(
            f"\nYou MUST return at least {count} open-tension statement(s). "
            f"Generate {request_count} distinct candidates, ordered strongest first, so the {count} best can be kept. "
            f"Never return fewer than {count} — if the data is thin, dig into finer-grained trade-offs and edge cases to reach the count."
        )

        transcript = analysis.get("transcript") or []
        if transcript:
            parts.append("\nDiscussion transcript (for context — understand what people actually mean):")
            for turn in transcript:
                speaker = turn.get("speaker") or "Speaker"
                text = (turn.get("text") or "").strip()
                if text:
                    parts.append(f"{speaker}: {text}")

        existing = analysis.get("existingStatements") or []
        if existing:
            parts.append("\nExisting statements — your tensions must NOT restate or paraphrase any of these:")
            for s in existing:
                parts.append(f"- {s}")

        divisive = analysis.get("divisive") or []
        if divisive:
            parts.append("\nMost divisive statements (prioritize these splits):")
            for s in divisive:
                split = s.get("splitPct")
                split_note = f", ~{split}% split" if split is not None else ""
                parts.append(
                    f"- \"{s.get('text', '')}\" ({s.get('agree', 0)} agree / {s.get('disagree', 0)} disagree{split_note})"
                )

        consensus = analysis.get("consensus") or []
        if consensus:
            parts.append("\nStatements with broad agreement (for context — tensions should contrast with these):")
            for s in consensus:
                parts.append(f"- \"{s.get('text', '')}\" ({s.get('agree', 0)} agree / {s.get('disagree', 0)} disagree)")

        user_message = "\n".join(parts)

        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                partial(
                    self.client.chat.completions.create,
                    model="gpt-4o-mini",
                    temperature=0.45,
                    response_format={"type": "json_object"},
                    messages=[
                        {"role": "system", "content": TENSION_PROMPT + _language_rule(language)},
                        {"role": "user", "content": user_message},
                    ],
                ),
            )
            data = json.loads(response.choices[0].message.content)
            raw = data.get("tensions")
            if not isinstance(raw, list):
                raw = next((v for v in data.values() if isinstance(v, list)), [])
            tensions = [s.strip() for s in raw if isinstance(s, str) and s.strip()]
            filtered = _dedupe_tensions(tensions, existing)
            if len(filtered) < count:
                existing_set = {s.strip().lower() for s in existing}
                seen = {t.lower() for t in filtered}
                for t in tensions:
                    if len(filtered) >= count:
                        break
                    key = t.lower()
                    if key in seen or key in existing_set:
                        continue
                    filtered.append(t)
                    seen.add(key)
            return (filtered or tensions)[:count]
        except (json.JSONDecodeError, KeyError, IndexError) as e:
            print(f"Tension parse error: {e}")
            return []
        except Exception as e:
            print(f"Tension generation error: {e}")
            return []

    async def _live_common_ground(
        self,
        analysis: dict,
        topic: Optional[str] = None,
        language: Optional[str] = None,
        depth: str = "basic",
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
                for t in (g.get("stronglyAgree") or []):
                    parts.append(f"  strongly agrees: \"{t}\"")
                for t in (g.get("agree") or []):
                    parts.append(f"  tends to agree: \"{t}\"")
                for t in (g.get("stronglyDisagree") or []):
                    parts.append(f"  strongly disagrees: \"{t}\"")
                for t in (g.get("disagree") or []):
                    parts.append(f"  tends to disagree: \"{t}\"")

        previous = analysis.get("previousFeedback") or []
        if previous:
            parts.append("\nPrevious common ground proposals and participant reactions (refine — do not repeat rejected framings):")
            for idx, prev in enumerate(previous, start=1):
                votes = prev.get("votes") or {}
                parts.append(
                    f"\nVersion {idx} ({prev.get('depth', 'basic')}): \"{prev.get('groupStatement', '')}\""
                    f" — {votes.get('agree', 0)} agree / {votes.get('disagree', 0)} disagree"
                )
                for reaction in prev.get("feedback") or []:
                    line = f"  - {reaction.get('name', 'Participant')} {reaction.get('vote', '')}"
                    if reaction.get("reason"):
                        line += f": \"{reaction['reason']}\""
                    parts.append(line)

        parts.append(f"\nAnalysis depth requested: {depth}")
        user_message = "\n".join(parts)
        prompt = COMMON_GROUND_PROMPTS.get(depth, COMMON_GROUND_PROMPTS["basic"])
        temperature = {"basic": 0.4, "extended": 0.45, "comprehensive": 0.5}.get(depth, 0.4)

        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                partial(
                    self.client.chat.completions.create,
                    model="gpt-4o-mini",
                    temperature=temperature,
                    response_format={"type": "json_object"},
                    messages=[
                        {"role": "system", "content": prompt + _language_rule(language)},
                        {"role": "user", "content": user_message},
                    ],
                ),
            )
            data = json.loads(response.choices[0].message.content)
            return self._normalize_common_ground(data, depth)
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
