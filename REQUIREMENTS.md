# Debate Sense Requirements

## Product Definition

Debate Sense is a real-time deliberation assistant.

It helps a group have a spoken discussion while turning the discussion into structured, visible, voteable, and auditable argument cards. The AI should not speak for the group. It should help the group see what it is saying.

For the Stage 2 workshop use case, Debate Sense is a workshop companion app plus facilitator/operator dashboard for AI-supported spoken deliberation.

It is not an app-only deliberation product. Participants speak aloud in the physical workshop room. The system acts as an AI Reflector: it captures spoken arguments, turns them into short neutral validation statements, lets participants validate, micro-vote, and refine those statements, maps agreement and disagreement, and returns provisional summaries or solution statements for human review.

The target product pipeline is:

```text
physical workshop discussion
-> transcript
-> AI suggested validation statement
-> facilitator/operator review
-> participant validation and micro-voting
-> live deliberation map
-> provisional summary or policy-package draft
-> final human validation
-> auditable research export
```

## Stage 2 Workshop Scope

The target build has three coordinated parts:

1. Participant mobile workshop screen.
2. Facilitator/operator dashboard.
3. Backend AI/reflection pipeline.

The product should support physical Zurich and Lausanne workshops where spoken discussion remains the primary deliberation mode and the app helps the room see, validate, and refine its own emerging reasoning.

## Reusable Platform Direction

The realistic platform is not a generic deliberation product from day one. It is a reusable live-workshop reflection platform with Stage 2 configured as the first concrete protocol.

The core platform should provide reusable building blocks:

- Workshop/session setup.
- Module lifecycle control.
- Participant check-in.
- Role and permission management.
- Audio/transcript capture.
- AI-generated candidate statements.
- Facilitator review and approval.
- Participant validation tasks.
- Group or cohort targeting.
- Reaction and micro-vote capture.
- Live synthesis.
- Audit logging.
- Research export.

The Stage 2 workshop should then be a configuration on top of those primitives:

- sites: Zurich and Lausanne.
- methods and topic-method pairings.
- Stage 2 consent fields.
- Stage 1 opinion-cluster references.
- validation statement wording.
- final policy-package task.
- DRI/workshop-analysis export.

### Platform Primitives

#### Workshop

A workshop is the top-level event container.

Reusable fields:

- `id`
- `name`
- `site`
- `date`
- `status`
- `default_language`
- `consent_schema`
- `created_at`
- `created_by`

Stage 2 configuration:

- `site` values include Zurich and Lausanne.
- consent schema includes Stage 2 recording/transcription consent.

#### Module

A module is a timed phase inside a workshop.

Reusable fields:

- `id`
- `workshop_id`
- `name`
- `topic`
- `method`
- `group_id`
- `state`: `setup`, `active`, `validation`, `summary_review`, `complete`
- `started_at`
- `ended_at`

Stage 2 configuration:

- modules encode the counterbalanced topic-method pairings.

#### Participant

A participant is a checked-in workshop attendee.

Reusable fields:

- `id`
- `workshop_id`
- `display_code`
- `group_id`
- `assignment`
- `consents`
- `checked_in_at`

Stage 2 configuration:

- assignment stores the participant's topic-method pairing.
- consents include Stage 2 recording/transcription consent.

#### Transcript Source

A transcript source describes where spoken input comes from.

Reusable source types:

- `central_room_audio`
- `manual_entry`
- `browser_host_microphone`
- `uploaded_audio`

Stage 2 configuration:

- primary source should be `central_room_audio`.
- browser-host microphone is only a prototype fallback.
- Gladia can be implemented as one transcription provider adapter.

#### Statement Candidate

A statement candidate is a short neutral representation of something said in the room.

Reusable lifecycle:

- `generated`
- `edited`
- `approved`
- `pushed`
- `rejected`
- `merged`
- `archived`

Reusable fields:

- `id`
- `module_id`
- `text`
- `source_type`
- `source_transcript_ids`
- `created_from`
- `status`
- `target_group_id`
- `created_by`
- `approved_by`
- `edit_history`

Stage 2 configuration:

- candidate text should be phrased as validation statements.

#### Participant Task

