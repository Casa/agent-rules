# Agent Rules — Issue Tracker

Work tracker for building and shipping the `agent-rules` TypeScript package. Issues are grouped into milestones. Each issue links back to the requirement(s) it satisfies (see `agent-rules-requirements.md`, R1–R30) or is marked **[infra]** when it's engineering work not captured as a numbered requirement.

**Legend** — Status: ☐ todo · ◐ in progress · ☑ done · ⊘ blocked. Priority: P0 critical · P1 high · P2 nice-to-have.

---

## Implementation status (2026-06-26)

Branch `feat/agent-rules-package`, managed with **yarn**. `yarn lint`, `yarn typecheck`, `yarn test` (36 tests), `yarn build`, and `yarn smoke` all green. Three commits.

- **Done:** M0 scaffolding incl. eslint/prettier (AR-4); M1 rule parsing; M2 glob (incl. multi-`**`); M3 diff (incl. untracked via `--no-index`); M4 prompt + `LLMAdapter`; M5 validation/filter; M6 runner; M7 CLI (`ExecAdapter`, resolution, `claude`/`codex` profiles, `--exec`, help/version); unit tests; `scripts/smoke.sh` (hermetic, AR-76); CI (AR-84); LICENSE + CHANGELOG.
- **Live transport verification (done):** `scripts/verify-transport.sh` added. Codex verified **end-to-end** (real blocking finding) — needed `--skip-git-repo-check`. Claude profile flags + envelope parsing verified; surfaces `is_error` (e.g. "Not logged in") cleanly. Both fixes committed.
- **Docker (done):** `Dockerfile` (claude + codex installed), `docker/entrypoint.sh`, `examples/rules/`, `scripts/demo.sh`, `docker/README.md`. Image builds; hermetic smoke passes in-container; a **real codex review ran end-to-end inside Docker**. Added `--transport claude|codex` to pin the agent when both are installed.
- **Sample rules are diff-only (removal) rules** (`no-removed-auth-checks`, `no-removed-error-handling`) — things a linter can't catch because deleted code isn't in the tree. The demo diff strips an auth guard + error handling; codex reliably flags the auth removal as blocking. Lint-style samples were dropped.
- **Anchoring hardening:** removal findings must point at a surviving line (deleted lines have no new-side line number, so a finding anchored to a `-` line is filtered out). The review prompt now explicitly instructs the model to anchor deletion findings to the nearest surviving line.
- **Release readiness (done):** AR-6C recursion guard (spawn sets `AGENT_RULES_SUBPROCESS`; CLI refuses if re-entered); AR-86 `scripts/pack-smoke.sh` (packs the tarball, installs it, verifies exports/bin/`files`) wired into CI; AR-85 publish workflow.
- **Package name + publishing (done):** scoped **`@casa/agent-rules`** (`publishConfig.access: public`). `.github/workflows/publish.yml` publishes on **merge to main**, guarded so it only publishes when the `package.json` version isn't already on npm (bump the version in a PR to release). Verified end-to-end: scoped tarball packs, installs, imports, and the `agent-rules` bin runs.
- **Pending:** add the `NPM_TOKEN` secret to the GitHub repo (user action — required for publish.yml); AR-43 (richer adapter examples — basic README done).

### Container credentials (verified)

- **claude:** pass `-e CLAUDE_CODE_OAUTH_TOKEN` at run time (headless OAuth). Never bake into the image.
- **codex:** mount a **writable** copy of `~/.codex` (`-v copy:/root/.codex`); a read-only mount fails (codex writes runtime files) and a bare `OPENAI_API_KEY` returns 401 against the responses API.

---

## Milestone 0 — Project scaffolding

