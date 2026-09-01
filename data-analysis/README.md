# Murmi data analysis

This folder contains reproducible conversion tooling for turning a Murmi
raw session export into CSV files shaped like Pol.is report exports.

Session data is written under data-analysis/sessions/<session-id> and is ignored
by Git. Both the raw export and the pseudonymized vote matrix are sensitive:
the raw file contains participant identifiers and names, while the converted
matrix still exposes each pseudonymous participant's voting pattern.

## Run the conversion

From the repository root:

    node data-analysis/convert-heartheroom-to-polis.mjs /path/to/session_raw_votes.json

For each session the converter creates:

    data-analysis/sessions/<session-id>/
    ├── raw/
    │   └── <original raw JSON filename>
    └── polis/
        ├── <session-id>-comments.csv
        ├── <session-id>-participant-votes.csv
        ├── conversion-metadata.json
        └── htr-derived/
            ├── <session-id>-participant-votes.csv
            └── <session-id>-comment-groups.csv

The session directories and files are restricted to the current local user.

## Conversion rules

Votes are converted to the Pol.is report encoding:

| HearTheRoom vote | Pol.is-compatible cell |
| --- | ---: |
| strongly_agree | 1 |
| agree | 1 |
| neutral | 0 |
| disagree | -1 |
| strongly_disagree | -1 |
| no vote row | blank |

Participant and comment identifiers are replaced with deterministic sequential
numbers. No participant names, client IDs, or raw participant IDs are written
to the CSV files.

## Known limitations

- The five-point vote intensity is collapsed to three values. The untouched raw
  JSON remains the source of truth.
- HearTheRoom does not persist statement authorship, so comments.csv uses
  author-id 0 and participant-votes.csv uses n-comments 0.
- HearTheRoom stores only the current vote per participant and statement.
  Therefore comments.csv counts the current snapshot rather than historical
  vote events or changed votes.
- No votes.csv is generated because the source has neither per-vote timestamps
  nor the revision history needed to create an authentic Pol.is vote-event
  export.
- The primary participant-votes.csv leaves group-id blank because native Pol.is
  grouping cannot be reconstructed by formatting the source data.
- The htr-derived group files are structurally Pol.is-compatible but are
  produced by HearTheRoom's current PCA/k-means implementation. They are not
  native Pol.is group assignments. During PCA, the HTR algorithm treats neutral
  and missing votes alike as zero, uses five-point weights (+2 to -2), and
  assigns every voter, including low-activity voters. The exported matrix itself
  is subsequently collapsed to Pol.is's ternary values.
- These are Pol.is-shaped report files. Their existence does not imply that the
  hosted Pol.is application accepts them as a direct upload format.

The converter validates row counts, vote domains, aggregate totals, group
totals, source-copy integrity, and that raw participant/client identifiers do
not leak into the generated CSV text.

## Generate the bilingual visual report

The report generator reads a local raw snapshot and writes aggregate-only
presentation assets to data-analysis/reports/<session-id>. Report outputs are
gitignored so they can be reviewed locally and are never committed.

    node data-analysis/generate-deliberation-report.mjs \
      /path/to/session_raw_votes.json

The output includes parallel Taiwan Traditional Chinese and English reports:

    data-analysis/reports/<session-id>/index.html
    data-analysis/reports/<session-id>/en/index.html

Each edition includes six SVG figures, six PNG figures, an aggregate artifact
manifest, and a short sharing note. Language links connect the two reports. The
published HTML and charts use system font stacks so the report works offline
without redistributing third-party font binaries. Neither report contains
participant names, client IDs, raw participant IDs, or participant-level vote
records.

The six figures cover key response patterns, items with the highest neutral
shares, three principles and five action areas, paired policy priorities,
response coverage, and an aggregate opinion-tendency map. Every
figure is followed by short “how to read” and “takeaway” notes. The overlap
figures use only people who answered both statements in a pair and distinguish
support for both, A only, B only, or neither; neutral and disagreement are both
treated as “not supported” for that four-way comparison.

At the end of each language edition, a collapsed, seven-step methodology
section explains data validation, per-prompt calculations, thematic synthesis,
paired overlap, PCA, fuzzy opinion tendencies, and uncertainty checks in plain
language. Technical caveats and privacy boundaries are stated alongside the
step where they matter.

The sixth figure uses ternary votes, keeps missing and observed-neutral
responses distinct, mean-imputes missing cells for two-dimensional PCA, and
adjusts positions for sparse response coverage. All 71 people with a recorded
vote contribute to the PCA axes; the soft-profile analysis includes the 54
people who answered at least seven prompts. Deterministic fuzzy c-means turns
the two-dimensional response landscape into three overlapping tendencies, so a
person can contribute partly to more than one profile. The public map shows
only aggregate profile geometry and priorities. Exact participant coordinates,
membership weights, and assignments never cross the report privacy boundary.
A separate hard-partition repeatability check remains in the appendix; the
report-specific guardrail is a cautious local rule, not an official Pol.is
threshold.