A participant task is something pushed to phones.

Reusable task types:

- `statement_validation`
- `micro_vote`
- `revision_request`
- `summary_validation`
- `final_validation`

Reusable fields:

- `id`
- `module_id`
- `target_group_id`
- `task_type`
- `payload`
- `state`
- `opened_at`
- `closed_at`

Stage 2 configuration:

- final validation asks whether the summary represents the main points and whether participants are comfortable treating it as a study result.

#### Reaction

A reaction records a participant response to a task or statement.

Reusable fields:

- `id`
- `participant_id`
- `task_id`
- `statement_id`
- `response_type`
- `response_value`
- `revision_text`
- `created_at`

Stage 2 configuration:

- response values include accept, reject, revise, pass/unsure, important, needs more discussion, changed mind, and misrepresents.

#### Synthesis

A synthesis is a facilitator-visible interpretation of validated statements and reactions.

Reusable synthesis types:

- `common_ground`
- `disagreement`
- `important_concerns`
- `open_questions`
- `summary_draft`
- `recommendation_package`

Stage 2 configuration:

- recommendation package contains 2-3 recommendations, justification, and remaining disagreement.

#### Audit Event

An audit event is the durable log of what happened.

Reusable event examples:

- participant checked in.
- consent recorded.
- module started.
- transcript snippet received.
- candidate generated.
- candidate edited.
- candidate approved.
- task pushed.
- reaction submitted.
- summary drafted.
- export generated.

This should be a core platform primitive, not a reporting afterthought.

### Reusable Services

The platform should be built around adapter-style services:

- transcription provider adapter: Gladia, OpenAI, manual, uploaded audio.
- statement-generation prompt template.
- task routing service.
- reaction aggregation service.
- synthesis service.
- export service.

This keeps the core app reusable even if the first real deployment uses one provider, one workshop protocol, and one export format.

### What Should Stay Configurable

These should not be hardcoded into core logic:

- Zurich and Lausanne.
- Stage 2 naming.
- DRI export labels.
- consent question text.
- final validation question text.
- policy-package wording.
- available reaction buttons.
- topic-method pairing rules.
- transcription provider.

They can be defaults or configuration values for the Stage 2 deployment.

### What Should Not Be Generalized Yet

Avoid building a broad platform before the Stage 2 workflow works.

Do not generalize yet:

- complex authentication.
- arbitrary workflow builders.
- many simultaneous transcription providers.
- fully configurable dashboards.
- automated policy recommendation logic.
- personalised participant routing.
- production-grade multi-tenant administration.

The pragmatic platform MVP is:

```text
configurable workshop
-> module
-> transcript source
-> statement candidate
-> facilitator approval
-> participant task
-> reaction
-> synthesis
-> audit export
```

### Participant Mobile Workshop Screen

Participants need a simple workshop companion screen, not a full deliberation app.

Required capabilities:

- Check in to an active workshop module.
- Show current site, topic, method, and workshop state.
- Receive short validation statements extracted from the spoken discussion.
- Accept, reject, revise, or micro-vote on validation statements.
- Provide lightweight signals when a statement misses or distorts the point.
- See provisional summaries or policy-package drafts pushed by the facilitator.
- Answer final validation questions:
  - Does this represent the main points?
  - Are you comfortable treating this as a study result?

### Facilitator And Operator Dashboard

The facilitator/operator dashboard controls the workshop flow and public participant tasks.

Required capabilities:

- Create Zurich and Lausanne workshop sessions.
- Configure site, topic, method, module, group, and timing.
- Assign participants to counterbalanced topic-method pairings.
- Track who has Stage 2 recording/transcription consent.
- Start and stop workshop modules.
- View live or near-live transcript snippets.
- Add manually entered arguments when transcription misses something important.
- Review AI-generated statement candidates before they go to participants.
- Approve, edit, reject, merge, or archive statement candidates.
- Push validation or micro-voting tasks to the correct group.
- Monitor participant responses in real time.
- Compile the final policy package:
  - 2-3 recommendations.
  - justification.
  - remaining disagreement.

### Backend AI And Reflection Pipeline

The backend should support the research workflow, not only live UI updates.