| ID | Status | Pri | Issue | Requirements | Depends on |
|---|---|---|---|---|---|
| AR-1 | ☐ | P0 | Initialize **single, pure-ESM** repo: `package.json` (`type: module`, `engines: node>=22`, `files: [dist]`, `bin`), `tsconfig.json` (`module/moduleResolution: NodeNext`), `.gitignore` | [infra] | — |
| AR-2 | ☐ | P0 | Configure pure-ESM build via raw `tsc`; emit `dist/` + declarations; set `exports` map (`types` + `default`); confirm CLI shebang is preserved | R20 | AR-1 |
| AR-3 | ☐ | P0 | Ship `.d.ts` types for all public exports; verify with `arethetypeswrong` | R19 | AR-2 |
| AR-4 | ☐ | P1 | Add linter + formatter (ESLint + Prettier) and `lint`/`format` scripts | [infra] | AR-1 |
| AR-5 | ☐ | P0 | Set up test runner (Vitest/Jest) with coverage; add `test` script | [infra] | AR-1 |
| AR-6 | ☐ | P1 | Define the source module layout (`rule.ts`, `glob.ts`, `diff.ts`, `prompt.ts`, `filter.ts`, `runner.ts`, `cli.ts`, `index.ts`) | [infra] | AR-1 |

---

## Milestone 1 — Rule parsing & discovery

| ID | Status | Pri | Issue | Requirements | Depends on |
|---|---|---|---|---|---|
| AR-10 | ☐ | P0 | Define `AgentRule` type | R1 | AR-6 |
| AR-11 | ☐ | P0 | `parseRuleFile(filename, raw)` — extract front-matter (`description`, `globs`, `reviewSkip`) and body | R1 | AR-10 |
| AR-12 | ☐ | P0 | Support both inline comma-separated and YAML-list `globs` formats | R1 | AR-11 |
| AR-13 | ☐ | P0 | `collectRuleFiles(dir)` — recursively walk dir, collect `.md` and `.mdc` | R2, R3 | AR-10 |
| AR-14 | ☐ | P0 | Discovery filter: drop `reviewSkip: true` rules | R4 | AR-11 |
| AR-15 | ☐ | P0 | Discovery filter: drop rules with empty `globs` | R5 | AR-11 |
| AR-16 | ☐ | P0 | Rule applicability: include a rule iff ≥1 changed file matches its globs | R6 | AR-13, AR-21 |
| AR-17 | ☐ | P1 | `name` falls back to filename (sans extension) when `description` absent | R1 | AR-11 |
| AR-18 | ☐ | P1 | Handle malformed front-matter gracefully (return null / record in `skipped`) | R1 | AR-11 |

---

## Milestone 2 — Glob matching

| ID | Status | Pri | Issue | Requirements | Depends on |
|---|---|---|---|---|---|
| AR-20 | ☐ | P0 | `matchGlob(filePath, pattern)` — `*.ext`, `**`, `dir/*`, exact-match cases | R7 | AR-6 |
| AR-21 | ☐ | P0 | `matchGlobs(filePath, globs)` — positive + negative (`!`) pattern handling | R7 | AR-20 |
| AR-22 | ☐ | P1 | Implement full multi-`**` support via recursive segment matching (`a/**/b/**/*.ts`); preserve `*.ext`-anywhere semantics | R7 | AR-20 |
| AR-23 | ☐ | P1 | Glob test matrix: each supported pattern + negation + edge cases | R7 | AR-21 |

---

## Milestone 3 — Diff handling

| ID | Status | Pri | Issue | Requirements | Depends on |
|---|---|---|---|---|---|
| AR-30 | ☐ | P0 | `extractChangedFiles(diff)` — parse `b/` paths from diff headers | R6, R8 | AR-6 |
| AR-31 | ☐ | P0 | `extractDiffSections(fullDiff, matchingPaths)` — scope diff to a rule's files | R8 | AR-30 |
| AR-32 | ☐ | P0 | `buildDiffLineMap(diff)` — set of valid `path:line` (added + context, right side only) | R12 | AR-6 |
| AR-33 | ☐ | P0 | `getDiff(source, cwd?)` — shell out to git for `working-tree`/`staged`/`range` | R22, R25 | AR-6 |
| AR-34 | ☐ | P0 | `getDiff` error handling: not a git repo, bad range, git not installed | R22, R25 | AR-33 |
| AR-35 | ☐ | P1 | Diff parsing robustness: renames, binary files, new/deleted files, CRLF | R8, R12 | AR-31, AR-32 |

