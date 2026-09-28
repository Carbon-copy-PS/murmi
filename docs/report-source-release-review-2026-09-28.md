# Report sources release review — 2026-09-28

Status: locally validated; awaiting approval to push and deploy.

Candidate branch: `codex/report-transcript`, based on production revision
`fb295ca3297534a4f22e31767a727c20f966c446`.

## Change

Reports link to their original session and include a collapsible discussion
transcript with recorder labels, timestamps, missing-audio markers and a text
download. New report snapshots freeze the transcript at generation time. Only
readable text, recorder label, timestamp and transcription status are retained;
provider metadata and participant identifiers are excluded. Transcript text is
not added to the AI narrative input. Publication controls explain that publishing
also shares the saved transcript.
The source links place Discussion transcript on the left and Original session
on the right, including at mobile widths.

The opening limited-data banner is hidden when voter count is its only trigger.
The scope caveat remains inside methodology, with voter and response counts still
visible. Warnings for too few statements, low response coverage or unknown reasons
remain. Saved sufficiency metadata and analysis thresholds are unchanged.

The presentation contract advances to `concise-report-v2`. Existing v1 reports
remain readable and show that their saved report has no transcript. They require
normal regeneration and publication to include one. No database migration or
dependency change is needed.

## Validation

- `MURMI_TEST_POSTGRES_PORT=55437 scripts/check-reports.sh`: 148 backend tests,
  50 JavaScript tests, three report render checks and the production frontend
  build passed. No tests skipped. The pre-existing large-bundle warning remains.
- Synthetic persistence coverage exercises generation, draft visibility, host
  publication, HTTP delivery and database reload. Transcript contents remain
  unchanged when the live source changes. Other checks cover metadata filtering,
  missing timestamps, missing-audio markers, escaping, encoded source links,
  text-export contents and legacy reports.
  Render checks also verify that voter-count-only notices are omitted for both
  saved and legacy reports, that scope remains in methodology, and that sparse
  evidence and unknown warning reasons still display the notice.
- The local Sovereign AI display preview combines the existing saved narrative
  with the captured source transcript through the new sanitization function.
  It displays 49 entries. It is a local display review, not a regenerated report
  or a new model evaluation. The private preview and screenshots remain ignored
  under `outputs/` and are not committed.
- Desktop (1280 CSS pixels) and mobile (390 CSS pixels) layouts were reviewed.
  The transcript navigation opens the reader; neither viewport has horizontal
  overflow. No browser errors were observed. The browser's download event timed
  out after clicking the text-export control, so actual file delivery remains
  unverified in the in-app browser; the export contents are covered by tests.
  After the banner revision, the full suite and build passed again and both
  viewport widths were rechecked with no opening warning or horizontal overflow.

## Approved-release procedure

After explicit approval, record the then-current production revision and service
state, preserve the previous build and take a protected database backup. Prepare
the reviewed frontend/backend together and retain older hashed assets for open
tabs. Verify no active discussion would be interrupted before restarting the
existing service. Do not use the bootstrap deployment script.

Check service health and unchanged source-data fingerprints after activation.
Regenerate the Sovereign AI report through the normal host workflow, inspect the
draft, and publish it at the existing report URL if that publication is approved.
Do not patch production report JSON. Other reports retain their saved snapshots.

If activation fails, restore the recorded previous code, frontend and service
configuration. Do not overwrite newer votes by restoring an old database as part
of ordinary code rollback.