Required capabilities:

- Use Stage 1 opinion clusters where available.
- Use Stage 2 validation and micro-voting data.
- Integrate central-room audio transcription.
- Prefer central-room audio sources over participant phone microphones.
- Support Gladia or another external transcription provider if selected.
- Convert spoken arguments into short neutral validation statements.
- Run aggregation, PCA, clustering, or related analysis where needed.
- Preserve substantive disagreement rather than smoothing it away.
- Log every generated statement, edit, vote, validation result, and facilitator decision.
- Export clean research data for DRI and workshop analysis.

### Negative Definition

The system should not be:

- A chatbot moderator.
- An autonomous recommendation engine.
- A personalised persuasion system.
- A purely app-based discussion module.
- A system that deliberates on behalf of participants.
- A system that makes final decisions.
- A system that optimises hidden criteria.
- A system that ranks viewpoints as better or worse.
- A replacement for participant judgement.

The system should be a live deliberation control system for physical workshops where people talk in the room and the app helps the room see, validate, and refine its own emerging reasoning.

## Current App Summary

The current app is a working speech-to-statement voting prototype.

It already supports a live session, host-only browser audio capture, transcription, AI claim extraction, participant voting, and basic live results. It does not yet include Stage 2 workshop setup, facilitator/operator control, central-room transcription integration, Stage 1 cluster integration, rich validation tasks, persistence, export, or final policy-package compilation.

## Already Built

### Session Joining

- Users can create a session with a short session code.
- Users can join an existing session by code.
- Users enter a display name.
- Users can optionally select a language preference.
- Sessions are currently stored in memory.

### Audio And Transcription

- The session creator becomes the host recorder.
- Only the host browser opens the microphone.
- Non-host participants do not stream audio.
- The backend rejects recording controls and audio frames from non-host participants.
- Host audio is streamed to the backend over WebSocket.
- Realtime captions are generated through OpenAI realtime transcription.
- Completed speech audio is sent through a final transcription pass before being added to the transcript.
- Low-information filler and some generic hallucination patterns are filtered.
- Same-speaker transcript chunks can be merged for continuity.

Stage 2 gap:

- The current implementation uses a host browser microphone.
- The target Stage 2 workflow should use central-room audio transcription, likely through Gladia or another provider, rather than participant phone microphones.

### AI Statement Extraction

- The backend extracts votable statements from completed transcript turns.
- The prompt asks for clear standalone claims.
- Duplicate existing statements are avoided.
- Mock statement extraction is available when no OpenAI API key is configured.

### Participant Voting

- Approved/public statements are shown to participants automatically.
- Participants can vote `agree` or `disagree`.
- Each participant can vote once per statement.
- Vote counts are broadcast live.
- Participants can see their voted statements and aggregate results.

Stage 2 gap:

- Participants cannot yet accept, reject, revise, or micro-vote on validation statements.
- Participants cannot yet validate provisional summaries or policy-package drafts.
- The final validation questions are not implemented.

### Voting Rounds

- Statements are grouped into rounds.
- The current threshold is 5 statements per round.
- When the threshold is reached, the app switches participants to the statements/voting view.
- Earlier statements remain visible and votable.

### Basic UI

- Join/create session screen.
- Debate room screen.
- Transcript panel.
- Statement voting panel.
- Results visualization with agree/disagree distribution.
- Basic recording state notifications.

### Developer Support

- `start.sh` installs dependencies and runs backend/frontend servers.
- `.env.example` documents OpenAI and transcription settings.
- README explains the current app behavior.
- Mock API endpoint allows testing without an API key.

## Partially Built

### Roles

Current state:

- The app distinguishes host recorder vs non-host participant.

Target requirement:

- Participant.
- Facilitator.
- Operator.
- Big-screen audience view.
- Researcher or organiser export/review role.

Gap:

- The host is currently a microphone owner, not a facilitator.
- There is no role-based permission model.
- There is no facilitator dashboard.
- There is no operator workflow for configuring workshop modules, counterbalanced assignments, or consent tracking.

### Argument Cards

Current state:

- AI-generated statements are published directly to participants.
- A statement contains text, id, round, and votes.

Target requirement:

