# PDF download release review

## Deployment result

Approved by the user and deployed on 2026-09-28 at
`5662b82b2370b5cd5e04e0cd762e18864bbfec0f`, pushed to `codex/report-transcript`.
Previous production revision: `87ef008c3d11f8a3df3d83177db4471a82b3bac4`.

The candidate was built separately on the production host. Server validation passed
168 backend tests (three PostgreSQL tests skipped there and passed locally), 50
JavaScript tests, three report-render checks and the frontend build. The candidate
runtime adds ReportLab, Pillow, charset-normalizer and test-only pypdf; existing
package versions were preserved. Both licensed PDF fonts are deployed.

Activation retained previous hashed assets for open tabs and backed up the database,
frontend, runtime and service configuration under
`/home/ubuntu/backups/report-pdf-5662b82`. No recording or recent discussion activity
was present. The backend is healthy; all saved-table fingerprints and the published
Sovereign AI report hash matched before and after activation. No snapshot was
regenerated or republished.

The live report exposes Download PDF. A browser download from murmi.org produced a
12-page PDF containing every statement and the full saved transcript, correct source
links, a simplified opening and the final reader guide. All pages were rendered and
inspected. Desktop and 390px mobile checks passed with no horizontal overflow or
browser console errors. The published report remains version 2.

## Simplified opening

The opening now contains the title, takeaway, introduction and compact source
links, followed directly by report content when there is space. The printed
contents list, version/date line, version footer and large opening counters are
removed. PDF bookmarks and source links remain; participation counts stay in the
final reader guide. The web opening likewise omits the statistics panel.

Reviewed all pages of the 12-page English and seven-page Chinese exports, checked
complete transcript preservation and page bounds, and verified the actual browser
download. Desktop and 390px mobile layouts fit without horizontal overflow.
All 168 backend tests, 50 JavaScript tests, three render checks and the build passed;
the 10 focused PDF tests also passed after the final page-break adjustment.

## Reader presentation revision

The revised PDF and report page show one continuous transcript, with paragraph
breaks for reading rather than recording-chunk boundaries. Entry counts, numbered
chunks, repeated recorder labels and timestamps have been removed from the reader
view and text download. Every recorded word stays in order; audio gaps remain
explicit and the underlying snapshot keeps its original metadata.

“About this report” now comes last. It explains who voted, how percentages work,
what unanswered and neutral votes mean, what groups can show, and how the report
was prepared. Shared localized copy keeps the PDF and web explanations consistent.
The web's detailed calculations and participation charts sit behind an optional
disclosure. The PDF keeps technical notes brief and preserves unusual saved rules.

The revised English sample is 12 pages. English and Chinese page renders were
inspected, the complete discussion text was compared with the snapshot, and
168 backend tests, 50 JavaScript tests, three render checks and the build passed.
No production publication or deployment is part of this local revision.

## Initial implementation review

The public report toolbar now downloads a searchable A4 PDF of the saved report.
The document includes source links, a linked contents page and bookmarks, report
prose, charts and group profiles, eligible group comparisons, all statements,
methodology and the complete saved transcript. Draft-only sessions cannot use the
public endpoint; reopened sessions export the earlier snapshot with a stale notice.

Validation completed locally:

- 166 backend tests passed, including the disposable PostgreSQL workflow tests.
- 50 JavaScript tests, all three server-render checks, the production frontend
  build and `git diff --check` passed. The existing Vite chunk-size warning remains.
- The actual download link saved a valid PDF from the local preview on both the
  desktop and mobile layouts. The 390px toolbar fits without horizontal overflow.
- Every page of the 15-page English review export and seven-page synthetic Chinese
  export was rendered with Poppler and inspected. A synthetic long transcript
  entry spans pages without truncation or an isolated section-title page.
- Extracted text retained all 13 statements and all 49 transcript entries in the
  local review export, including mixed Traditional/Simplified Chinese. Font glyph
  and page-bound checks passed; headings, table rows, vote bars and page numbers
  remained readable. Snapshot text was not regenerated for export.
- Tests also cover five interface languages, embedded regular/bold fonts, escaped
  source text, PDF/source links, legacy and empty transcripts, sanitized filenames,
  simultaneous renders, and minimum-response rules for group comparisons.

The sample is the explicit local review draft, not a new published report.
Session exports, downloaded PDFs and screenshots remain in Git-ignored output
directories. No deployment or production data change was made for this feature.

Release requirements: install `backend/requirements.txt` (adds ReportLab 4.4.9),
include both licensed font files, and deploy the reviewed backend and frontend
together after release approval. The fonts are server-only assets, not frontend
downloads. Layout is serialized per process because ReportLab font subsetting is
not thread-safe; it runs outside the WebSocket event loop. The bundle covers the
font's Basic Multilingual Plane characters, not emoji or rare supplementary CJK.
