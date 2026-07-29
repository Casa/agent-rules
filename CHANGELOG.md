# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Optional `filter` front-matter field: a second-stage applicability command run
  after a rule's globs match, with the matched paths appended as arguments.
  grep-style exit codes (`0` applies, `1` skips, anything else / timeout / missing
  command fails open and applies). Disable with `--no-filters` / `runFilters:
false`; bound with `--filter-timeout` / `filterTimeoutMs` (default 10000 ms).
  Filter errors surface in the new `ReviewResult.warnings`. New exports:
  `makeFilterExecutor`, `FilterResult`, `FilterExecutor`, `DiscoverOptions`.
- `agent-rules-hook`: a Claude Code `PostToolUse` hook that applies the same
  `.agent/rules/*.md` rules live, injecting a matching rule's body into the
  agent's context whenever a Read/Write/Edit touches a file covered by its
  `globs` (and `filter`) — a continuous complement to the diff-review CLI/slash
  command, reusing the same rule-parsing, glob-matching, and filter-execution
  engine. Informational only (no blocking); `reviewSkip` does not exclude a
  rule from injection (it only gates the diff-review path); each rule is
  injected at most once per session, deduped by its path relative to
  `rulesDir` (not `rule.name`, which isn't guaranteed unique across the rules
  tree). A relative `rulesDir` resolves against the project root, not the hook
  process's own working directory. New `agent-rules setup` subcommand merges
  the hook into a project's `.claude/settings.json` (creating it if needed,
  idempotent when the hook is already registered under its own matcher,
  leaves other hooks/settings untouched, never throws on a malformed existing
  file); see the README for the manual JSON snippet. New exports:
  `buildHookContext`, `toRepoRelativePath`, `mergeHookSettings`,
  `HOOK_MATCHER`, `HOOK_COMMAND`.

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
- `--transport claude|codex` flag to pin the agent when both are installed.
- Recursion guard: refuses to run inside an agent that agent-rules spawned.
- `--list` mode: discover the rules applicable to a diff without calling a model.
- Slash-command templates for Claude Code and Codex (`examples/integrations/`) that
  use `--list` so the host agent does the review without spawning a nested agent.
- Docker image (`claude` + `codex` installed) with sample removal rules and a
  demo; hermetic smoke and packaged-install (`npm pack`) smoke tests.

[Unreleased]: https://example.com/agent-rules/compare/v0.1.0...HEAD
[0.1.0]: https://example.com/agent-rules/releases/tag/v0.1.0