---

## Milestone 4 — Prompt & LLM integration

| ID | Status | Pri | Issue | Requirements | Depends on |
|---|---|---|---|---|---|
| AR-40 | ☐ | P0 | Define `LLMAdapter` interface (`run(prompt): Promise<string>`) | R14 | AR-6 |
| AR-41 | ☐ | P0 | `buildReviewPrompt(rule, diff, ticketContext?)` — assemble prompt per spec | R9 | AR-40 |
| AR-42 | ☐ | P0 | Ticket context block: included only when provided; framed as data-only | R9 | AR-41 |
| AR-43 | ☐ | P1 | Document adapter examples (Anthropic, OpenAI) in README | R14 | AR-40 |
| AR-44 | ☐ | P2 | Adapter error isolation: a failing rule must not abort the whole run | R10 | AR-50 |

---

## Milestone 5 — Output validation & filtering

| ID | Status | Pri | Issue | Requirements | Depends on |
|---|---|---|---|---|---|
| AR-45 | ☐ | P0 | Define `Finding` type + Zod `FindingSchema` validation | R11 | AR-6 |
| AR-46 | ☐ | P0 | Response parser: strip markdown code fences, `JSON.parse`, validate, drop `line <= 0` | R11 | AR-45 |
| AR-47 | ☐ | P0 | `deduplicateFindings` — keep first occurrence per `path:line` | [infra] | AR-45 |
| AR-48 | ☐ | P0 | `filterFindingsToDiff` — drop findings not in `buildDiffLineMap` set | R12 | AR-32, AR-45 |
| AR-49 | ☐ | P0 | `prioritizeFindings` — drop `suggestion` below `minSuggestionImpact`; apply `testFileImpactDiscount`; drop `ignored` | R13, R18 | AR-45 |

---

## Milestone 6 — Runner & configuration

| ID | Status | Pri | Issue | Requirements | Depends on |
|---|---|---|---|---|---|
| AR-50 | ☐ | P0 | `runReview(options)` — orchestrate discover → scope → prompt → validate → filter | R8, R9, R16 | M1–M5 |
| AR-51 | ☐ | P0 | Define `RunOptions` (rulesDir, diff, ticketContext?, llm, concurrency?, minSuggestionImpact?, testFileImpactDiscount?) | R17, R18 | AR-50 |
| AR-52 | ☐ | P0 | Bounded concurrency for per-rule LLM calls (default 3, caller-configurable) | R10 | AR-50 |
| AR-53 | ☐ | P0 | Return `ReviewResult` (`findings`, `ruleCount`, `skipped`); never post/store | R16 | AR-50 |
| AR-54 | ☐ | P1 | `rulesDir` is a required param — no env-var fallback | R17 | AR-51 |
| AR-55 | ☐ | P1 | Skip rules with no matching diff sections without invoking the LLM | R8 | AR-31, AR-50 |

---

## Milestone 7 — CLI

