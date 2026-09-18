# Consistent opinion groups

Implemented on 2026-09-17 on `fix/pca-report-consistency`, based on deployed
HearTheRoom commit `1c837e4`. The changes remain on this branch: no deployment,
merge or Murmi sync has been performed.

## Behaviour

Live results and newly generated reports use the same groups, identifiers,
headcounts, group centres, statement counts and provisional status for the same
input snapshot. The shared renderer shows one dot per voter in both live results
and newly generated reports. Reports save only each dot's normalized x/y position
within its group, sorted spatially; they contain no participant identifiers,
viewer markers, response counts per dot, or individual ballot rows. Rendering
indexes are generated locally and are not persistent participant identities.

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
provisional status. JSON exports include the landscape and anonymous dot geometry; CSV, text and
print exports preserve group membership summaries and provisional labelling.

The analysis version is `shared-opinion-groups-v4`; new story reports are
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
- Seeded k-means compares 2–7 groups, bounded by participant count and distinct
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
“You” marker, response counts, group selection and zoom. Exact mapped positions
are the default, with numbers identifying coincident people. An optional, clearly
labelled toggle offsets coincident dots for inspection. Those offsets never feed
back into PCA, group membership, density shading, evidence or the stored snapshot.

The coordinates use a uniform scale on both axes to fit each snapshot. This keeps
relative geometry, but pixel distances are not an absolute measure of disagreement
and are not comparable across sessions. The engine applies a sparse-response
correction to PCA scores before this display transformation, as described above.

Shading is a Gaussian density estimate from the actual mapped positions, not an
ellipse around each group's centre. Each participant contributes one equal-weight
kernel, with fixed display bandwidth 0.045 in the normalized coordinates. The
shared calculation saves a 51 × 51 aggregate grid per group (four-bandwidth kernel
truncation), and both views render it using one common density scale. Empty spaces
between separate concentrations are not filled merely because the centroid sits
there. Smoothing width is a visual choice, not an uncertainty estimate or a
probability of group membership. Reports retain both the aggregate grids and
the original projected dot positions, including coincident positions. The dot
geometry is validated to contain exactly x/y coordinates in [0,1], with one dot
per group member. Removing identifiers is not a formal anonymization guarantee.
Previously saved reports without dot geometry retain their existing group view;
new positions are not invented or reconstructed from density shading.

Each group's muted color connects its dots, topic label, legend, explanation
heading and softly tinted card background. Cards, map surfaces and legend pills
have no decorative borders or shadows; spacing separates the supporting statements.
Text uses darker or lighter shades of the same hue for
readability, while group letters remain a second cue independent of color.
Keyboard focus outlines remain visible. The flat styling was checked in both
languages and color modes on mobile and desktop, including text contrast on the
tinted cards, keyboard navigation and a successful production frontend build.

The palette supports A–G with seven distinct muted hues: sage, ochre, slate blue,
plum, terracotta, teal and rose. Dots, density shading, topic text and cards all
index the same palette. Clustering may select up to seven groups; it still picks
the best silhouette score within the available candidates and never forces seven.
Report narrative validation accepts every supplied group through G, and the theme
response budget scales with group count (1,800–3,400 tokens for up to seven groups).
The model-call cooldown and timeouts are unchanged.

Crowded topic labels fall back to spaced slots with leader lines, without moving
participant dots. Mobile zoom controls sit below the plot so they do not cover
labels. Synthetic vote fixtures verified selection of five, six and seven groups.
Five- and seven-group screenshots used real model-generated descriptions of
synthetic votes, with live/report dot and evidence parity checked in English and
Traditional Chinese, at desktop/mobile widths and in light/dark mode. The palette
and labels are usable at seven groups, but group letters remain necessary cues:
seven muted colors are not guaranteed distinguishable for every viewer.

The analysis still has a hard seven-group maximum. More underlying preference
patterns may be represented within those seven groups; the application does not
claim to detect every possible group. This limit is independent of the display
fallback for imported or future snapshots with more groups.

For unexpected snapshots above seven groups, retain every group, dot and evidence
card. Repeat the seven colors with explicit unique group labels (A–Z, AA, AB, …),
show a localized notice, and display only the selected topic on the map. The legend
or an individual dot selects that group and dims the others; the topic links to
its evidence card. Normalization preserves all valid supplied report group
descriptions instead of truncating after seven. AI response budgets and timeouts
remain bounded: incomplete generation can still yield unavailable summaries, while
groups and vote evidence remain visible. This fallback does not raise the analysis
limit or promise arbitrarily large maps remain easy to read.

Regression fixtures exercise eight underlying patterns under the seven-group cap,
and unexpected 8-, 12- and 30-group snapshots. Browser checks cover English and
Traditional Chinese, desktop and mobile, live and saved-dot report rendering,
last-group keyboard selection and evidence navigation, all dots/cards retained,
and no page errors or horizontal overflow. These are synthetic robustness tests,
not naturally occurring session data.

The initial 30-person demonstration deliberately used only three distinct ballot
patterns (14, 14 and 2 identical voters). Their PCA positions therefore coincide
at three locations. The initially shown little circles around those locations
were optional display offsets, not evidence of within-group variation. Exact
positions are now the default. A separate, explicitly synthetic 60-person fixture
with varied votes is used to review continuous distributions visually; it is not
real-session evidence.

### Emerging themes over clusters

Live maps and new reports place a short theme title beside each group centre,
with its letter and headcount. Labels wrap and may shift to avoid one another or
the viewer marker; participant coordinates never move. Selecting a label focuses
the group card and its cited statement counts. A toggle hides the overlays.

