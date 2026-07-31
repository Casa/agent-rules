#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { extractChangedFiles, getDiff } from './diff.js';
import { resolveTransport } from './exec-adapter.js';
import { discoverApplicableRules, runReview } from './runner.js';
import { mergeHookSettings } from './settings.js';
import type { ClaudeSettings } from './settings.js';
import type { AgentRule, DiffSource, Finding, ReviewResult } from './types.js';

const USAGE = `agent-rules — apply Markdown-defined coding rules to a diff via a local agent CLI

Usage:
  agent-rules (--working-tree | --staged | --diff <range>) [options]
  agent-rules setup

Diff source (exactly one required):
  --working-tree            Uncommitted changes (staged + unstaged + untracked)
  --staged                  Staged changes only
  --diff <range>            A git diff range, e.g. origin/main...HEAD

Options:
  --rules <dir>             Rules directory (default: .agent/rules)
  --concurrency <n>         Max rules in parallel (default: 3)
  --min-impact <n>          Min impact for suggestions (default: 7)
  --ticket-context <text>   Extra context injected into each prompt
  --ticket-context-file <p> Read ticket context from a file
  --output <text|json>      Output format (default: text)
  --list                    List the rules that apply to the diff and exit
                            (no model call; for editor/agent integrations)
  --no-filters              Ignore rule \`filter\` commands (treat as absent).
                            Use when reviewing untrusted changes.
  --filter-timeout <ms>     Per-filter subprocess timeout (default: 10000)
  --exec <command>          Override transport (any stdin->stdout command)
  --transport <claude|codex> Pin which installed agent CLI to use
  --model <name>            Model passed to the resolved agent CLI
  -h, --help                Show this help
  -v, --version             Show version

Subcommand:
  setup                     Wire the agent-rules PostToolUse hook into
                            ./.claude/settings.json (creates it if missing).
                            Merges in; never overwrites other hooks/settings.

Exit codes: 0 = clean, 1 = blocking findings, 2 = error`;