- AI should create suggested argument cards.
- A facilitator reviews, edits, merges, rejects, or approves cards.
- Public cards should be linked to transcript evidence.
- Cards should have type, confidence, source time range, status, and history.

Gap:

- No pending review queue.
- No approval workflow.
- No edit/merge/reject actions.
- No source transcript segment on statement cards.
- No confidence score or card type.

### Participant Reactions

Current state:

- Participants can vote agree or disagree.

Target requirement:

- Agree.
- Disagree.
- Unsure.
- Important point.
- Needs more discussion.
- This changed my mind.
- This misrepresents what was said.
- Optional comments.

Gap:

- Voting model only supports a single binary vote.
- There are no flags, comments, or multi-dimensional reactions.
- There is no handling for misrepresentation challenges.

### Live Synthesis

Current state:

- The app shows vote counts and a simple diverging bar chart.

Target requirement:

- Common ground.
- Divisive issues.
- Important concerns.
- Open questions.
- Themes.
- Repeated concerns.
- Arguments that changed people's minds.

Gap:

- No theme grouping.
- No common-ground/disagreement/important-concern classification.
- No open-question detection.
- No synthesis view for facilitator or big screen.

### Session Setup

Current state:

- Organiser can create a session with an optional topic.

Target requirement:

- Topic.
- Site: Zurich or Lausanne.
- Language.
- Method.
- Module.
- Consent rules.
- Stage 2 recording/transcription consent.
- Whether audio is recorded.
- Whether quotes can be used.
- Group structure.
- Counterbalanced topic-method pairings.
- Voting options.
- QR code for participants.

Gap:

- Only topic is implemented.
- No consent workflow.
- No configurable voting options.
- No group metadata.
- No site, method, module, or assignment model.
- No QR code generation.

### Research Workflow

Current state:

- The app does not model Stage 1 or Stage 2 research data.

Target requirement:

- Stage 1 opinion clusters can inform Stage 2 reflection.
- Stage 2 validation data is captured for analysis.
- Clean data can be exported for DRI and workshop analysis.

Gap:

- No Stage 1 cluster import.
- No Stage 2 validation schema.
- No workshop-analysis export format.
- No PCA, clustering, or aggregation pipeline.
- No explicit disagreement-preservation logic.

### Reporting And Export

Current state:

- Transcript, statements, and votes exist only in memory during the running session.

Target requirement:

- Final report.
- Transcript export.
- Argument-card export.
- Vote-data export.
- Comment export.
- Moderator-decision export.
- Timeline export.

Gap:

- No persistence.
- No final report generation.
- No export endpoints.
- No audit timeline.

## Polis-Inspired Requirements

Polis is useful inspiration for the analysis layer, not a replacement for the product direction.

Debate Sense should remain speech-first, facilitator-mediated, and report-oriented. The useful Polis patterns are:

- Short standalone cards.
- Simple agree/disagree/pass reactions.
- No reply threads on cards.
- Moderation before public visibility.
- Opinion groups based on voting patterns.
- Consensus cards that are supported across groups.
- Representative cards that explain how groups differ.
- Data export based on comments/cards, votes, groups, and history.

### What To Borrow From Polis

#### Pass Or Unsure As A First-Class Reaction

Current state:

- The app supports only `agree` and `disagree`.

Polis-inspired requirement:

- Add `pass` or `unsure` as a primary response.
- Treat pass/unsure as meaningful data, not as a missing vote.

Why it matters:

- Participants often need a low-friction way to say a card is unclear, irrelevant, or not something they can judge.

What is needed:

- Extend reaction storage from binary votes to `agree`, `disagree`, and `pass`.
- Track which cards a participant has seen even if they pass.
- Show pass/unsure rates in facilitator and big-screen summaries.

#### Opinion Matrix

Current state:

- The app stores per-statement votes, but does not build a participant-by-card matrix.

Polis-inspired requirement:

- Store a matrix of participant reactions across approved cards.
- Use the matrix to understand alignment and disagreement patterns.

What is needed:

- Persist every participant-card reaction.
- Store `seen_at`, `reacted_at`, and reaction value.
- Keep enough missing/seen/pass distinction to avoid misleading analysis.
- Add a derived analysis object for each session.

