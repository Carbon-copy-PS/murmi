# Report generation and release review

## Working agreement

Changes are prepared locally, tested, and shown for review. Pushing commits, updating
murmi.org, changing production report data, and restarting production services each
require explicit approval for the reviewed release. Earlier deployment approval is
not standing approval for later changes. CI validates changes; it does not deploy.
`deploy.sh` bootstraps a host and replaces dependencies/services. It is not a local
preview or routine release command and must not be run as a validation step.

Use the host's Generate → Preview → Publish workflow for actual reports. Generation
saves a draft; publication is a separate host action. Do not use direct production
snapshot edits as the normal way to improve report quality.

## Contract for new reports

`backend/app/report_contract.py` versions the presentation and narrative separately
from numerical analysis. New snapshots carry `presentationVersion` and
`narrativeVersion`; group themes have their own version in `opinion_themes.py`.
Change these versions when changing their respective generation contracts.

The current format contains:

- The saved AI common-ground package directly after the opening, when the session
  has one. It retains recorded endorsement/reaction counts and unresolved concerns;
  report findings do not replace this deliberation outcome. A standalone card uses
  “Approved as final” only for a saved endorsed version with endorsement data;
  other versions say “Draft · not yet approved”. Approval is not unanimity: reaction
  and participation counts stay visible. A separate discussion-analysis heading
  introduces the map and findings below the card.
- An overview and up to four distinct findings. Shared principles and useful paired
  comparisons belong in findings, not separate sections.
- An opinion map with visible themes and spread dots. Individual dots are not selectable;
  group labels in the map open profiles, without a duplicate row of group controls.
  Visible group profiles precede
  the strongest adequately answered group comparisons. Profiles describe actual
  support, reservations, or opposition; they do not label people's identities.
- Response coverage, retained as a full section at the very bottom, after statements
  and methodology, to separate participation context from findings.
- Unresolved questions that explain what still needs clarification.
- Up to three concrete next steps, combining action areas and implications.
- Every statement, visible below next steps, with support, neutral, disagreement, and
  unanswered counts. More than half of respondents is a majority; a neutral
  plurality is not automatically uncertainty. Missing is never a neutral vote.
- Expandable methodology and limitations.

Previously saved reports remain readable. New-format rendering suppresses obsolete
principle, action-area, and overlap sections even if an unexpected provider response
contains them. It retains complete statements and coverage if AI output is absent.

## Sources of consistency

`backend/app/model_routing.py` centrally versions model selection and request settings.
The `mixed-deliberation-v1` configuration uses GPT-5.6 Luna for statement extraction
and group descriptions, and GPT-6 Astra for both common-ground modes and report prose.
All four roles use low reasoning effort and an 8,000-token completion cap. The pinned
OpenAI SDK sends reasoning effort and `store: false` through `extra_body`; SDK wire
tests verify those become top-level API fields. Client deadlines are 20 seconds for
extraction/themes, 60 for common ground and 40 for report prose, within existing outer
deadlines. API retries are disabled; failures do not silently switch to a cheaper model.
The separate discussion-recommendation and audio-transcription paths are unchanged.

New common-ground, theme and report outputs record their requested/returned model
and routing version. Theme-cache keys include the routing version. Saved proposals
and approval records are preserved; generating a report does not regenerate or
approve common ground. Prompt and presentation contracts are unchanged by this
model-only configuration change. These settings require the same local review and
release approval as other code changes.

The report captures one frozen vote snapshot before asynchronous analysis. Counts,
response denominators, group geometry, and paired support come from code, not prose.
The narrative receives aggregate evidence, including computed paired support;
separate statement totals do not establish what the same people supported.

The versioned prompt gives each section one job and sets short text limits. The
normalizer caps section sizes, rejects overlong or malformed items, rejects claims
with unknown citations, and removes exact duplicate titles in the current format.
Theme descriptions permit up to four references so a profile can describe support
and a meaningful contrast together. Theme-cache keys include the theme version.

Model prose is not guaranteed to be identical across regenerations, even at zero
temperature. A valid citation ID does not prove the claim is true; automated checks
cannot establish every claim's meaning or detect every paraphrased repetition.
Before publication, a reviewer must verify numbers, qualifications, group descriptions,
paired denominators, and the distinction between findings and proposed actions.
The offline fixture tests structure and evidence plumbing, not live model quality.

## Local validation

Prerequisites: Python 3.11+ (CI uses 3.12), Node 20+, and installed dependencies.
From the repository root:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
npm ci --prefix frontend
scripts/check-reports.sh
.venv/bin/python -m backend.tools.preview_report
```

The preview listens only at `http://127.0.0.1:8780/r/local-preview`. It uses synthetic
people and fixed model-response substitutes through real aggregate analysis,
normalization, and rendering. It does not import production sessions, contact an AI
provider, connect to a database, or publish anything. The output JSON remains a draft;
the local display adapter only enables the report view in the existing public-page
component. `--write-only` writes the fixture without starting a server.

