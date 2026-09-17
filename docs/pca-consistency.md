# Consistent opinion groups

Implemented on 2026-09-17 on `fix/pca-report-consistency`, based on deployed
HearTheRoom commit `1c837e4`. The changes remain on this branch: no deployment,
merge or Murmi sync has been performed.

## Behaviour

Live results and newly generated reports use the same groups, identifiers,
headcounts, group centres, statement counts and provisional status for the same
input snapshot. The shared renderer shows individual anonymous points in live
results and aggregate group centres in reports. Reports do not contain individual
points, participant identifiers or ballot rows.

Groups appear from **three voters and two approved statements**. Anyone with one
valid response is included. A small or unstable group remains visible, labelled
**early / provisional**, to encourage participation. When all mapped patterns
coincide, one provisional group appears rather than an invented split. Fewer than
three voters or two statements still gets the existing minimum-data prompt.

Each group explains its pattern with actual vote counts. Support means agree or
strongly agree, divided by all respondents to that statement, including neutral.
Neutral, disagreement and missing-answer counts are shown separately. The first
three statements are ranked by difference from overall support, then response
count; the rest can be expanded. These are descriptive examples, not significance
claims. The original five-point counts remain in the aggregate data and exports.

## One calculation

`shared/opinion-analysis.mjs` owns the settings and calculation. The backend
`opinion_analysis.py` calls it through a small Node adapter and caches results by
a SHA-256 fingerprint of the canonical input and analysis version. Concurrent
requests for identical inputs share the same computation. The in-memory cache
holds at most 64 snapshots, with two subprocesses and at most 16 distinct pending
snapshots. Failed calculations are not cached or replaced by another algorithm.

Live results, report generation and policy evidence consume that result. Generic
common-ground and recommendation requests carry the same group evidence and
provisional status. JSON exports include the aggregate landscape; CSV, text and
print exports preserve group membership summaries and provisional labelling.

The analysis version is `shared-opinion-groups-v1`; new story reports are
`story-report-v6`. Changes to the settings or calculation must bump the analysis
version. Python checks that it matches the Node result.

### Mathematical choices

- Mapping follows the existing report's directional encoding: +1 for either
  agreement strength, 0 for observed neutral, -1 for either disagreement strength.
  This changes the old live map's +/-2 weighting of strong responses. Vote counts
  still retain both strengths; missing is represented separately from neutral.
- PCA fits with per-statement observed-mean imputation and retains the existing
  `sqrt(statement count / answered count)` projection correction. That correction
  is a heuristic, especially for sparse ballots; early results remain provisional.
- Seeded k-means compares 2–4 groups, bounded by participant count and distinct
  points, using silhouette selection. K is no longer fixed to two in reports.
- The 2D map and group centres share one uniform scale on both axes, with equal
  display units. Group labels and results are deterministic for identical inputs,
  including after hydration, input reordering or a change of viewer.
- One hundred deterministic **statement-bootstrap** replicates and eligibility
  sensitivity checks at 1, 2, 3 and 7 responses remain diagnostic. They do not
  remove early voters from the primary grouping.
- Existing conservative reliability checks (group size, share, separation and
  bootstrap stability) determine whether the label can become more stable. They
  do not gate the visibility of provisional groups or establish population-level
  representativeness.

### Participant-first display

Live results show one interactive dot per included voter, with a highlighted
“You” marker, response counts, group selection and zoom. Coincident dots receive
a deterministic, small display offset so identical voting patterns do not hide
people. A visible toggle restores exact positions. Offsets never feed back into
PCA, group membership, evidence or the stored snapshot.

Soft elliptical gradients use each group's aggregate covariance in the displayed
coordinates. They are a visual guide to spread, not a density estimate, confidence
interval or probability of group membership. A small base glow keeps even a
single-position group visible. Reports use the same aggregate geometry and group
counts but omit individual dots. The public report contains no participant
coordinates.

### What the map leaves out

The primary grouping uses the two displayed PCA dimensions. A separate diagnostic
repeats grouping with up to five dimensions, bounded by statements and participant
count. It reports explained variance, selected K and partition agreement
(adjusted Rand index). Agreement below 0.9 raises a visible sensitivity note and
keeps the result provisional. This 0.9 threshold is an application heuristic,
not a statistical significance cutoff.

The diagnostic does **not** replace the primary groups with a second set. It checks
only up to five dimensions and does not prove that all relevant structure has been
captured. Stability across participant resampling and alternative vote encodings
is not yet evaluated automatically.

## Snapshot boundary

Report generation copies statements, ballots, roster counts and common-ground
history before asynchronous computation or AI narrative generation. All evidence,
groups and selected overlap counts use that capture. Live connection objects are
not copied. Later edits stay in the live session and do not mutate the report.

Same input and version means the same analysis. Later votes can legitimately
change live groups; the report retains its saved snapshot. Existing published
reports are rendered using their original fuzzy-tendency format until explicitly
regenerated. No saved report is silently reinterpreted or migrated.

## Regression checks and examples

Run from the repository root:

```sh
node --test backend/app/report-opinion-analysis.test.mjs
node --test data-analysis/polis-inspired-analysis.test.mjs
python -m unittest discover -s backend/tests -t .
node data-analysis/compare-opinion-pipelines.mjs
```

The examples are synthetic, not real-session measurements:

- A 30-person fixture with patterns of 14, 14 and 2 people previously produced
  three live groups but two report tendencies. Both now retain the three groups
  with identical evidence and a provisional label.
- An eight-person sparse fixture previously excluded one person from the report.
  Both now include all eight voters and produce identical groups.
- A three-person fixture with one answer per person still produces an early group.
- An eight-corner, three-dimensional synthetic fixture retains only 2/3 of its
  fitted variance in 2D. Adding the third dimension changes grouping and triggers
  the map sensitivity note.

Additional tests cover missing versus neutral, actual group vote denominators,
viewer-independent labels, report/live/policy parity, cache isolation, malformed
private output rejection, frozen reports and four-group narrative validation.
A local browser check compares the live and report group cards, snapshot hashes
and counts, and checks the mobile layout in all five UI languages. It also checks
individual dot selection by keyboard, the exact-position toggle, zoom, the personal
marker and the unavailable-report state. The dot-layout regression verifies that
display offsets preserve group centres and never mutate analytical coordinates.
No production session data is included
in tests or this document.

A local synthetic timing check with 100 voters, 30 statements and 100 bootstrap
replicates took approximately 342 ms for the JavaScript calculation. This is a
single local measurement, not a production latency guarantee; unchanged inputs
reuse the cached result.