| ID | Status | Pri | Issue | Requirements | Depends on |
|---|---|---|---|---|---|
| AR-60 | ☐ | P0 | `bin` entry `agent-rules` → `dist/cli.js` with shebang; invocable via `npx`/`yarn dlx` | R21 | AR-2 |
| AR-61 | ☐ | P0 | Argument parser; enforce exactly one of `--working-tree` / `--staged` / `--diff <range>` | R22 | AR-33, AR-60 |
| AR-62 | ☐ | P0 | Flags: `--rules`, `--concurrency`, `--min-impact`, `--ticket-context`, `--ticket-context-file`, `--output` | R18, R24 | AR-61 |
| AR-63 | ☐ | P0 | Text output formatter (grouped by file, with summary line) | R24 | AR-50 |
| AR-64 | ☐ | P0 | JSON output formatter (`--output json`) | R24 | AR-50 |
| AR-65 | ☐ | P0 | Exit codes: `0` clean, `1` blocking findings present, `2` error | R23 | AR-63, AR-64 |
| AR-66 | ☐ | P0 | `ExecAdapter`: implement `LLMAdapter` by spawning a command, writing the prompt to stdin, reading the answer from stdout | R26 | AR-40 |
| AR-67 | ☐ | P0 | Transport resolution: `--exec` → launching-agent context (env markers) → PATH discovery (`claude`, then `codex`); fail (exit 2) with guidance if none | R27, R28 | AR-66 |
| AR-68 | ☐ | P0 | Launching-agent detection via env markers (`CLAUDE_CODE_EXECPATH`, `CLAUDECODE`; codex equivalents) | R27 | AR-67 |
| AR-69 | ☐ | P0 | Built-in tool profiles: `claude` (`-p --output-format json --disallowedTools …`, parse `.result`) and `codex` (`exec --json -s read-only --output-last-message …`, optional `--output-schema`) | R29 | AR-66 |
| AR-6A | ☐ | P1 | `--exec` flag: bypass profiles, run raw command with prompt on stdin, stdout captured verbatim | R29 | AR-66 |
| AR-6B | ☐ | P2 | (Deferred) Config-file escape hatch `agent-rules.config.{js,mjs}` exporting an `LLMAdapter` for CLI use without a local agent | R14 | AR-66 |
| AR-6C | ☐ | P1 | Subprocess hardening: timeouts, non-zero exit handling, stderr isolation, nested-agent guard (`CLAUDE_CODE_CHILD_SESSION`) | R26 | AR-66 |
| AR-67H | ☐ | P1 | `--help` / `--version` output | [infra] | AR-61 |

---

## Milestone 8 — Testing

| ID | Status | Pri | Issue | Requirements | Depends on |
|---|---|---|---|---|---|
| AR-70 | ☐ | P0 | Unit tests: `parseRuleFile` (both glob formats, missing fields, malformed) | R1 | AR-11 |
| AR-71 | ☐ | P0 | Unit tests: `collectRuleFiles` (nesting, extension filtering) | R2, R3 | AR-13 |
| AR-72 | ☐ | P0 | Unit tests: glob matching matrix | R7 | AR-23 |
| AR-73 | ☐ | P0 | Unit tests: diff parsing/scoping/line-map (incl. renames, binary, CRLF) | R8, R12 | M3 |
| AR-74 | ☐ | P0 | Unit tests: filtering pipeline (dedup, diff-line, priority, discount, ignored) | R12, R13 | M5 |
| AR-75 | ☐ | P0 | Integration test: `runReview` with a mock `LLMAdapter` (end-to-end, no network) | R8–R16 | AR-50 |
| AR-76 | ☐ | P1 | CLI tests: arg validation, each diff source, exit codes, both output formats | R22–R24 | M7 |
| AR-77 | ☐ | P2 | Fixture corpus: sample rules dir + sample diffs for snapshot tests | [infra] | AR-75 |

---

## Milestone 9 — Docs & release

| ID | Status | Pri | Issue | Requirements | Depends on |
|---|---|---|---|---|---|
| AR-80 | ☐ | P0 | README: install, quickstart (programmatic + CLI), adapter examples, options reference | [infra] | M6, M7 |
| AR-81 | ☐ | P1 | Authoring guide for rule files (front-matter, globs, examples) | R1 | AR-11 |
| AR-82 | ☐ | P1 | `CHANGELOG.md` + adopt semver | [infra] | AR-1 |
| AR-83 | ☐ | P1 | LICENSE + `package.json` metadata (repo, keywords, author) | [infra] | AR-1 |
| AR-84 | ☐ | P0 | CI pipeline: lint, typecheck, test, build on PR | [infra] | M0, M8 |
| AR-85 | ☐ | P0 | Publish workflow: `prepublishOnly` build, `npm publish` (consider `--provenance`) | R20 | AR-84 |
| AR-86 | ☐ | P2 | `npm pack` smoke test: install the tarball in a scratch project, run CLI + import | R19, R20, R21 | AR-85 |

---

## Decisions log