To exercise the actual SDK and mixed routing with billable synthetic calls, use a
Git-ignored key file and a fresh output directory (existing results are preserved):

```sh
.venv/bin/python -m backend.tools.smoke_mixed_models --key-file .env.model-experiments
.venv/bin/python -m backend.tools.preview_report --snapshot outputs/mixed-model-smoke/traffic-report.json --port 8785
```

This checks three discussions (English and Chinese), both common-ground modes and
all extraction entry points. New common-ground drafts stay separate from the saved
proposal. `--snapshot` displays an existing draft without modifying it or calling a
provider. Inspect its desktop and mobile rendering and review its factual claims;
passing structure checks is not proof that every generated interpretation is sound.

An English public-library discussion exercises majority support, opposition, neutral
responses, mixed votes, and low coverage. It includes 120 synthetic voters and seven
statements. Its narrative and descriptive group profiles are handwritten; profiles are selected
by the fixture votes and cite their supporting statements; neither calls a live model. Run it separately from the Chinese preview:

```sh
.venv/bin/python -m backend.tools.preview_report --language en --port 8781
```

Open `http://127.0.0.1:8781/r/local-preview`. Both language fixtures run in the check
script, including a check that the English report contains no Chinese copy.

A second English fixture covers a town-centre pedestrian-zone discussion with 60
synthetic voters and nine statements. Three contrasting voting patterns share access
priorities but differ on a Saturday trial, permanence and weekday restrictions.
It also tests neutral responses and a proposal with only 15% coverage. Like the
library fixture, its prose is handwritten; it does not validate live AI generation.
The traffic fixture includes a fictional endorsed common-ground package with 48
supporting and six opposing reactions out of 60 people. These are separate synthetic
package reactions, not endorsements inferred from statement votes. Rendering tests
cover the endorsed section's placement, draft labelling and retention without a
report narrative. The library fixtures intentionally cover sessions without a saved
common-ground package.

```sh
.venv/bin/python -m backend.tools.preview_report --language en --scenario traffic --port 8782
```

Open `http://127.0.0.1:8782/r/local-preview`. This fixture is also included in the
automated numerical and rendering checks, with its own output file.

This fixture exposed a coverage artefact in analysis v4: three ballot patterns became
six groups because answering a unanimous question changed projection scaling.
Analysis v5 calculates sparse-response scaling using only statements with observed
variance. It also rejects a candidate partition unless every pair of groups differs
on at least one sufficiently answered statement. The traffic fixture now has three
groups of 20, and the comparison section renders again.

The preliminary separation rule requires at least two responses and 50% coverage
in each group on a common statement, with at least 0.20 total variation between the
observed agree/neutral/disagree distributions. Missing answers are excluded. This is
an application heuristic, not a significance test; it preserves two-person minority
patterns as provisional. Existing stricter publication guardrails remain in place.
If no candidate passes, voters retain their map positions in one unseparated group.
That means insufficient evidence of separate groups, not consensus. All original
votes and disagreements remain in the statement results. The method may miss subtle
or very small patterns, and it does not establish population-level opinion groups.

`data-analysis/clustering-scenarios.mjs` supplies eleven synthetic scenarios, including
uneven coverage on varying questions, neutral responses, a two-person minority,
one outlier, disjoint question coverage, and noisy three-group votes. Checks reconcile
all counts, assert intended partitions, verify input-order invariance, and exercise
multiple seeds. Run `node scripts/check-clustering-scenarios.mjs` for a local JSON
summary and visual comparison. An optional path to a previous analysis module adds
before/after results; no production data or services are used.

`REPORT_PYTHON` can select another Python executable. The check script clears service
credentials before tests. Database persistence tests require a disposable PostgreSQL
instance (`MURMI_TEST_POSTGRES_PORT`); otherwise they are explicitly skipped. CI runs
these against its PostgreSQL service. Never point test variables at production.

The command runs all backend tests, both analysis test suites, frontend vote-pattern
and group-contrast tests, a server-rendered report regression test, and the frontend
build. The rendered checks cover all statements being visible, removed sections staying
removed, profile order, coverage, and the no-AI fallback. Inspect desktop and mobile
local previews as well; server-rendered checks are not visual browser tests.

## Before an approved release

1. Review the diff and test results for the exact candidate commit. Record skipped
   checks, model-quality review still needed, and any build warnings.
2. Inspect the local preview at desktop and mobile widths. If changing narrative or
   theme rules, also review a newly generated host draft on a non-production instance.
