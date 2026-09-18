# Consistent opinion groups

Live results and newly generated reports use the same calculation, so the same
votes produce the same groups, participant positions and supporting evidence.
A report captures its input before generation starts. Later votes can change the
live view, but do not change a saved report. Previously published reports keep
their original format and are not silently recalculated.

## How groups form

Groups appear from three voters and two approved statements. Anyone with at least
one valid response is included. Small or unstable groups remain visible with an
“early / provisional” label to encourage participation. If all mapped patterns
coincide, one provisional group appears instead of an invented split.

The calculation is shared by live results, reports, policy evidence and exports:

- Agreement maps to +1, observed neutral to 0, and disagreement to −1. Strong and
  ordinary responses are combined for mapping; their separate vote counts remain
  available. Missing answers are kept separate from neutral answers.
- PCA uses each statement's observed mean to fill missing values for fitting.
  The existing `sqrt(statement count / answered count)` projection correction
  remains. This is a heuristic, particularly for sparse ballots.
- Seeded k-means compares two through seven groups, bounded by participant count
  and distinct positions, and chooses by silhouette score. Seven is a maximum,
  not a target; patterns beyond that limit may be represented within those groups.
- One hundred deterministic statement-bootstrap replicates and eligibility checks
  at one, two, three and seven responses help assess reliability. They do not
  remove early participants from the main grouping.
- Group size, separation and stability determine provisional status. These checks
  do not establish statistical significance or population representativeness.

`shared/opinion-analysis.mjs` owns the calculation and settings. The Python backend
calls it through a Node adapter and checks its analysis version. Node must be
available to the backend process, including in production. Identical requests
share a calculation; the cache holds 64 snapshots, with two concurrent subprocesses
and at most 16 distinct pending snapshots. Failed calculations are not replaced
with a different algorithm.

The current analysis version is `shared-opinion-groups-v4`; new story reports use
`story-report-v6`. Changes to calculation or settings must bump the analysis
version in both JavaScript and Python.

## Reading the map

Each dot represents one included voter at their actual mapped position. Coincident
dots have a count; an optional toggle spreads them for inspection. This display
option never changes groups, votes, density shading or saved coordinates.

Both axes use one uniform scale to fit the snapshot. Relative geometry is preserved,
but pixel distances are not absolute measures of disagreement and should not be
compared across sessions. Soft shading comes from equally weighted participant
positions, using a Gaussian kernel with bandwidth 0.045 and a 51 × 51 grid.
Shading does not represent uncertainty or a probability of group membership.

Seven muted colors connect dots, topic labels, legends and explanation cards.
Letters provide another way to identify groups. Labels can move with leader lines
when space is tight; participant positions stay fixed. The same view supports
mobile screens, keyboard selection, and light and dark themes.

New reports save one normalized x/y position per voter, grouped and sorted by
position. This geometry contains no participant identifiers, individual ballots,
viewer markers or per-person response counts. Removing identifiers is not a
formal anonymization guarantee. Older reports without dot geometry keep their
existing view; no individual positions are invented from density shading.

The primary groups use the two displayed PCA dimensions. A separate check repeats
the analysis with up to five dimensions and reports explained variance, group
count and partition agreement (adjusted Rand index). Agreement below 0.9 adds a
visible sensitivity note and keeps the result provisional. This is an application
heuristic, not a significance cutoff. The check does not replace the main groups
or prove that the map captures every relevant difference. Participant resampling
and alternative vote encodings are not automatically evaluated.

## Explaining groups through votes

Each group shows actual support, neutral, disagreement and unanswered counts.
Support combines agree and strongly agree, divided by everyone who answered that
statement, including neutral responses. These examples describe the recorded
votes; they are not claims about participants' motives or identities.

Optional AI themes add a short title, one sentence and links to supporting votes.
The service selects up to eight candidate statements per group. Each candidate
needs at least two responses and 60% support or opposition among respondents;
a group needs two qualifying statements before requesting a description. Candidate
ranking considers contrast with other groups, response counts and coverage.
Shared themes require supporting evidence in every group.

The model receives aggregate evidence, not individual ballots, dot positions or
density grids. Validation rejects unknown groups, unsupported reference IDs,
duplicate-only citations and overlong text. It checks structure and references,
not the semantic accuracy of every generated phrase. Themes are labeled as
AI-generated and can be checked against their cited votes. Without an API key or
enough evidence, the map and vote counts remain available without invented themes.

### Updates without flicker

Result views poll every five seconds in the room and eight seconds on the public
page. Changed evidence can trigger a background theme request at most once per
minute per session. Unchanged inputs reuse cached results. A host can request a
refresh after a five-second cooldown. There are at most two concurrent generations
and eight active or queued sessions. Generation times out after 25 seconds; provider
requests use a 20-second timeout with no SDK retries and a bounded output budget.

Supported previous themes remain visible during updates and temporary failures.
Matching uses aggregate vote patterns rather than group letters: at least two
unchanged, commonly answered statements, average total-variation distance at most
0.15, and a 0.10 margin over alternatives in both directions. Cited statements must
still have at least two responses and 60% support in their original direction.
These are conservative matching heuristics, not confidence estimates. Ambiguous
matches, splits or merges, changed topics or languages, and lost supporting evidence
do not inherit old labels.

The interface identifies retained themes and their generation time while displaying
current vote counts. Retention lasts in memory for up to 64 sessions and does not
survive a server restart. Reports wait for themes from their exact captured snapshot
or record that themes are unavailable; they never freeze a retained older theme.

## Handling unexpected larger snapshots

The analysis remains capped at seven groups. If a future or imported snapshot has
more, the display preserves every dot and evidence card. Colors repeat with unique
labels (A–Z, then AA, AB, …), and a localized notice explains the fallback. Selecting
a group highlights its dots and shows only its topic on the map. Report validation
keeps all valid supplied group descriptions instead of stopping after seven.
Model timeouts and output budgets remain bounded, so unavailable summaries can
still fall back to visible groups and vote evidence. This protects the interface
without promising that arbitrarily large maps remain easy to understand.

## Verification

Run from the repository root after installing the backend and frontend dependencies:

```sh
python -m unittest discover -s backend/tests -t .
node --test backend/app/report-opinion-analysis.test.mjs
node --test data-analysis/polis-inspired-analysis.test.mjs
node --test frontend/src/utils/transcript-text.test.mjs
npm --prefix frontend run build
```

The two database tests require an explicitly disposable local PostgreSQL instance,
with user `murmi_test`, database `postgres`, and local trust authentication. Set
`MURMI_TEST_POSTGRES_PORT` to its port. Never point these tests at a real session
database. CI provides its own PostgreSQL service.

Regression tests cover live/report equality, missing versus neutral answers,
early participation, deterministic results, exact saved dots, cache isolation,
theme retention, report snapshot boundaries, and five-to-seven-group selection.
Synthetic fixtures also check the seven-group cap and unexpected 8-, 12- and
30-group snapshots. Browser checks during development covered desktop/mobile,
English/Traditional Chinese, light/dark mode, keyboard links to evidence and
matching live/report dots. Real-provider smoke tests used synthetic discussions;
they are not a broad evaluation of model quality or a large-session load test.