| ID | Decision | Date | Affects |
|---|---|---|---|
| D-1 | **Repo topology: single package.** No monorepo; adapters remain consumer-supplied (R14). | 2026-06-24 | AR-1, M0 |
| D-2 | **Module format: pure ESM** (`type: module`); revises R20 away from dual ESM+CJS. | 2026-06-24 | AR-2, R20 |
| D-3 | **Build tool: raw `tsc`** (no bundler); source uses explicit `.js` import extensions (NodeNext). | 2026-06-24 | AR-2 |
| D-4 | **Node baseline: ≥22** (active LTS; enables stable `require(esm)` for any stray CJS consumer). Supersedes the provisional ≥20. | 2026-06-26 | AR-1, AR-2 |
| D-5 | **CLI transport: delegate to a local agent executable** (`claude`/`codex`) via subprocess — no direct model API, no bundled SDKs, no API-key handling. Library stays BYO-`LLMAdapter`. | 2026-06-24 | AR-66, R26 |
| D-6 | **Resolution order:** `--exec` → launching-agent context (env markers) → PATH discovery. Context detection outranks PATH discovery. | 2026-06-24 | AR-67, R27 |
| D-7 | **No fallback:** if no executable resolves, **fail** (exit 2) with guidance — no silent API-key fallback. | 2026-06-24 | AR-67, R28 |
| D-8 | **Config-file escape hatch deferred (P2):** `--exec` covers the stdin→stdout case; a JS config file is nice-to-have, not core. | 2026-06-24 | AR-6B |
| D-9 | **Remove `alwaysApply`:** drop the field from the schema, parser, and types. Apply a rule broadly with a catch-all glob (e.g. `**/*`). | 2026-06-24 | AR-11, AR-15, R5 |
| D-10 | **Fix multi-`**` globs:** implement full support via recursive segment matching (not the first-`**` split); keep `*.ext`-anywhere semantics. | 2026-06-26 | AR-22, R7 |
| D-11 | **Runner is resilience-policy-free:** no timeout/retry in `runReview`; the `LLMAdapter` owns retries/timeouts. Runner still isolates a rejected `run` into `ReviewResult.skipped`. | 2026-06-26 | AR-44, AR-52, R30 |

## Open questions / decisions needed

None currently open — all prior questions (Q-1 through Q-5) are resolved in the decisions log above. Add new entries here in the full Context / Question / Trade-offs / Affects format as they arise.

**Affects:** AR-44, AR-52, AR-6C.

---

## Requirements coverage check

Every requirement R1–R30 maps to at least one issue:

| Req | Issues |
|---|---|
| R1 | AR-10, AR-11, AR-12, AR-17, AR-18, AR-70, AR-81 |
| R2 | AR-13, AR-71 |
| R3 | AR-13, AR-71 |
| R4 | AR-14 |
| R5 | AR-15 |
| R6 | AR-16, AR-30 |
| R7 | AR-20, AR-21, AR-22, AR-23, AR-72 |
| R8 | AR-31, AR-50, AR-55, AR-73 |
| R9 | AR-41, AR-42, AR-50 |
| R10 | AR-44, AR-52 |
| R11 | AR-45, AR-46 |
| R12 | AR-32, AR-48, AR-73, AR-74 |
| R13 | AR-49, AR-74 |
| R14 | AR-40, AR-43, AR-6B |
| R15 | AR-50 (no platform/host coupling; verified in review) |
| R16 | AR-50, AR-53 |
| R17 | AR-51, AR-54 |
| R18 | AR-49, AR-51, AR-62 |
| R19 | AR-3, AR-86 |
| R20 | AR-2, AR-85, AR-86 |
| R21 | AR-60, AR-86 |
| R22 | AR-33, AR-61, AR-76 |
| R23 | AR-65, AR-76 |
| R24 | AR-62, AR-63, AR-64, AR-76 |
| R25 | AR-33 |
| R26 | AR-66, AR-6C |
| R27 | AR-67, AR-68 |
| R28 | AR-67 |
| R29 | AR-69, AR-6A |
| R30 | AR-44 |

> **R15 note:** no dedicated issue — it's a constraint verified during code review of the runner/CLI, not a feature to build. Flagged here so it isn't lost.
