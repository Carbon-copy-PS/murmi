# Argument extraction deployment — 2026-09-26

The user approved deployment of the reviewed faster extraction flow and explicitly
approved interrupting the active recording for the backend restart.

Deployed code: `fb295ca3297534a4f22e31767a727c20f966c446`.
Previous code: `b7336fbf70b774b932623bc31aff94247d5dd89e`.

## Scope

The worker checks after a four-second caption pause, with a ten-second maximum
batching wait when it is free. It can select multiple independent positions and
carry unfinished sources into subsequent speech batches. Model routing, dependencies,
host approval behavior, database schema and frontend assets are unchanged.

## Verification

- All 146 backend tests passed locally, including the three persistence tests in
  the disposable UTF-8 PostgreSQL database.
- The separate server checkout passed all backend tests available there; the three
  disposable-database tests were skipped there after passing locally.
- Nine synthetic English/Chinese scenarios and a recorded excerpt were compared
  before approval, using identical model routing. The recorded replay showed six
  cards instead of three and a first card ready around six seconds instead of 30.
  Requests doubled from seven to 14. These are replay estimates, not a live
  microphone-to-vote latency guarantee.
- Before activation, a real-provider smoke test on the server exercised the actual
  queue with a synthetic in-memory session. It recovered an unfinished condition,
  preserved both sources, extracted independent positions, and rejected procedural
  speech and a repeated position. Four requests took approximately five seconds
  per window, including the queue pause; it made no database writes.
- Activation used a verified Git bundle and the exact tested revision. A controlled
  stop allowed shutdown before the database snapshot and code switch.
- The app returned healthy with a new PID. Fingerprints for every row in all seven
  database tables matched the post-shutdown baseline after activation. The published
  Hualien report hash also matched. Public homepage, report and results API returned
  HTTP 200.
- A second real-provider smoke test against the deployed checkout passed all four
  queue cases in 4.88–5.33 seconds per window, with no database writes. The running
  PID stayed stable.
- A later strict whole-database equality check detected normal background activity.
  Row-level comparison against the backup confirmed only three voting-status fields
  changed in four existing sessions: their previously elapsed deadlines caused the
  existing watcher to close voting and append an `expired` event. No rows were added
  or removed, and participants, statements, transcripts, votes, common-ground runs
  and report snapshots remained unchanged. The published report hash still matched.
  This explained the equality-check failure; no rollback or data restoration was needed.

## Rollback and protected evidence

Rollback branch: `rollback/pre-arguments-fb295ca`.

Protected backup: `/home/ubuntu/backups/arguments-fb295ca`. It contains process
configuration, baseline fingerprints and a verified custom-format database dump.
The activation script restores the prior code automatically if activation checks
fail. Ordinary rollback switches to the prior code and restarts the backend;
**do not restore the database over newer votes or transcripts**.

Protected server logs are under `/home/ubuntu/releases/arguments-fb295ca-*`.
Real discussion evidence and comparison outputs remain outside Git.
