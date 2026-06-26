# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-26

### Added

- Rule discovery and parsing for `.md`/`.mdc` files with YAML front-matter
  (`description`, `globs`, `reviewSkip`); inline and YAML-list glob formats.
- Glob matcher with `*`, `**` (multi-segment), negation, and `*.ext` support.
- Diff utilities: `getDiff` (working-tree incl. untracked, staged, range),
  `extractChangedFiles`, `extractDiffSections`, `buildDiffLineMap`.
- `runReview` orchestrator with bounded concurrency, per-rule diff scoping,
  Zod-validated findings, dedup / diff-line / priority filtering, and per-rule
  failure isolation.
- `agent-rules` CLI: exec-only transport delegating to a local agent
  (`claude`/`codex`), resolution order `--exec` → launching agent → PATH → fail,
  text/JSON output, exit codes `0`/`1`/`2`.
- Hermetic smoke test and a live transport verification script.

[Unreleased]: https://example.com/agent-rules/compare/v0.1.0...HEAD
[0.1.0]: https://example.com/agent-rules/releases/tag/v0.1.0