#### Opinion Groups

Current state:

- The app has no group discovery.

Polis-inspired requirement:

- Cluster participants by similar reaction patterns.
- Use these groups to explain where the room agrees and divides.

What is needed:

- A minimum reaction count before grouping is shown.
- A grouping algorithm using the reaction matrix.
- A stable group label such as `Group A`, `Group B`, `Group C`.
- Per-group card statistics.
- A facilitator-facing explanation that groups are based on voting patterns, not identity.

Initial simple implementation:

- Start with a lightweight local analysis:
  - encode agree as `1`, disagree as `-1`, pass/unsure as `0`
  - compare participants by cosine similarity on cards both have seen
  - cluster participants into 2-4 groups when enough data exists
  - recalculate after each voting batch

#### Common Ground Across Groups

Current state:

- The app can show total agree/disagree counts.

Polis-inspired requirement:

- Identify cards that all or most opinion groups support.

What is needed:

- Per-group agreement rates.
- A consensus score that rewards cross-group agreement, not only raw majority.
- A common-ground section in the facilitator dashboard and big-screen view.

Example rule for first version:

- Mark a card as common ground if every sufficiently large group has at least 60% agreement and the overall pass rate is not too high.

#### Divisive And Representative Cards

Current state:

- The app does not distinguish broad disagreement from group-specific disagreement.

Polis-inspired requirement:

- Identify cards that divide the room.
- Identify cards that represent why one opinion group differs from another.

What is needed:

- Group-level agree/disagree/pass rates per card.
- A divisiveness score based on the gap between groups.
- A representative-card score based on strong within-group agreement and strong outside-group disagreement.
- UI sections for `Divisive issues` and `What each group emphasizes`.

#### Card Routing

Current state:

- Participants see all unvoted statements.

Polis-inspired requirement:

- Route cards intentionally so participants are not overwhelmed and each card gets enough reactions.

What is needed:

- Track which cards each participant has seen.
- Prioritize cards with too few reactions.
- Prioritize cards useful for group discovery.
- Avoid showing too many similar cards.
- Let the facilitator pin a card as the current room focus.

Initial simple implementation:

- Show one focused card at a time on participant phones.
- Prefer approved cards with the fewest completed reactions.
- After a participant reacts, show the next most useful card.
- Keep an `All cards` view secondary.

#### Seed Cards

Current state:

- Statements only come from transcript/AI extraction or mock data.

Polis-inspired requirement:

- Allow facilitators to create seed cards before or during a session.

What is needed:

- A facilitator-only create-card action.
- Seed cards should be marked as facilitator-created, not AI-suggested.
- Seed cards should still be public only after explicit approval.
- Seed cards should be included in the same reaction and analysis pipeline.

#### Strict Moderation And Duplicate Control

Current state:

- AI attempts to avoid duplicate statements, but there is no human duplicate workflow.

Polis-inspired requirement:

- Keep the card set small, clean, and representative.

What is needed:

- Merge duplicate or near-duplicate suggested cards.
- Reject weak, repetitive, off-topic, or overly broad cards.
- Prefer the best formulation of each point.
- Add facilitator tools for search, merge, and archive.

#### Exportable Analysis

Current state:

- There is no persistent export.

Polis-inspired requirement:

- Export the deliberation data in a format that supports deeper analysis.

What is needed:

- Export participant-card reactions.
- Export cards with source transcript links.
- Export group assignments.
- Export per-card summary statistics.
- Export analysis history over time.
- Export moderator decisions and card edit history.

### What Not To Copy Directly

- Do not make the product primarily text-submission based. Debate Sense should stay speech-first.
- Do not let participant-submitted cards bypass facilitator review.
- Do not add open reply threads under cards in the first version.
- Do not optimize only for massive asynchronous participation; the first target is still a live room.
- Do not remove transcript evidence. Polis-style opinion grouping should sit on top of the auditable speech record.

## Still To Build

### Priority 0: Stage 2 Workshop Control Model

Required changes:

