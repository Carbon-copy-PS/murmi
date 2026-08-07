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
    "generic": COMMON_GROUND_BASE + """

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
    "policy": COMMON_GROUND_BASE + """

Turn the discussion into a WORKING POLICY DRAFT the room can refine. Stay grounded ONLY in the evidence pack (arguments with IDs, vote tallies, opinion groups, co-support pairs, and anonymous prior feedback). Never invent argument IDs, feedback IDs, or positions.

Evidence rules:
- Stable argument IDs look like a1, a2, a3 — cite ONLY those (and fb* feedback IDs when present).
- Anonymous feedback IDs look like fb1, fb2 — cite them when addressing prior reactions.
- Only combine multiple arguments into one recommendation when co-support marks them safeToCombine (or when supportOverlap is clearly high and conflictRate is low). Otherwise keep them separate or flag a trade-off.
- Preserve parts previous voters marked "agree" (Good enough) unless new votes contradict them.
- Revise parts challenged by "disagree" (Not good enough) feedback; do not claim individual suggestions are already collective agreement.
- Supported anonymous suggestions may become recommendations or essential conditions only when backed by argument evidence; otherwise keep them as trade-offs or unresolved questions.
- Unreconciled concerns stay visible as tradeoffs or unresolvedQuestions.

Respond ONLY with JSON (strict schema):
{
  "status": "working_draft",
  "previousVersionId": "id of prior version or null",
  "changeSummary": "1-3 sentences on what changed vs previous draft and why (cite feedback/argument IDs when relevant)",
  "groupAnalysis": [{"group": "A", "title": "2-4 word label", "description": "1-2 sentences grounded in group stance data"}],
  "groupStatement": "2-4 sentence framing of this working policy proposal",
  "recommendations": [
    {
      "id": "r1",
      "text": "concrete actionable recommendation",
      "evidenceIds": ["argumentId", "fbN"],
      "preserved": false
    }
  ],
  "essentialConditions": [
    {
      "id": "c1",
      "text": "must-hold condition for cross-group acceptability",
      "evidenceIds": ["argumentId"],
      "preserved": false
    }
  ],
  "tradeoffs": [
    {
      "id": "t1",
      "text": "explicit trade-off this proposal accepts",
      "evidenceIds": ["argumentId"]
    }
  ],
  "unresolvedQuestions": [
    {
      "id": "u1",
      "text": "open question the room still needs to settle",
      "evidenceIds": ["argumentId", "fbN"]
    }
  ]
}

Include 3-6 recommendations, 2-4 essentialConditions, 2-4 tradeoffs, and 2-4 unresolvedQuestions. Every recommendation and essentialCondition MUST include at least one evidenceIds entry from the evidence pack (a1, a2, … or fb*). Do not invent IDs.
""",
}

COMMON_GROUND_MODES = frozenset(COMMON_GROUND_PROMPTS)
DEFAULT_COMMON_GROUND_MODE = "policy"

# Legacy depth ids from older sessions map onto the generic mediation mode.
_LEGACY_DEPTH_TO_MODE = {
    "basic": "generic",
    "extended": "generic",
    "comprehensive": "generic",
}


def normalize_common_ground_mode(mode: str | None) -> str:
    if mode in COMMON_GROUND_MODES:
        return mode
    if mode in _LEGACY_DEPTH_TO_MODE:
        return _LEGACY_DEPTH_TO_MODE[mode]
    return DEFAULT_COMMON_GROUND_MODE

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

RECOMMENDATIONS_PROMPT = """You are a deliberation facilitator. Given the live discussion transcript, vote results, and opinion groups, produce three kinds of recommendations for the facilitator.

1. UNEXPLORED TOPICS — substantive themes raised in the transcript that are NOT yet covered by existing votable statements. Short bullets (one sentence each). Do not invent topics absent from the discussion.