3. Present the commit, preview, validation, and rollback plan for explicit approval.
4. Only after approval, deploy that candidate through the agreed hosting process.
   Preserve the prior build and report version. Do not interrupt active sessions.
5. Verify the approved live result and its unchanged source vote data.

No raw participant records, session exports, transcripts, credentials, or real report
payloads belong in committed fixtures. Generated preview artifacts belong in ignored
`outputs/`.

## Comparing models before choosing one

`backend/tools/compare_report_models.py` captures the current production request
builders and replays actual responses through the same normalizers. It does not
change model defaults, create sessions, call the database, endorse text or publish.
All twelve discussions in `model_experiment_fixtures.py` are fictional. They cover
majority support, polarization, a two-person minority, neutral versus missing votes,
disjoint coverage, no votes, an existing approved package, a rejected prior version,
incompatible support, quoted instructions, and Taiwan Chinese with an English turn.
These are selected short transcript excerpts, not a test of long audio transcription.

The comparison separates four stages: a bounded transcript-to-statement extraction
window, policy common ground, group descriptions, and the report narrative. Fixed
approved statements and ballots are identical across models. A model's newly
extracted statements never inherit those ballots. Reports receive the same saved
common-ground package; newly generated common ground remains a separate draft.

Today common-ground and report prompts receive structured evidence, not the raw
transcript. A separately labelled `transcript-context` arm appends the same transcript
and evidence-use instructions for every candidate. Compare models within each arm,
then compare arms for each model. This avoids attributing better evidence to a better
model. The experimental arm does not change the production pipeline or allow
transcript-only suggestions to count as votes.

Prepare the frozen input bundle without making API calls:

```sh
.venv/bin/python -m backend.tools.compare_report_models prepare
```

Put a non-production key in `.env.model-experiments`, as `OPENAI_API_KEY=...`.
That file is Git-ignored. Never paste keys into chat or put them in shell arguments.
The runner reads this file explicitly; it does not look for production credentials.

Start with three scenarios and the current production inputs (36 calls):

```sh
.venv/bin/python -m backend.tools.compare_report_models run
```

Add transcript context for the same three scenarios (18 additional calls):

```sh
.venv/bin/python -m backend.tools.compare_report_models run --arms transcript-context
```

Choose individual scenarios/stages to extend the comparison, for example:

```sh
.venv/bin/python -m backend.tools.compare_report_models run --scenarios no-votes revision quoted-instructions --stages common-ground --arms production transcript-context
```

`--scenarios` with no values selects all twelve cases. `--repeats 2` adds a second
sample; previously attempted calls are retained. Inputs are hashed and frozen;
editing the bundle or changing production prompts requires a new output directory.
New bundles also hash the generation and validation source files to detect code drift.
The runner refuses a round exceeding `--max-calls` (default 60), uses three concurrent
requests, and does not retry automatically. A started record survives interruption:
an interrupted request may already have incurred usage, so resuming does not repeat
it. Authentication or rate-limit failures stop queued requests. Already in-flight
requests may finish.

Candidates are `gpt-4o-mini`, `gpt-5.6-luna`, and `gpt-6-astra`. Each receives identical
messages and output contracts. The experiment keeps the existing temperature for
the baseline; reasoning candidates omit temperature and use `reasoning_effort=low`.
All calls have an 8,000-completion-token ceiling, including reasoning tokens. This is
an explicitly recorded model/configuration comparison, not identical sampling
semantics. A truncated result counts as incomplete. Requests use Chat Completions
without tools, with `store=false`; no SDK or production API migration is required.
Compatibility was checked against the official [Astra migration guide](https://developers.openai.com/api/docs/guides/latest-model/gpt-6-astra.md#migration-quickstart)
and [Luna model reference](https://developers.openai.com/api/docs/models/gpt-5.6-luna).

Open `outputs/model-experiments/index.html` or serve that directory on localhost.
The comparison records exact inputs, input hashes, model settings, provider model
IDs, token usage, latency, raw outputs, normalized outputs, and structural flags.
It explicitly shows unrun, failed and incomplete cells. Latency is a local sample,
affected by caching and service conditions, and is not a controlled speed benchmark.
The page estimates Standard short-context USD costs from recorded usage (including
cache reads and writes), using official rates checked on 2026-09-22. These estimates
are not billing records; calls without returned usage can still incur charges.
Run the `audit` subcommand to recompute structural flags and estimates consistently
from saved responses without making new API calls.

Review the scenario-specific facts and the rubric before selecting a model. Valid
JSON or accepted citations do not establish correctness. In particular, today's
policy normalizer can supply a fallback citation when the original is absent or
invalid; the experiment flags the original error even if normalization repairs it.
Review raw and normalized outputs together. New proposals cannot inherit approval
or reactions from prior text. One sample is exploratory evidence, not a reliable
quality ranking; repeat important successes and failures before choosing a default.