A separate `opinion-themes-v1` service selects at most eight candidate statements
per group from the canonical analysis. Candidates need at least two responses
and 60% support or opposition among respondents. Smoothed agreement contrast
against participants outside the group, response count and coverage determine
ranking. A group needs two candidate statements to request a description; this
threshold never affects whether its dots or early group are shown. Neutral and
unanswered counts stay separate. Shared statements require at least two responses
and 60% support in every group, and appear in a separate shared summary.

The existing `gpt-4o-mini` integration returns a short title, a description of at
most 180 characters, and two or three statement references per group. Its strict
JSON schema follows the [official Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs).
Server validation rejects unknown groups, references outside that group's
candidate evidence, duplicate-only citations, and overlong text. This checks
structure and reference validity; it does not prove semantic entailment of every
model-written phrase. Themes remain explicitly labelled AI-generated and should
be reviewed through their supporting votes. No personal motives or identities
are requested. Rendering grids, dot positions and individual ballot rows are never model input.

Live generation runs in the background when the result views poll (five seconds
in the room, eight seconds on the public page). Changed snapshots can trigger a
new generation at most once per minute per session. Unchanged inputs reuse a
64-entry cache keyed by analysis fingerprint, topic, language and prompt version.
A host-only refresh can request a new summary after a five-second cooldown. Two
generations run concurrently, with at most eight active/queued sessions. Generation
is limited to 25 seconds, and provider requests use a 20-second timeout with no
SDK retries. Failures back off; the map remains usable without theme text. Without
an API key, no synthetic model descriptions are silently substituted.

Live labels remain visible during refresh, including cooldowns and failed requests,
when their previous vote pattern still matches a current group. The service keeps
the last completed description for up to 64 sessions in memory, even when new votes
arrive before anyone polls the completed snapshot. It matches aggregate vote
distributions rather than group letters: the average total-variation distance over
at least two commonly answered, unchanged statements must be at most 0.15, with a
0.10 margin over alternatives in both directions. These are conservative application
heuristics, not statistical confidence estimates or guarantees of participant identity.
Every cited statement must remain unchanged, have at least two responses, and retain
60% support in its original direction. Ambiguous matches, splits/merges, changed
topics/languages, or lost supporting evidence do not inherit old labels. Shared
summaries must still have supporting evidence in every group.

Retained labels preserve their original source fingerprint and generation time;
the server separately records the current fingerprint against which they were
matched. The UI says it is showing previous AI themes during refresh (or after a
failed update), while map positions and vote counts stay current. Retention does
not add model calls, persist across server restarts, or carry over to reports.
Report generation
waits for the captured snapshot's description or records its unavailable state;
report themes are frozen with the report and do not update on later live votes.
Legacy published reports keep their original rendering.

Checks include background deduplication, cache isolation, vote updates during cooldown,
completion between polls, group renumbering, ambiguous matching, changed citations,
language/topic invalidation, sparse evidence, timeout backoff, manual refresh,
and report persistence of the exact generated snapshot. The local browser check
covers overlay selection by keyboard, label hiding, stale-label rejection,
live/report parity, desktop/mobile and dark mode. A provider smoke test used only
synthetic AI-discussion votes; its output and screenshots are local ignored
artifacts, not real-session evidence or a broad model-quality evaluation.

The retention follow-up passed the full backend suite (80 passed, two database
tests skipped) and the frontend production build. A local browser rehearsal with
synthetic votes and replayed model output changed a vote during an open results
view: all three labels remained visible, the refresh notice appeared, completed
themes replaced them, and the published report stayed unchanged. A DOM observer
confirmed that no “Theme emerging” placeholder appeared during that update. This
check made no provider calls and is not a production deployment rehearsal.

### Deployment verification — 2026-09-18

The subsequent release check ran all 83 backend tests against a disposable local
PostgreSQL 14.19 instance, with no skips, and all 25 JavaScript tests passed. The
frontend production build had already passed for this candidate; the additional
disconnect fix changes only the backend.

A separate rehearsal used the actual HTTP and host WebSocket routes, eight
synthetic voters, and real provider calls for initial themes, refreshed themes,
and the report narrative. It verified that a changed vote preserves supported
labels during cooldown, that host refresh produces themes for the new snapshot,
and that finalization/publication saves the exact same opinion landscape shown
in live results. The application process was terminated and replaced with a fresh
process. The public report was identical after PostgreSQL hydration, and the
returning host, recorded votes and recomputed grouping were preserved.

The first rehearsal exposed a disconnect edge case: a failed broadcast can close
the WebSocket's send side before the next receive. The endpoint now routes that
state through normal disconnect handling. A regression reproduces the failed
broadcast using a real Starlette WebSocket. The repeated end-to-end rehearsal
passed with no ASGI errors or report/database failures in the application log.

The production server was checked read-only: its checkout remained clean at
`1c837e4`, running Python 3.12.13 and Node 20.20.2. Candidate tests were run in an
isolated temporary directory using that server's installed runtime, without its
production environment or database. GitHub Actions has not run this unpushed
branch; the workflow's test commands were exercised directly instead. The live
process remained online and the homepage returned HTTP 200. Temporary services
and server test files were cleaned up. These checks verify this release path;
they are not a large-session load test or a broad evaluation of model quality.

The subsequent color/dot update was checked in English and Traditional Chinese,
on mobile and desktop, in light and dark mode. Browser checks compare all 60
synthetic live/report dot positions and colors, theme/card text-color equality,
text contrast of at least 4.5:1, keyboard selection and old-report fallback.
All 84 backend tests passed against disposable PostgreSQL, all 26 JavaScript
tests passed, and the production frontend build passed. The real-provider,
synthetic-vote publication/restart rehearsal was repeated for the new geometry:
the full published landscape, including dot positions, survived unchanged.

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
private output rejection, frozen reports and seven-group narrative validation.
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
