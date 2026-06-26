# Agent Rules

Apply Markdown-defined coding rules to a diff using an LLM.

Rules are plain Markdown files with YAML front-matter. Each rule declares the file
globs it cares about; at review time the tool discovers the rules that apply to a
diff, asks a model to check each one against its scoped changes, and returns
findings anchored to specific lines.

The package is **LLM-agnostic** (you supply an adapter, or the CLI delegates to a
local agent like `claude`/`codex`) and **platform-agnostic** (it returns findings;
you decide how to surface them).

## Install

```sh
npm install agent-rules
```

Requires Node ≥22. Pure ESM.

## Rule files

Put rules under a directory (e.g. `.agent/rules/`), one per file (`.md` or `.mdc`):

```markdown
---
description: No console.log
globs:
  - "src/**/*.ts"
  - "!src/**/*.test.ts"
---

Use the project logger instead of `console.log` in non-test source files.
```

| Field | Description |
|---|---|
| `description` | Display name (falls back to the filename) |
| `globs` | Inline list or YAML list; `!` negates. A rule with no globs is never applied. |
| `reviewSkip` | If `true`, the rule is parsed but excluded from review |

## CLI

The CLI delegates to a local agent CLI for model access — no API key needed. It
resolves a transport in order: `--exec` → the launching agent (e.g. `$CLAUDE_CODE_EXECPATH`)
→ `claude`/`codex` on `PATH`. If none is found it fails (exit 2).

```sh
# Review uncommitted changes against the default rules dir (.agent/rules)
agent-rules --working-tree

# Review a range, emit JSON
agent-rules --diff origin/main...HEAD --output json

# Force a specific transport (any stdin->stdout command)
agent-rules --working-tree --exec "claude -p --output-format json"
```

Diff sources (exactly one): `--working-tree`, `--staged`, `--diff <range>`.
Run `agent-rules --help` for all options. Exit codes: `0` clean, `1` blocking
findings, `2` error.

## Library

```ts
import { runReview, getDiff, type LLMAdapter } from 'agent-rules';

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
  concurrency: 3,          // default
});

for (const f of result.findings) {
  console.log(`${f.path}:${f.line} [${f.severity}] ${f.body}`);
}
```

`runReview` owns no timeout/retry policy — that belongs to your `LLMAdapter`. A
rejected `run` drops that one rule into `result.skipped` instead of aborting the run.

## License

MIT
