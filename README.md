<p align="center">
  <img src="./assets/banner.svg" alt="agent-rules — Markdown rules, applied to diffs by an agent" width="100%">
</p>

# Agent Rules

Apply Markdown-defined coding rules to a diff using an LLM.

Rules are plain Markdown files with YAML front-matter. Each rule declares the file
globs it cares about; at review time the tool discovers the rules that apply to a
diff, asks a model to check each one against its scoped changes, and returns
findings anchored to specific lines.

The package is **LLM-agnostic** (you supply an adapter, or the CLI delegates to a
local agent like `claude`/`codex`) and **platform-agnostic** (it returns findings;
you decide how to surface them). It ships as a library (`runReview`, `getDiff`, and
the building blocks) and a CLI (`agent-rules`).

## Why not just a linter?

A linter only ever sees the code as it exists now, so it's the right tool for
pattern-matchable facts about the current tree (unused vars, formatting, `console.log`).

agent-rules reviews the **diff** — including removed lines — and reasons about the
_change_. That makes it suited to things a linter structurally can't catch:

- **Removals** — a deleted authorization check or `try`/`catch` is invisible in the
  final code; only the diff shows it. (See `examples/rules/`.)
- **Intent and contracts** — breaking a shared type, dropping a test, semantic review.

Write rules for the change; keep your linter for the snapshot.

## Install

```sh
yarn add @casa/agent-rules
```

Requires Node ≥22. Pure ESM.

## Rule files

Put rules under a directory (e.g. `.agent/rules/`), one per file (`.md` or `.mdc`):

```markdown
---
description: No console.log
globs:
  - 'src/**/*.ts'
  - '!src/**/*.test.ts'
---

Use the project logger instead of `console.log` in non-test source files.
```

| Field         | Description                                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `description` | Display name (falls back to the filename)                                                                                                      |
| `globs`       | Inline list or YAML list; `!` negates. A rule with no globs is never applied.                                                                  |
| `reviewSkip`  | If `true`, the rule is parsed but excluded from review                                                                                         |
| `filter`      | Optional command run after a glob match to decide if the rule applies. Matched paths are appended as args. See below. Absent ⇒ no extra check. |

### Filtering beyond globs

Globs match file _paths_. A `filter` command lets a rule also depend on file
_content_ or relationships between changes. After a rule's globs select the
changed files, its `filter` runs once with those paths appended as arguments,
and decides applicability by exit code:

| Exit code                                      | Meaning                                             |
| ---------------------------------------------- | --------------------------------------------------- |
| `0`                                            | Filter passed — the rule applies                    |
| `1`                                            | Clean rejection — the rule is skipped               |
| anything else, a missing command, or a timeout | Error — fail-open: the rule applies (and is warned) |

```markdown
---
description: No raw SQL in repositories
globs:
  - 'src/repositories/**/*.ts'
filter: "grep -ilq 'select \\|insert \\|update '"
---

Use the query builder, not raw SQL strings, in repository classes.
```

Here `grep` exits `0` if any matched file contains a SQL keyword (rule applies),
`1` if none do (skipped). The command can be inline (with flags) or a script;
see [`examples/filters/`](./examples/filters/) and [`examples/rules/no-raw-sql.md`](./examples/rules/no-raw-sql.md).

> **Filter commands execute with your privileges.** Treat the rules directory as
> trusted code, like a git hook. When reviewing an untrusted diff (e.g. a fork PR
> that could edit a `filter`), pass `--no-filters`. Note also that a filter reads
> files from the working tree — for `--diff <range>` reviews those may differ from
> the diffed revision, so content filters should query git (`git grep <range>`)
> rather than read the tree.

## CLI

The CLI delegates to a local agent CLI for model access — no API key needed. It
resolves a transport in order: `--exec` → `--transport <claude|codex>` →
the launching agent (e.g. `$CLAUDE_CODE_EXECPATH`) → `claude`/`codex` on `PATH`.
If none is found it fails (exit 2).

```sh
# Review uncommitted changes against the default rules dir (.agent/rules)
agent-rules --working-tree

# Review a range, emit JSON
agent-rules --diff origin/main...HEAD --output json

# Pin a specific installed agent
agent-rules --working-tree --transport codex

# Force an explicit transport command (any stdin->stdout program)
agent-rules --working-tree --exec "claude -p --output-format json"

# Review an untrusted diff without executing any rule `filter` commands
agent-rules --diff origin/main...HEAD --no-filters
```

