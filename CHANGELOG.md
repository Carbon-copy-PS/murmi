# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Enlarge opinion-map participant dots and align the map, controls and vote cards with the site’s shared light/dark theme.

- Keep exact PCA map positions by default and derive soft shading from equally weighted participant positions, replacing the centroid ellipses. Mark overlapping people with counts.

- Make opinion maps participant-first, with individual selectable dots, a personal marker, soft group gradients and an exact-position toggle for overlapping votes.


- Live results and newly generated reports now share one opinion-group analysis,
  including policy evidence and result exports. Early groups remain visible with
  a provisional label. Missing answers stay distinct from neutral, group summaries
  show actual vote counts, and a diagnostic checks information outside the 2D map.
- Report statistics, opinion groups and narrative-selected overlaps use one captured
  set of votes throughout generation. Existing reports retain their saved version.

### Added

- Open-source release files: MIT license, community health docs, issue/PR templates, Dependabot, and CI.

## [0.1.0] - 2026-09-01

### Added

- Initial public snapshot of Murmi: live host-recorded transcription, claim extraction, anonymous voting, common-ground mediation, session reports, and optional Postgres persistence.