2. DIVISIVE ISSUES — fresh, sharply framed votable propositions that would split the room roughly down the middle. These must:
   - Surface the deeper disagreement driving current vote splits
   - NOT paraphrase, reword, or merge any existing statement or any already-published tension statement
   - NOT restate settled consensus
   - Be specific to this discussion; never invent positions unsupported by the data
   - Each must be materially different from every other output in this category

3. PROPOSED SOLUTIONS — concrete bridging or compromise ideas grounded in consensus and divisive vote data. Short facilitator-facing suggestions, NOT phrased as agree/disagree votable claims.

Respond ONLY with JSON:
{
  "unexploredTopics": ["topic 1", "topic 2", ...],
  "divisiveIssues": ["votable statement 1", "votable statement 2", ...],
  "proposedSolutions": ["bridging idea 1", "bridging idea 2", ...]
}"""

MOCK_TENSIONS = [
    "Switzerland should adopt a horizontal federal AI law rather than relying mainly on sector-specific rules.",
    "Mandatory AI transparency should apply to every consumer-facing system, not only high-risk use cases.",
    "Sensitive Swiss data must be processed only on infrastructure located in Switzerland.",
]

MOCK_RECOMMENDATIONS = {
    "unexploredTopics": [
        "How liability should be allocated when AI systems cause harm in regulated sectors.",
        "Whether open-source AI models should face the same transparency rules as commercial products.",
    ],
    "divisiveIssues": MOCK_TENSIONS,
    "proposedSolutions": [
        "Adopt a lightweight federal AI baseline focused on transparency, paired with sector-specific rules where risk is highest.",
        "Pilot federal rules in health and finance first, then evaluate expansion based on compliance burden.",
    ],
}

MOCK_COMMON_GROUND = {
    "generic": {
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
    "policy": {
        "status": "working_draft",
        "previousVersionId": None,
        "changeSummary": "Initial working draft from current argument votes.",
        "groupAnalysis": [
            {"group": "A", "title": "Federal coherence camp", "description": "Prioritizes federal coherence and EU-compatible guardrails, favoring horizontal rules for predictability."},
            {"group": "B", "title": "Innovation-first camp", "description": "Wants sector nuance and minimal burden on innovators, wary of one-size-fits-all obligations."},
        ],
        "groupStatement": "Working proposal: establish a lightweight federal AI baseline on transparency and accountability, layered with sector-specific rules where risk is highest, while protecting smaller firms from disproportionate burden.",
        "recommendations": [
            {
                "id": "r1",
                "text": "Pass a federal transparency-and-accountability baseline for high-risk AI systems.",
                "evidenceIds": ["arg-mock-1"],
                "preserved": False,
            },
            {
                "id": "r2",
                "text": "Add sector-specific rules for health and finance, informed by domain experts.",
                "evidenceIds": ["arg-mock-2"],
                "preserved": False,
            },
            {
                "id": "r3",
                "text": "Set proportionate SME exemptions or compliance pathways based on risk tier.",
                "evidenceIds": ["arg-mock-1", "arg-mock-3"],
                "preserved": False,
            },
        ],
        "essentialConditions": [
            {
                "id": "c1",
                "text": "Baseline obligations stay proportional to demonstrated risk.",
                "evidenceIds": ["arg-mock-1"],
                "preserved": False,
            },
            {
                "id": "c2",
                "text": "Sector rules must not recreate contradictory obligations across domains.",
                "evidenceIds": ["arg-mock-2"],
                "preserved": False,
            },
        ],
        "tradeoffs": [
            {
                "id": "t1",
                "text": "Horizontal predictability trades some sector flexibility.",
                "evidenceIds": ["arg-mock-2"],
            },
            {
                "id": "t2",
                "text": "EU alignment reduces friction for exporters but constrains Swiss-only paths.",
                "evidenceIds": ["arg-mock-3"],
            },
        ],
        "unresolvedQuestions": [
            {
                "id": "u1",
                "text": "Who audits high-risk systems and who pays for reviews?",
                "evidenceIds": ["arg-mock-1"],
            },
            {
                "id": "u2",
                "text": "Should training-data rules go beyond existing FADP requirements?",
                "evidenceIds": ["arg-mock-3"],
            },
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

    async def generate_recommendations(
        self,
        analysis: dict,
        divisive_count: int = 3,
        topic: Optional[str] = None,
        language: Optional[str] = None,
    ) -> Optional[dict]:
        divisive_count = max(1, min(5, int(divisive_count or 3)))
        if self._mock:
            existing = set(analysis.get("existingStatements") or [])
            existing |= set(analysis.get("existingTensions") or [])
            divisive = [t for t in MOCK_TENSIONS if t not in existing][:divisive_count]
            return {
                "unexploredTopics": list(MOCK_RECOMMENDATIONS["unexploredTopics"]),
                "divisiveIssues": divisive,
                "proposedSolutions": list(MOCK_RECOMMENDATIONS["proposedSolutions"]),
            }

        return await self._live_recommendations(analysis, divisive_count, topic, language)

    async def generate_common_ground(
        self,
        analysis: dict,
        topic: Optional[str] = None,
        language: Optional[str] = None,
        mode: str = DEFAULT_COMMON_GROUND_MODE,
    ) -> Optional[dict]:
        mode = normalize_common_ground_mode(mode)
        if self._mock:
            mock = {**MOCK_COMMON_GROUND[mode], "mode": mode}
            if mode == "policy":
                # Remap mock evidence IDs to real argument ids when available.
                valid = set(analysis.get("validArgumentIds") or [])
                if valid:
                    first = sorted(valid)[0]
                    for key in ("recommendations", "essentialConditions", "tradeoffs", "unresolvedQuestions"):
                        items = []
                        for item in mock.get(key) or []:
                            if isinstance(item, dict):
                                items.append({**item, "evidenceIds": [first]})
                            else:
                                items.append(item)
                        mock[key] = items
                return self._normalize_common_ground(mock, mode, analysis)
            return mock

        return await self._live_common_ground(analysis, topic, language, mode)

    def _normalize_group_analysis(self, data: dict) -> list:
        group_analysis = []
        for item in data.get("groupAnalysis") or []:
            if not isinstance(item, dict):
                continue
            group = (item.get("group") or "").strip()
            title = (item.get("title") or "").strip()
            description = (item.get("description") or "").strip()
            if group and description:
                group_analysis.append({"group": group, "title": title, "description": description})
        return group_analysis

    @staticmethod
    def _clean_str_list(values) -> list:
        return [s.strip() for s in (values or []) if isinstance(s, str) and s.strip()]

    def _normalize_cited_items(
        self,
        values,
        *,
        valid_ids: set[str],
        require_evidence: bool,
        id_prefix: str,
        fallback_ids: list[str] | None = None,
    ) -> Optional[list]:
        """Normalize list of {id, text, evidenceIds, ...} or legacy strings.

        Unknown evidence IDs are dropped (not fatal). When evidence is required and
        none remain, attach the first available argument fallback so a mostly-valid
        draft is not discarded for a single bad citation.
        """
        if not isinstance(values, list):
            return []
        fallback = [eid for eid in (fallback_ids or []) if eid in valid_ids]
        out = []
        for idx, raw in enumerate(values, start=1):
            if isinstance(raw, str):
                text = raw.strip()
                if not text:
                    continue
                evidence = list(fallback[:1]) if require_evidence and fallback else []
                if require_evidence and not evidence:
                    continue
                out.append({"id": f"{id_prefix}{idx}", "text": text, "evidenceIds": evidence})
                continue
            if not isinstance(raw, dict):
                continue
            text = (raw.get("text") or "").strip()
            if not text:
                continue
            item_id = (raw.get("id") or f"{id_prefix}{idx}").strip()
            evidence = []
            for eid in raw.get("evidenceIds") or []:
                if not isinstance(eid, str):
                    continue
                eid = eid.strip()
                if not eid or eid not in valid_ids:
                    continue
                if eid not in evidence:
                    evidence.append(eid)
            if require_evidence and not evidence:
                if fallback:
                    evidence = [fallback[0]]
                else:
                    continue
            item = {"id": item_id, "text": text, "evidenceIds": evidence}
            if "preserved" in raw:
                item["preserved"] = bool(raw.get("preserved"))
            out.append(item)
        return out

    @staticmethod
    def _remap_evidence_ids(items: list, id_map: dict[str, str]) -> list:
        if not id_map or not items:
            return items
        remapped = []
        for item in items:
            if not isinstance(item, dict):
                remapped.append(item)
                continue
            eids = []
            for eid in item.get("evidenceIds") or []:
                real = id_map.get(eid, eid)
                if real not in eids:
                    eids.append(real)
            remapped.append({**item, "evidenceIds": eids})
        return remapped

    def _normalize_common_ground(
        self,
        data: dict,
        mode: str,
        analysis: Optional[dict] = None,
    ) -> Optional[dict]:
        statement = (data.get("groupStatement") or "").strip()
        if not statement:
            return None
        group_analysis = self._normalize_group_analysis(data)
        mode = normalize_common_ground_mode(mode)
        analysis = analysis or {}

        if mode == "policy":
            valid_ids = set(analysis.get("validArgumentIds") or [])
            for prev in analysis.get("previousFeedback") or []:
                valid_ids.update(prev.get("validFeedbackIds") or [])
            # Also allow citing prior recommendation/condition/tradeoff/question ids.
            for prev in analysis.get("previousFeedback") or []:
                for key in ("recommendations", "essentialConditions", "tradeoffs", "unresolvedQuestions"):
                    for item in prev.get(key) or []:
                        if isinstance(item, dict) and item.get("id"):
                            valid_ids.add(str(item["id"]))

            fallback_ids = list(analysis.get("validArgumentIds") or [])
            recommendations = self._normalize_cited_items(
                data.get("recommendations"),
                valid_ids=valid_ids,
                require_evidence=True,
                id_prefix="r",
                fallback_ids=fallback_ids,
            )
            if recommendations is None or not recommendations:
                print("Policy CG normalize failed: no usable recommendations")
                return None
            conditions = self._normalize_cited_items(
                data.get("essentialConditions"),
                valid_ids=valid_ids,
                require_evidence=True,
                id_prefix="c",
                fallback_ids=fallback_ids,
            )
            if conditions is None:
                print("Policy CG normalize failed: essentialConditions invalid")
                return None
            tradeoffs = self._normalize_cited_items(
                data.get("tradeoffs"),
                valid_ids=valid_ids,
                require_evidence=False,
                id_prefix="t",
                fallback_ids=fallback_ids,
            )
            if tradeoffs is None:
                print("Policy CG normalize failed: tradeoffs invalid")
                return None
            unresolved = self._normalize_cited_items(
                data.get("unresolvedQuestions"),
                valid_ids=valid_ids,
                require_evidence=False,
                id_prefix="u",
                fallback_ids=fallback_ids,
            )
            if unresolved is None:
                print("Policy CG normalize failed: unresolvedQuestions invalid")
                return None

            prev_id = data.get("previousVersionId")
            if prev_id is not None:
                prev_id = str(prev_id).strip() or None
            known_prev = {p.get("versionId") for p in (analysis.get("previousFeedback") or [])}
            if prev_id and prev_id not in known_prev:
                # Prefer latest known previous version rather than inventing.
                prev_id = next(iter(reversed(list(known_prev))), None) if known_prev else None
            if not prev_id and known_prev:
                prev_id = list(known_prev)[-1]

            change_summary = (data.get("changeSummary") or "").strip()
            if not change_summary:
                change_summary = (
                    "Revised working draft based on latest argument votes and prior reactions."
                    if prev_id
                    else "Initial working draft from current argument votes."
                )

            id_map = analysis.get("argumentIdMap") or {}
            return {
                "mode": mode,
                "status": "working_draft",
                "previousVersionId": prev_id,
                "changeSummary": change_summary,
                "groupAnalysis": group_analysis,
                "groupStatement": statement,
                "recommendations": self._remap_evidence_ids(recommendations, id_map),
                "essentialConditions": self._remap_evidence_ids(conditions, id_map),
                "tradeoffs": self._remap_evidence_ids(tradeoffs, id_map),
                "unresolvedQuestions": self._remap_evidence_ids(unresolved, id_map),
            }

        result = {
            "mode": mode,
            "groupAnalysis": group_analysis,
            "groupStatement": statement,
            "commonGround": self._clean_str_list(data.get("commonGround")),
            "divides": self._clean_str_list(data.get("divides")),
            "bridgingProposal": (data.get("bridgingProposal") or "").strip(),
        }
        insights = self._clean_str_list(data.get("insights"))
        if insights:
            result["insights"] = insights
        tradeoffs = self._clean_str_list(data.get("tradeoffs"))
        if tradeoffs:
            result["tradeoffs"] = tradeoffs
        alternatives = self._clean_str_list(data.get("bridgingAlternatives"))
        if alternatives:
            result["bridgingAlternatives"] = alternatives
        group_notes = []
        for item in data.get("groupNotes") or []:
            if not isinstance(item, dict):
                continue
            group = (item.get("group") or "").strip()
            note = (item.get("note") or "").strip()
            if group and note:
                group_notes.append({"group": group, "note": note})
        if group_notes:
            result["groupNotes"] = group_notes
        return result

    def _normalize_recommendations(self, data: dict, divisive_count: int) -> Optional[dict]:
        unexplored = [
            s.strip() for s in (data.get("unexploredTopics") or [])
            if isinstance(s, str) and s.strip()
        ]
        proposed = [
            s.strip() for s in (data.get("proposedSolutions") or [])
            if isinstance(s, str) and s.strip()
        ]
        raw_divisive = data.get("divisiveIssues")
        if not isinstance(raw_divisive, list):
            raw_divisive = next(
                (v for k, v in data.items() if k != "unexploredTopics" and k != "proposedSolutions" and isinstance(v, list)),
                [],
            )
        divisive = [s.strip() for s in raw_divisive if isinstance(s, str) and s.strip()]
        if not divisive and not unexplored and not proposed:
            return None
        return {
            "unexploredTopics": unexplored[:6],
            "divisiveIssues": divisive[:divisive_count + 4],
            "proposedSolutions": proposed[:6],
        }

    async def _live_recommendations(
        self,
        analysis: dict,
        divisive_count: int,
        topic: Optional[str] = None,
        language: Optional[str] = None,
    ) -> Optional[dict]:
        request_count = divisive_count + 4
        parts = []
        parts.append(f"Session topic: {topic}" if topic else "Session topic: Not specified — infer from the data.")
        parts.append(
            f"\nDivisive issues requested: {divisive_count}. "
            f"Generate {request_count} distinct divisive-issue candidates, ordered strongest first. "
            f"Also provide 2-4 unexplored topics and 2-3 proposed solutions."
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
            parts.append("\nExisting statements — divisive issues must NOT restate or paraphrase any of these:")
            for s in existing:
                parts.append(f"- {s}")

        existing_tensions = analysis.get("existingTensions") or []
        if existing_tensions:
            parts.append("\nAlready-published tension statements — divisive issues must NOT restate or paraphrase these:")
            for s in existing_tensions:
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
            parts.append("\nStatements with broad agreement (for context — divisive issues should contrast with these):")
            for s in consensus:
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

        user_message = "\n".join(parts)
        dedupe_against = list(existing) + list(existing_tensions)

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
                        {"role": "system", "content": RECOMMENDATIONS_PROMPT + _language_rule(language)},
                        {"role": "user", "content": user_message},
                    ],
                ),
            )
            data = json.loads(response.choices[0].message.content)
            normalized = self._normalize_recommendations(data, divisive_count)
            if not normalized:
                return None

            filtered = _dedupe_tensions(normalized["divisiveIssues"], dedupe_against)
            if len(filtered) < divisive_count:
                existing_set = {s.strip().lower() for s in dedupe_against}
                seen = {t.lower() for t in filtered}
                for t in normalized["divisiveIssues"]:
                    if len(filtered) >= divisive_count:
                        break
                    key = t.lower()
                    if key in seen or key in existing_set:
                        continue
                    filtered.append(t)
                    seen.add(key)
            normalized["divisiveIssues"] = (filtered or normalized["divisiveIssues"])[:divisive_count]
            return normalized
        except (json.JSONDecodeError, KeyError, IndexError) as e:
            print(f"Recommendations parse error: {e}")
            return None
        except Exception as e:
            print(f"Recommendations generation error: {e}")
            return None

    def _policy_user_message(self, analysis: dict, topic: Optional[str]) -> str:
        parts = []
        parts.append(f"Session topic: {topic}" if topic else "Session topic: Not specified — infer from the data.")
        parts.append(
            f"\nRoster size: {analysis.get('rosterSize', 0)}; "
            f"voters with ballots: {analysis.get('voterCount', 0)}; "
            f"approved arguments: {analysis.get('statementCount', 0)}; "
            f"vote scale: {analysis.get('voteType', 'binary')}."
        )
        parts.append(
            "\nEVIDENCE PACK — cite only these argument IDs and fb* feedback IDs. "
            "Never use participant names or internal participant IDs."
        )
        parts.append("\nArguments (stable IDs):")
        for arg in analysis.get("arguments") or []:
            parts.append(
                f"- [{arg.get('id')}] \"{arg.get('text', '')}\" "
                f"support={arg.get('support', 0)}, neutral={arg.get('neutrality', 0)}, "
                f"oppose={arg.get('opposition', 0)}, missing={arg.get('missing', 0)}, "
                f"coverage={arg.get('coveragePct', 0)}%, supportRate={arg.get('supportRate', 0)}, "
                f"split={arg.get('split', 0)}"
            )

        groups = analysis.get("opinionGroups") or []
        if groups:
            parts.append("\nOpinion groups (anonymous, lettered):")
            for g in groups:
                parts.append(f"Group {g.get('group')} (size {g.get('size', 0)}):")
                for st in g.get("stances") or []:
                    if st.get("lean") == "mixed":
                        continue
                    parts.append(
                        f"  {st.get('lean')} on [{st.get('argumentId')}] "
                        f"(support={st.get('support', 0)}, oppose={st.get('opposition', 0)})"
                    )

        diffs = analysis.get("groupDifferences") or []
        if diffs:
            parts.append("\nCross-group differences (same argument, different leans):")
            for d in diffs:
                leans = ", ".join(
                    f"{x.get('group')}={x.get('lean')}" for x in (d.get("groupLeans") or [])
                )
                parts.append(f"- [{d.get('argumentId')}]: {leans}")

        co = analysis.get("coSupport") or []
        if co:
            parts.append(
                "\nCo-support between arguments (same respondents). "
                "Only combine arguments into one recommendation when safeToCombine is true:"
            )
            for pair in co[:40]:
                ids = pair.get("argumentIds") or []
                parts.append(
                    f"- {ids}: shared={pair.get('sharedRespondents')}, "
                    f"bothSupport={pair.get('bothSupport')}, conflict={pair.get('conflict')}, "
                    f"supportOverlap={pair.get('supportOverlap')}, "
                    f"conflictRate={pair.get('conflictRate')}, "
                    f"safeToCombine={pair.get('safeToCombine')}"
                )

        previous = analysis.get("previousFeedback") or []
        if previous:
            parts.append(
                "\nPrevious POLICY drafts and anonymous reactions. "
                "Preserve items voters marked agree unless new votes contradict. "
                "Revise parts challenged by disagree. Individual suggestions must not be "
                "described as collective agreement unless argument evidence supports them. "
                "Valid feedback IDs to cite: fb* listed below."
            )
            for idx, prev in enumerate(previous, start=1):
                votes = prev.get("votes") or {}
                parts.append(
                    f"\nVersion {idx} id={prev.get('versionId')} status={prev.get('status')}: "
                    f"\"{prev.get('groupStatement', '')}\" — "
                    f"{votes.get('agree', 0)} agree / {votes.get('disagree', 0)} disagree"
                )
                if prev.get("changeSummary"):
                    parts.append(f"  prior changeSummary: {prev['changeSummary']}")

                def _brief_items(label, items):
                    if not items:
                        return
                    parts.append(f"  {label}:")
                    for item in items:
                        if isinstance(item, dict):
                            eids = ",".join(item.get("evidenceIds") or [])
                            parts.append(
                                f"    [{item.get('id')}] {item.get('text', '')} "
                                f"(evidence: {eids or 'none'}; preserved={item.get('preserved', False)})"
                            )
                        else:
                            parts.append(f"    - {item}")

                _brief_items("recommendations", prev.get("recommendations"))
                _brief_items("essentialConditions", prev.get("essentialConditions"))
                _brief_items("tradeoffs", prev.get("tradeoffs"))
                _brief_items("unresolvedQuestions", prev.get("unresolvedQuestions"))
                for reaction in prev.get("feedback") or []:
                    line = f"  - [{reaction.get('id')}] vote={reaction.get('vote')}"
                    if reaction.get("reason"):
                        line += f" reason=\"{reaction['reason']}\""
                    parts.append(line)
            latest = previous[-1]
            parts.append(
                f"\nSet previousVersionId to \"{latest.get('versionId')}\". "
                "Include a changeSummary explaining what you revised and why."
            )
        else:
            parts.append(
                "\nNo previous policy draft. Set previousVersionId to null. "
                "changeSummary should note this is the initial working draft."
            )

        parts.append(
            f"\nValid argument IDs: {', '.join(analysis.get('validArgumentIds') or []) or '(none)'}"
        )
        parts.append("\nAnalysis mode requested: policy")
        return "\n".join(parts)

    def _generic_user_message(self, analysis: dict, topic: Optional[str], mode: str) -> str:
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
                prev_mode = normalize_common_ground_mode(
                    prev.get("mode") or prev.get("depth")
                )
                parts.append(
                    f"\nVersion {idx} ({prev_mode}): \"{prev.get('groupStatement', '')}\""
                    f" — {votes.get('agree', 0)} agree / {votes.get('disagree', 0)} disagree"
                )
                for reaction in prev.get("feedback") or []:
                    # Generic mode may still include names from legacy collector; policy uses anonymous only.
                    label = reaction.get("id") or reaction.get("name") or "Participant"
                    line = f"  - {label} {reaction.get('vote', '')}"
                    if reaction.get("reason"):
                        line += f": \"{reaction['reason']}\""
                    parts.append(line)

        parts.append(f"\nAnalysis mode requested: {mode}")
        return "\n".join(parts)

    async def _live_common_ground(
        self,
        analysis: dict,
        topic: Optional[str] = None,
        language: Optional[str] = None,
        mode: str = DEFAULT_COMMON_GROUND_MODE,
    ) -> Optional[dict]:
        mode = normalize_common_ground_mode(mode)
        if mode == "policy":
            user_message = self._policy_user_message(analysis, topic)
        else:
            user_message = self._generic_user_message(analysis, topic, mode)
        prompt = COMMON_GROUND_PROMPTS.get(mode, COMMON_GROUND_PROMPTS[DEFAULT_COMMON_GROUND_MODE])
        temperature = {"generic": 0.45, "policy": 0.5}.get(mode, 0.45)

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
            return self._normalize_common_ground(data, mode, analysis)
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