- Add workshop session fields for site, topic, method, module, and group.
- Support configurable site values, with Zurich and Lausanne as the first configured sites.
- Add counterbalanced topic-method assignment storage.
- Add participant check-in state.
- Track Stage 2 recording/transcription consent separately from ordinary app participation.
- Add module lifecycle states such as `setup`, `active`, `validation`, `summary_review`, and `complete`.
- Separate host recorder, facilitator, operator, participant, and researcher roles.

Expected result:

- The app becomes a reusable workshop control system, with Stage 2 as the first configured protocol.

### Priority 1: Facilitator Review Workflow

Required changes:

- Store AI outputs as pending suggested cards instead of immediate public statements.
- Add facilitator role.
- Add facilitator dashboard.
- Add approve, edit, reject, and merge actions.
- Only show approved cards to participants.
- Track moderator decisions.
- Link each card to the transcript entry or time range that produced it.

Expected result:

- The AI proposes cards, but the facilitator controls what becomes public.

### Priority 2: Rich Validation Statement Model

Required fields:

- `id`
- `session_id`
- `text`
- `status`: `suggested`, `approved`, `rejected`, `merged`, `archived`
- `type`: for example `claim`, `proposal`, `concern`, `question`
- `theme`
- `source_transcript_ids`
- `source_start_time`
- `source_end_time`
- `confidence`
- `created_at`
- `approved_at`
- `approved_by`
- `original_ai_text`
- `current_text`
- `edit_history`
- `created_from`: `transcript`, `manual`, `stage_1_cluster`, or `facilitator_seed`
- `target_group`
- `pushed_at`
- `validation_state`

Expected result:

- Every public card is reviewable, editable, contestable, and auditable.

### Priority 3: Participant Validation And Micro-Voting

Required changes:

- Replace binary vote storage with reaction storage.
- Support multiple reaction dimensions per card.
- Add `accept`, `reject`, and `revise` actions for validation statements.
- Add `pass` or `unsure` as a primary response.
- Add `important`, `needs_more_discussion`, `changed_mind`, and `misrepresents` as secondary reactions.
- Add optional participant comments.
- Add participant revision suggestions.
- Decide which reactions are mutually exclusive and which are additive.
- Track which cards each participant has seen.
- Add final validation questions:
  - Does this represent the main points?
  - Are you comfortable treating this as a study result?

Expected result:

- The app captures agreement, disagreement, uncertainty, importance, concern, legitimacy issues, and final research validation.

### Priority 4: Backend AI Reflection Pipeline

Required changes:

- Add central-room transcription integration.
- Support Gladia or another provider as a transcription adapter.
- Keep browser-host transcription as a prototype fallback only.
- Convert spoken arguments into short neutral validation statements.
- Import or reference Stage 1 opinion clusters.
- Combine Stage 1 clusters with Stage 2 validation data where appropriate.
- Preserve substantive disagreement in candidate generation and summaries.
- Avoid autonomous recommendations or hidden optimisation.

Expected result:

- The AI acts as a reflector that structures workshop reasoning for human validation.

### Priority 5: Live Deliberation Map

Required changes:

- Build a participant-by-card reaction matrix.
- Detect opinion groups from reaction patterns.
- Group approved cards into themes.
- Identify common ground from cross-group agreement.
- Identify disagreement from split votes and group-level disagreement.
- Identify important concerns from high importance, uncertainty, or unresolved disagreement.
- Identify representative cards for each opinion group.
- Identify open questions and cards needing more discussion.
- Show a facilitator synthesis view.
- Show a calm big-screen overview.

Expected result:

- The room sees the structure of the discussion while the conversation continues.

### Priority 6: Session Setup And Consent

Required changes:

- Add organiser setup fields for site, topic, method, module, language, consent rules, audio recording, quote permissions, group structure, and voting options.
- Store consent schemas as configuration so Stage 2 consent can be changed without rewriting core logic.
- Show consent information before participants join.
- Store participant Stage 2 recording/transcription consent state.
- Store quote-use consent state.
- Store participant assignment state.
- Generate a QR code for joining.

Expected result:

- Sessions can be configured for real deliberation/research contexts without hardcoding one study protocol.

### Priority 7: Persistence And Audit Trail

Required changes:

