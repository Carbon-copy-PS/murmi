# Results and report consistency

Investigation: 2026-09-17. Branch: `codex/pca-report-consistency`, based on
deployed HearTheRoom commit `1c837e4`. This work has not been deployed or
ported to Murmi.

## Why the views disagree

The live page and final report do more than render the same PCA differently.
They calculate different analyses.

| Decision | Live results | Final report |
| --- | --- | --- |
| Vote encoding | Strong agreement/disagreement is +2/-2; agreement/disagreement is +1/-1 | Both strengths collapse to +1/-1 |
| Unanswered statement | Zero, like neutral | Missing; observed column mean for fitting, sparse projection correction |
| Participation threshold | Everyone with a vote; at least 3 voters and 2 statements overall | At least `min(7, max(2, ceil(statementCount * 0.3)))` votes per person |
| Number of patterns | Selects 2–4 groups using silhouette | Restricts analysis to 2 |
| Membership shown | Each person belongs to one k-means group | Fuzzy memberships can span tendencies |
| Input ordering | Incoming statement/voter order | Canonical statement and participant order |
| Random seed | Fixed restart seeds | Session-derived deterministic seed |

The report also evaluates hard-group reliability, but its visible profiles
come from fuzzy tendencies. Equal labels such as A/B would not make these the
same memberships.

There is a third clustering implementation in `backend/app/policy_evidence.py`.
The results page's exports, generic common-ground payload, and recommendations
also consume the live clustering result. These consumers must be included when
the visible grouping is unified.

## Reproducible examples

Run `node data-analysis/compare-opinion-pipelines.mjs`. These are deliberately
synthetic ballots, not observed session results or an accuracy benchmark.

* Thirty complete ballots with two large opposing patterns and one small
  third pattern: live groups contain 14, 14, and 2 people; the report shows
  two tendencies, each with 50% of the membership mass.
* Eight Likert ballots with one incomplete ballot: live groups contain 5
  and 3 people; the report includes only 7 people, with approximately
  37.9% and 62.1% of membership mass in its two tendencies.

Membership mass is not a count of people assigned exclusively to a group.
The report currently rounds that mass into apparent people counts; that
wording should be corrected if overlapping tendencies are retained.

## Completed groundwork

* The report's calculation and settings now have a reusable, side-effect-free
  entry point in `shared/opinion-analysis.mjs`. The report subprocess is a thin
  adapter. This preserves the existing report method; the live page has **not**
  switched to it yet.
* Regression coverage verifies that the shared entry point and report process
  produce the same public output, including after input-order reversal.
* Report generation captures its inputs before asynchronous analysis/narrative
  calls. Evidence, opinion analysis, and narrative-selected overlap counts use
  that same capture. Active websocket connections are not copied.
* A regression test mutates live votes and statement text during generation
  and verifies that all report evidence still uses the original snapshot,
  while live edits remain intact.

## Decision and remaining integration

Choose whether both views should present exclusive groups or overlapping
tendencies. This is a product/methodology decision; code deduplication alone
cannot reconcile the current meanings. A reasonable continuity choice is to
retain the report's overlapping tendencies and align the live view with them.
The current two-tendency limit would then be an explicit shared setting,
not evidence that every discussion naturally contains two camps.

After that choice:

1. Compute one canonical analysis from a captured set of approved statements
   and ballots, with common preprocessing, eligibility, seed and settings.
2. Serve/cache that aggregate result for the live view and embed the same
   analysis in reports. Attach an analysis version and input fingerprint so
   changes can be distinguished from calculation disagreement.
3. Render the same pattern identifiers, positions, membership interpretation
   and statement summaries in both views. Preserve report privacy boundaries.
4. Update exports, recommendation/common-ground inputs and policy evidence so
   they do not introduce another conflicting clustering result.
5. Add end-to-end parity tests, including reordered inputs, insufficient votes,
   missing versus neutral, report capture, and changes after capture.

The consistency promise should be **same ballots and settings, same analysis**.
A frozen report and a live view with later votes may legitimately differ;
the UI needs to identify that report as an earlier snapshot. Existing published
reports will need explicit regeneration to adopt a changed method.

The work remains on its separate branch until review and deployment. Murmi
sync follows after the HearTheRoom changes are settled.
