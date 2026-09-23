# Report generation deployment — 2026-09-23

Approved by the user and deployed at `b7336fbf70b774b932623bc31aff94247d5dd89e`.
The release contains the three reviewed commits: presentation (`8b162e7`), common-ground
generation consistency (`6c9b323`) and local comparison tools (`b7336fb`).

## Validation and activation

- All 140 backend tests passed locally with PostgreSQL 16 in the disposable UTF-8
  cluster, with no skips. All 50 JavaScript tests, three render checks and the frontend
  build passed. An initial run used the older SQL_ASCII test cluster and failed Unicode
  checks; the final run used the UTF-8 cluster without changing assertions.
- The separate server checkout passed the same checks, with the three disposable
  PostgreSQL tests skipped there. Those tests had passed locally. The existing
  large-bundle warning remains; dependency versions and model routing are unchanged.
- Fresh English and Chinese model experiments and desktop/mobile reviews preceded
  approval. Generic lists retain meaningful points without vote-count commentary;
  the Chinese test keeps a disputed trial out of its shared-points list.
- The exact Git revision was pushed on `codex/report-generation-consistency` and
  transferred using a verified bundle. The server build is under
  `/home/ubuntu/releases/report-b7336fb`. Intermittent SSH disconnects delayed staging;
  completed build logs were checked before activation.
- The protected rollback directory is `/home/ubuntu/backups/report-b7336fb`. It contains
  the previous frontend, process/environment configuration, baseline fingerprints and
  a verified custom-format database dump. `rollback/pre-report-b7336fb` points to
  `c8b83d21d78d42e49de1b3919b659badc0a46789`.
- No established backend connections were present immediately before activation.
  The backend restarted once (PM2 restart count 10 → 11), returned healthy, and its
  process configuration was saved. Earlier hashed frontend assets were retained.
- Before synthetic testing, every existing row in all seven database tables and the
  complete Hualien published-report JSON matched the recorded baseline fingerprints.
- The live Hualien report loads the new frontend, retains all 23 statements and renders
  the five-point response colors. Desktop/mobile review found no horizontal overflow
  or browser-console errors. Its saved narrative and common-ground content were not
  regenerated or republished; new generation rules apply to future drafts.

Ordinary rollback restores code and frontend together, then restarts only the app.
It must not restore the database backup over newer participant votes.

## Live generation and persistence verification

A clearly labelled synthetic library session (`R9BF341740`) exercised 12 fictional
participants, six statements and 72 votes through the real WebSocket handlers.
Astra generated both generic and policy common ground using `cg-prompt-v3` and
`common-ground-mediation-v1`. Luna generated two group profiles; both packages and
the Astra report retained the same profile set. All generated packages remained
unapproved drafts, and the report was not published or exposed by the public API.

PostgreSQL verification confirmed all 72 synthetic votes, both common-ground modes
and the generic report draft persisted with matching profiles. Excluding only this
new test session, all seven table fingerprints and the Hualien published-report
fingerprint still matched the pre-deployment baseline. The app remained online
with the same post-activation PID and restart count.

Protected server evidence includes `baseline.json`, `activation.json` and
`verification.json` in the backup directory, and `report-b7336fb-*.log` and smoke files
under `/home/ubuntu/releases/`. Local complete-check output is the ignored
`outputs/deploy-sep23-utf8-checks.log`. No participant data or credentials are in
this deployment record.