async function main(): Promise<number> {
  if (process.argv[2] === 'setup') {
    return runSetup();
  }

  const { values } = parseArgs({
    options: {
      'working-tree': { type: 'boolean' },
      staged: { type: 'boolean' },
      diff: { type: 'string' },
      rules: { type: 'string', default: '.agent/rules' },
      concurrency: { type: 'string' },
      'min-impact': { type: 'string' },
      'ticket-context': { type: 'string' },
      'ticket-context-file': { type: 'string' },
      output: { type: 'string', default: 'text' },
      list: { type: 'boolean' },
      'no-filters': { type: 'boolean' },
      'filter-timeout': { type: 'string' },
      exec: { type: 'string' },
      transport: { type: 'string' },
      model: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
    allowPositionals: false,
  });

  if (values.help) {
    process.stdout.write(USAGE + '\n');
    return 0;
  }
  if (values.version) {
    process.stdout.write((await readVersion()) + '\n');
    return 0;
  }

  // Recursion guard: refuse if we are running inside an agent that agent-rules
  // itself spawned, to avoid an agent -> agent-rules -> agent loop.
  if (process.env.AGENT_RULES_SUBPROCESS === '1') {
    throw new Error(
      'refusing to run: detected agent-rules running inside an agent it spawned (recursion guard)',
    );
  }

  const source = resolveDiffSource(values);
  if (values.output !== 'text' && values.output !== 'json') {
    throw new Error(`invalid --output: ${String(values.output)} (expected "text" or "json")`);
  }

  const ticketContext = await resolveTicketContext(values);
  const diff = await getDiff(source);
  if (!diff.trim()) {
    process.stderr.write('No changes to review.\n');
    return 0;
  }

  const runFilters = values['no-filters'] ? false : undefined;
  const filterTimeoutMs = parseIntOption(values['filter-timeout'], 'filter-timeout');

  // --list: discover applicable rules and exit. No model call, so this is safe to
  // run from inside an agent session (editor/slash-command integrations). Note
  // that filter commands DO run here unless --no-filters is given.
  if (values.list) {
    const changed = extractChangedFiles(diff);
    const { rules, warnings } = await discoverApplicableRules(
      values.rules ?? '.agent/rules',
      changed,
      { runFilters, filterTimeoutMs },
    );
    for (const w of warnings) process.stderr.write(`warning: ${w}\n`);
    if (values.output === 'json') {
      const payload = rules.map((r) => ({
        name: r.name,
        globs: r.globs,
        content: r.content,
        filePath: r.filePath,
      }));
      process.stdout.write(JSON.stringify({ rules: payload, warnings }, null, 2) + '\n');
    } else {
      process.stdout.write(formatRuleList(rules));
    }
    return 0;
  }

  if (values.transport != null && values.transport !== 'claude' && values.transport !== 'codex') {
    throw new Error(`invalid --transport: ${values.transport} (expected "claude" or "codex")`);
  }
  const { adapter, description } = resolveTransport({
    exec: values.exec,
    prefer: values.transport as 'claude' | 'codex' | undefined,
    model: values.model,
  });
  process.stderr.write(`Using transport: ${description}\n`);

  const result = await runReview({
    rulesDir: values.rules ?? '.agent/rules',
    diff,
    ticketContext,
    llm: adapter,
    concurrency: parseIntOption(values.concurrency, 'concurrency'),
    minSuggestionImpact: parseIntOption(values['min-impact'], 'min-impact'),
    runFilters,
    filterTimeoutMs,
  });

  for (const w of result.warnings) process.stderr.write(`warning: ${w}\n`);
  if (values.output === 'json') {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write(formatText(result));
  }

  return result.findings.some((f) => f.severity === 'blocking') ? 1 : 0;
}

/** Exactly one diff-source flag must be provided. */
function resolveDiffSource(values: Record<string, unknown>): DiffSource {
  const chosen = [
    values['working-tree'] ? 'working-tree' : null,
    values.staged ? 'staged' : null,
    values.diff != null ? 'diff' : null,
  ].filter(Boolean);

  if (chosen.length === 0) {
    throw new Error('a diff source is required: --working-tree, --staged, or --diff <range>');
  }
  if (chosen.length > 1) {
    throw new Error(`only one diff source allowed, got: ${chosen.join(', ')}`);
  }

  if (values['working-tree']) return { type: 'working-tree' };
  if (values.staged) return { type: 'staged' };
  return { type: 'range', range: String(values.diff) };
}

async function resolveTicketContext(values: Record<string, unknown>): Promise<string | undefined> {
  if (values['ticket-context-file']) {
    return readFile(String(values['ticket-context-file']), 'utf8');
  }
  if (values['ticket-context']) return String(values['ticket-context']);
  return undefined;
}

function parseIntOption(value: unknown, name: string): number | undefined {
  if (value == null) return undefined;
  const n = Number.parseInt(String(value), 10);
  if (Number.isNaN(n)) throw new Error(`--${name} must be an integer`);
  return n;
}

/**
 * `agent-rules setup`: wire the `agent-rules-hook` PostToolUse hook into the
 * current project's `.claude/settings.json`, creating the file (and its
 * parent directory) if needed. Merges in — other hooks/settings already
 * present are left untouched — and is idempotent.
 */
async function runSetup(): Promise<number> {
  const settingsPath = path.join(process.cwd(), '.claude', 'settings.json');

  let existing: ClaudeSettings = {};
  try {
    existing = JSON.parse(await readFile(settingsPath, 'utf8')) as ClaudeSettings;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== 'ENOENT') {
      process.stderr.write(`error: could not read ${settingsPath}: ${e.message}\n`);
      return 2;
    }
  }

  const { settings, changed } = mergeHookSettings(existing);
  if (!changed) {
    process.stdout.write(`agent-rules hook is already configured in ${settingsPath}\n`);
    return 0;
  }

  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  process.stdout.write(`Added the agent-rules PostToolUse hook to ${settingsPath}\n`);
  process.stdout.write('Commit this file so the rest of the team picks up the hook too.\n');
  return 0;
}

function formatRuleList(rules: AgentRule[]): string {
  if (rules.length === 0) return 'No applicable rules for these changes.\n';
  const lines: string[] = [`${rules.length} applicable rule(s):`, ''];
  for (const r of rules) {
    lines.push(`## ${r.name}`);
    lines.push(`globs: ${r.globs.join(', ')}`);
    lines.push('');
    lines.push(r.content);
    lines.push('');
  }
  return lines.join('\n');
}

function formatText(result: ReviewResult): string {
  const lines: string[] = [];
  const byFile = new Map<string, Finding[]>();
  for (const f of result.findings) {
    const list = byFile.get(f.path) ?? [];
    list.push(f);
    byFile.set(f.path, list);
  }

  for (const [file, findings] of byFile) {
    lines.push(file);
    for (const f of findings.sort((a, b) => a.line - b.line)) {
      lines.push(`  line ${f.line}  [${f.severity}]  ${f.ruleName}`);
      for (const bodyLine of f.body.split('\n')) {
        lines.push(`           ${bodyLine}`);
      }
      lines.push('');
    }
  }

  const blocking = result.findings.filter((f) => f.severity === 'blocking').length;
  const fileCount = byFile.size;
  lines.push(
    `${result.findings.length} finding(s) across ${fileCount} file(s) ` +
      `(${blocking} blocking) from ${result.ruleCount} rule(s)`,
  );
  return lines.join('\n') + '\n';
}

async function readVersion(): Promise<string> {
  const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { version?: string };
  return pkg.version ?? 'unknown';
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${msg}\n`);
    process.exit(2);
  });
