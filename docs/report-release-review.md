# Report release review — 2026-09-22

Status: local candidate validated; production model access and release approval
are still pending. Nothing has been pushed, deployed or republished.

## Candidate

Branch: `codex/report-generation-consistency`. Includes the concise report layout,
standalone saved common ground, evidence-based group comparisons and clustering
guardrails, mixed Luna/Astra routing, and the muted response palette. Policy
common-ground evidence validation is now `cg-evidence-v2`: required items without
valid supplied citations are rejected instead of receiving unrelated citations.
Previously saved proposals and endorsements are not normalized again or rewritten.

## Validation

- `MURMI_TEST_POSTGRES_PORT=55436 scripts/check-reports.sh`: 121 backend tests and
  50 JavaScript tests passed, with no skips. All three report render checks and
  the production frontend build passed. The existing large-bundle warning remains.
- PostgreSQL 16.0 ran in an isolated, UTF-8 local cluster. Vote migration/update/
  deletion and transcript retry/reload tests passed, including Chinese text.
- The new report persistence test uses the actual application lifespan, WebSocket
  handlers, HTTP route, analysis pipeline and database. It checks host draft access,
  excludes drafts from public/participant responses, rejects participant publishing,
  publishes as host and reconnects to PostgreSQL. The full report, saved endorsement
  and all 489 synthetic ballots survive unchanged. Model prose is substituted in
  this repeatable test; it does not call paid APIs.
- The previously completed mixed-model smoke made 15 successful actual SDK calls
  across English and Chinese fictional discussions and both common-ground modes.
  After the citation fix, all three saved Astra policy responses were replayed
  through the new normalizer. All 13 recommendations and seven conditions retained
  their supplied evidence; no replacement citations were introduced. This replay
  is distinct from a new API call or a semantic proof of every generated claim.
- The final response palette was reviewed on desktop/mobile and in dark mode.
  Bars, markers and group comparisons agree, labels remain visible and the mobile
  page has no horizontal overflow. The final frontend build is unchanged from that
  visual review. Percentage indicators retain the site accent.

Local evidence (ignored, synthetic): `outputs/release-final-checks.log`,
`outputs/release-citation-replay.json`, `outputs/mixed-model-smoke/`, and
`outputs/response-colors-desktop.png` / `outputs/response-colors-mobile.png`.
Earlier database setup attempts used SQL_ASCII and failed Unicode checks; the final
run used a fresh UTF-8 cluster, not relaxed assertions.

## Remaining server check

Verify the actual production API account can invoke the selected models, and check
the server's runtime and currently deployed revision. The successful local API
tests used the explicitly supplied experiment key; they do not establish access
for a different production key. No production credentials were copied into tests.

## Activation and rollback plan

After review and explicit approval of the candidate commit:

1. Record the current production commit, process configuration and active-session
   state. Preserve the prior frontend build and create a rollback ref before any
   change. Prepare the new build separately, retaining previous hashed assets for
   already-open browser tabs. Take a protected database backup as a precaution.
2. Activate the reviewed backend/frontend together during an agreed period without
   active discussions. Use the existing process-management procedure, not the
   destructive bootstrap `deploy.sh`. No new schema migration is part of this patch.
3. Verify the service and a synthetic generation workflow, then check an existing
   published report and source-data fingerprints remain unchanged. Do not regenerate
   or republish existing reports as part of deployment.
4. If activation fails, restore the recorded prior code, frontend and process
   configuration together. Restart only the affected app through the same approved
   procedure and verify service health. Ordinary code rollback must not restore an
   old database over newer participant votes. Any data recovery is a separate action.

The exact server baseline, backup locations and rollback ref must be recorded from
the real server before activation; they are deliberately not guessed here.