- Add database-backed storage.
- Persist workshops, modules, assignments, consent records, transcript entries, suggested cards, approved cards, reactions, comments, facilitator decisions, and timeline events.
- Record all facilitator actions.
- Record every generated statement, edit, push, vote, validation response, revision, and summary decision.
- Preserve source links from card to transcript.

Expected result:

- Sessions survive restart and can be audited after the event.

### Priority 8: Policy Package And Exports

Required changes:

- Generate draft final report from approved cards, transcript sources, vote distributions, comments, and moderator decisions.
- Compile a final policy package with 2-3 recommendations, justification, and remaining disagreement.
- Support facilitator edits to the policy package before participant final validation.
- Push provisional summaries or policy-package drafts to participants.
- Include opinion groups, common-ground cards, divisive cards, and representative cards in the report.
- Export transcript.
- Export argument cards.
- Export vote data.
- Export participant-card reaction matrix.
- Export opinion group assignments.
- Export Stage 1 cluster references.
- Export Stage 2 validation results.
- Export comments.
- Export moderator decisions.
- Export full timeline.
- Export clean research data for DRI and workshop analysis.

Expected result:

- The final report is not just an AI summary. It is backed by evidence from the session.

## Suggested Milestones

### Milestone 1: Stage 2 Workshop Shell

- Add workshop creation with Zurich/Lausanne as configured site options.
- Add site, topic, method, module, and group fields.
- Add participant check-in.
- Add Stage 2 consent tracking.
- Add role separation for facilitator, operator, participant, and researcher.
- Add module start/stop controls.

### Milestone 2: Controlled Validation Statements

- Add facilitator role.
- Add pending suggested-card queue.
- Add approve/edit/reject actions.
- Show only approved cards to participants.
- Add source transcript links.
- Add manual argument entry.
- Add target-group routing.

This is the most important product correction because it enforces the principle that AI does not speak for the group.

### Milestone 3: Participant Validation Screen

- Add accept/reject/revise actions.
- Add pass/unsure and importance reactions.
- Add needs-more-discussion reaction.
- Add misrepresentation flag.
- Add optional comments.
- Add final validation questions.
- Track card exposure.
- Update results display.

### Milestone 4: Central-Room Reflection Pipeline

- Add transcription provider abstraction.
- Add Gladia integration if selected.
- Keep current browser-host transcription as fallback.
- Convert transcript snippets into short neutral validation statements.
- Add Stage 1 cluster import/reference fields.
- Add disagreement-preservation checks.

### Milestone 5: Big Screen And Synthesis

- Add participant-by-card reaction matrix.
- Add simple opinion-group detection.
- Add big-screen route.
- Add common-ground section.
- Add divisive-issues section.
- Add representative-cards section.
- Add important-concerns section.
- Add open-questions section.

### Milestone 6: Persistence And Research Export

- Add database.
- Add audit timeline.
- Add export endpoints.
- Add DRI/workshop-analysis export.

### Milestone 7: Policy Package Compilation

- Add provisional summary draft.
- Add policy-package builder.
- Support 2-3 recommendations, justification, and remaining disagreement.
- Push provisional summaries to participants for validation.
- Export final validation results.

### Milestone 8: Polis-Style Card Routing

- Show one focused card at a time on participant phones.
- Prioritize cards with low reaction counts.
- Let facilitators pin a card as the current room focus.
- Keep all approved cards available in a secondary view.
- Add seed-card creation for facilitators.

## Non-Goals For The Next Iteration

- Full authentication system.
- Complex user accounts.
- Production-grade access control.
- Perfect speaker diarization.
- Fully automated final reporting without human review.
- Chatbot moderation.
- Autonomous recommendations.
- Personalised persuasion.
- App-only discussion replacing spoken workshop deliberation.
- Hidden optimisation or automatic ranking of viewpoints.
- Any workflow where the system makes final decisions on behalf of participants.

## Design Principle

Every public argument card should be:

- Reviewable.
- Editable.
- Contestable.
- Linked to transcript evidence.
- Clearly marked as a summary, not a direct quote unless it is actually a quote.

## External References

- Polis best practices: https://pol-is.github.io/polis-documentation/usage/BestPractices.html
