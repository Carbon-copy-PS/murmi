# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Transcript text and original-data downloads, Traditional Chinese display, and documented transcription evaluation tools.
- A Chinese explanation of the September transcription changes and their limitations.

- Open-source release files: license, community health docs, issue/PR templates, Dependabot, and CI.

### Changed

- Select meaningful voting arguments from short discussion windows with recent context. Keep related reasons and conditions together while captions remain immediate.
- Remove the original-text checkbox from the transcript; preserve the original JSON download.
- Keep opinion groups, participant positions and vote evidence consistent between live results and the final report. Generate reports from one captured set of votes.
- Show individual dots in new reports, with matching muted colors across map topics and explanation cards. Support up to seven groups and handle unexpected larger snapshots without dropping groups.
- Explain emerging groups with optional AI topic summaries backed by votes. Keep supported themes visible during refresh and save report themes with their original evidence.
- Keep early groups visible, distinguish missing answers from neutral, and show when the two-dimensional map leaves out important differences.
- Change the project license from MIT to GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`).

### Fixed

- Handle sockets closed during a broadcast without failing the next receive.
- Preserve completed Realtime transcriptions directly instead of replacing them with a second pass over a shared audio buffer.
- Keep short replies, preserve turn order, and wait for final audio acknowledgement when recording stops.
- Retry transcript saves without blocking captions; mark missing segments and recover late results without duplicating entries.
- Use a neutral live-transcription prompt and preserve original model output when displaying Traditional Chinese.
- Expand the vote column to store `strongly_disagree` and migrate older databases without changing existing votes.

## [0.1.0] - 2026-09-01

### Added

- Initial public snapshot of Murmi: live host-recorded transcription, claim extraction, anonymous voting, common-ground mediation, session reports, and optional Postgres persistence.
