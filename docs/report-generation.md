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

- An overview and up to four distinct findings. Shared principles and useful paired
  comparisons belong in findings, not separate sections.
- An opinion map with visible themes and spread dots. Visible group profiles precede
  the strongest adequately answered group comparisons. Profiles describe actual
  support, reservations, or opposition; they do not label people's identities.
- Response coverage, retained as a full section.
- Unresolved questions that explain what still needs clarification.
- Up to three concrete next steps, combining action areas and implications.
- Every statement, visible at the bottom, with support, neutral, disagreement, and
  unanswered counts. More than half of respondents is a majority; a neutral
  plurality is not automatically uncertainty. Missing is never a neutral vote.
- Expandable methodology and limitations.

Previously saved reports remain readable. New-format rendering suppresses obsolete
principle, action-area, and overlap sections even if an unexpected provider response
contains them. It retains complete statements and coverage if AI output is absent.

## Sources of consistency

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

An English public-library discussion exercises majority support, opposition, neutral
responses, mixed votes, and low coverage. It includes 120 synthetic voters and seven
statements. Its narrative is handwritten and group descriptions use fixture vote
counts; neither calls a live model. Run it separately from the Chinese preview:

```sh
.venv/bin/python -m backend.tools.preview_report --language en --port 8781
```

Open `http://127.0.0.1:8781/r/local-preview`. Both language fixtures run in the check
script, including a check that the English report contains no Chinese copy.

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