Diff sources (exactly one): `--working-tree`, `--staged`, `--diff <range>`.
Run `agent-rules --help` for all options. Exit codes: `0` clean, `1` blocking
findings, `2` error.

Rule `filter` commands run by default (including under `--list`); `--no-filters`
disables them and `--filter-timeout <ms>` bounds each one (default `10000`).

## Library

```ts
import { runReview, getDiff, type LLMAdapter } from '@casa/agent-rules';

const llm: LLMAdapter = {
  async run(prompt) {
    // call any model and return its text response
    return await myModel(prompt);
  },
};

const diff = await getDiff({ type: 'range', range: 'origin/main...HEAD' });

const result = await runReview({
  rulesDir: '.agent/rules',
  diff,
  llm,
  minSuggestionImpact: 7, // default
  concurrency: 3, // default
});

for (const f of result.findings) {
  console.log(`${f.path}:${f.line} [${f.severity}] ${f.body}`);
}
```

`runReview` owns no timeout/retry policy — that belongs to your `LLMAdapter`. A
rejected `run` drops that one rule into `result.skipped` instead of aborting the run.

## Agent integration (slash command)

Add a `/agent-rules` slash command to Claude Code or Codex. The command runs
`agent-rules --list` to fetch the rules that apply to your current changes, then
the agent you're already talking to reviews the diff against them. `--list` only
**discovers** rules — it doesn't call a model — so there's no nested agent, no
extra cost, and no separate auth.

Templates live in [`examples/integrations/`](./examples/integrations/).

**Claude Code** — copy the command into your project (or `~/.claude/commands/` for all projects):

```sh
mkdir -p .claude/commands
cp node_modules/@casa/agent-rules/examples/integrations/claude-code/agent-rules.md .claude/commands/
# (or copy from this repo if you're not installing the package)
```

**Codex** — copy the prompt into your Codex prompts directory:

```sh
mkdir -p ~/.codex/prompts
cp node_modules/@casa/agent-rules/examples/integrations/codex/agent-rules.md ~/.codex/prompts/
```

Then run `/agent-rules` in a session. It reviews your working-tree changes against
the rules in `.agent/rules`. Edit the copied command to change the rules directory
or the diff source (e.g. `--staged`).

## Live context injection (hook)

The slash command above reviews a diff on demand. `agent-rules-hook` applies
the same `.agent/rules/` rule files continuously instead: whenever Claude Code
reads, writes, or edits a file whose `globs` (and `filter`) match, the rule's
body is injected straight into the agent's context — no diff, no model call,
just the matching rule text surfacing while the agent works. It's purely
informational (there's no way for a rule to block a write); each rule is
injected at most once per session, regardless of how many times a matching
file is touched. `reviewSkip` has no effect here — it only excludes a rule
from the diff-review path.

The once-per-session dedup is tracked in a small state file under the OS temp
directory, keyed by session ID — best-effort only. If that directory isn't
writable in your environment (a locked-down sandbox, an unusual `TMPDIR`), the
hook still injects matching rule content; it just can't remember what it
already showed, so a rule may repeat across a session instead of firing once.

**Setup (automated):**

```sh
npx agent-rules setup
```

This merges a `PostToolUse` hook into your project's `.claude/settings.json`
(creating the file if needed) without disturbing any other hooks or settings
already there, and is safe to run more than once. Commit the file so the rest
of the team gets the hook too.

**Setup (manual):** paste this into `.claude/settings.json` yourself:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Read|Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/node_modules/.bin/agent-rules-hook",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

Pass a non-default rules directory by appending `--rules <dir>` to the
`command` string, the same flag the CLI uses.

## Transport notes (CLI)

The CLI delegates to a local agent in headless mode, so the agent must be usable
non-interactively:

- **claude** must be logged in (`claude /login`). A spawned `claude -p` that isn't
  authenticated surfaces as a per-rule error in `skipped`.
- **codex** is invoked with `--skip-git-repo-check` and a read-only sandbox, and
  authenticates the same way as your interactive `codex`.

If neither resolves (and no `--exec` is given), the CLI exits 2 with guidance.

## Development

```sh
yarn install
yarn build            # compile to dist/ (pure ESM + .d.ts)
yarn typecheck
yarn test             # unit tests (hermetic)
yarn smoke            # end-to-end CLI test via a fake transport (hermetic, CI-safe)
yarn hook-smoke       # end-to-end PostToolUse hook + `setup` test (hermetic, CI-safe)
yarn verify:transport # live check against a real claude/codex (manual, makes a model call)
```

## License

MIT
