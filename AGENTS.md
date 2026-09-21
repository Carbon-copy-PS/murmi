# Working on Murmi

## Local review before deployment

- Build and test changes locally first. Present the concrete change, validation results, and any untested areas before requesting release approval.
- Do not push commits, deploy to murmi.org, change production report snapshots, or restart production services without explicit approval for that reviewed release. Approval for an earlier release does not authorize later changes.
- Prefer the normal host draft-preview-publish workflow for report publication. Do not patch production report JSON to compensate for generator defects; fix the versioned generator and validate a local draft.
- Keep production credentials, participant records, individual ballots, transcripts, and session exports out of commits and test fixtures. Use synthetic fixtures in tests.
- Report work must follow `docs/report-generation.md`. Run `scripts/check-reports.sh` and visually review the local draft at desktop and mobile widths before presenting a release.
