import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { LLMAdapter } from './types.js';

/** Tools claude may not use in print mode — the diff is inlined, so none are needed. */
const CLAUDE_DISALLOWED = ['Bash', 'Edit', 'Write', 'WebFetch', 'WebSearch', 'Task'];

const DEFAULT_TIMEOUT_MS = 180_000;

export interface ResolveOptions {
  /** Explicit command override (`--exec`). Highest precedence. */
  exec?: string;
  /** Model name passed to a recognised tool profile. */
  model?: string;
  /** Per-call subprocess timeout in ms. */
  timeoutMs?: number;
  /** Environment to read markers / PATH from (defaults to process.env). */
  env?: NodeJS.ProcessEnv;
}

export interface ResolvedTransport {
  adapter: LLMAdapter;
  /** Human-readable description of what was resolved (for logging). */
  description: string;
}

/**
 * Resolve a model transport for the CLI, in order:
 *   1. `--exec` override
 *   2. launching-agent context (env markers)
 *   3. PATH discovery (claude, then codex)
 *   4. none -> throw with guidance (no API-key fallback)
 */
export function resolveTransport(options: ResolveOptions = {}): ResolvedTransport {
  const env = options.env ?? process.env;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // 1. Explicit override.
  if (options.exec) {
    const [command, ...args] = tokenize(options.exec);
    if (!command) throw new Error('--exec was empty');
    return {
      adapter: makeAdapter({ command, args, timeoutMs, extract: identityExtract }),
      description: `exec: ${options.exec}`,
    };
  }

  // 2. Launching-agent context.
  if (env.CLAUDE_CODE_EXECPATH) {
    return {
      adapter: claudeAdapter(env.CLAUDE_CODE_EXECPATH, options.model, timeoutMs),
      description: `claude (launching agent: ${env.CLAUDE_CODE_EXECPATH})`,
    };
  }
  if (Object.keys(env).some((k) => k.startsWith('CODEX_'))) {
    return {
      adapter: codexAdapter('codex', options.model, timeoutMs),
      description: 'codex (launching agent)',
    };
  }

  // 3. PATH discovery.
  if (onPath('claude', env)) {
    return { adapter: claudeAdapter('claude', options.model, timeoutMs), description: 'claude (PATH)' };
  }
  if (onPath('codex', env)) {
    return { adapter: codexAdapter('codex', options.model, timeoutMs), description: 'codex (PATH)' };
  }

  // 4. No transport.
  throw new Error(
    'no model transport available.\n' +
      '  Install an agent CLI (claude or codex), or pass --exec "<command>",\n' +
      '  or use the library programmatically with your own LLMAdapter.',
  );
}

// ── Tool profiles ────────────────────────────────────────────────

function claudeAdapter(command: string, model: string | undefined, timeoutMs: number): LLMAdapter {
  const args = ['-p', '--output-format', 'json', '--disallowedTools', ...CLAUDE_DISALLOWED];
  if (model) args.push('--model', model);
  return makeAdapter({
    command,
    args,
    timeoutMs,
    // claude --output-format json wraps the answer in a `result` field.
    extract: (stdout) => {
      try {
        const parsed = JSON.parse(stdout) as { result?: unknown };
        if (typeof parsed.result === 'string') return parsed.result;
      } catch {
        /* fall through to raw stdout */
      }
      return stdout;
    },
  });
}

function codexAdapter(command: string, model: string | undefined, timeoutMs: number): LLMAdapter {
  return {
    async run(prompt: string): Promise<string> {
      const outFile = path.join(tmpdir(), `agent-rules-codex-${process.pid}-${counter()}.txt`);
      const args = ['exec', '--json', '-s', 'read-only', '--output-last-message', outFile];
      if (model) args.push('-m', model);
      try {
        await spawnPrompt(command, args, prompt, timeoutMs);
        return await readFile(outFile, 'utf8');
      } finally {
        await rm(outFile, { force: true });
      }
    },
  };
}

// ── Generic subprocess adapter ───────────────────────────────────

interface AdapterSpec {
  command: string;
  args: string[];
  timeoutMs: number;
  extract: (stdout: string) => string;
}

function makeAdapter(spec: AdapterSpec): LLMAdapter {
  return {
    async run(prompt: string): Promise<string> {
      const stdout = await spawnPrompt(spec.command, spec.args, prompt, spec.timeoutMs);
      return spec.extract(stdout);
    },
  };
}

const identityExtract = (s: string): string => s;

/** Spawn a command, write `prompt` to stdin, resolve with stdout on exit 0. */
function spawnPrompt(
  command: string,
  args: string[],
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`failed to spawn ${command}: ${err.message}`));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited ${code ?? 'null'}: ${stderr.trim()}`));
    });

    child.stdin.end(prompt);
  });
}

// ── Helpers ──────────────────────────────────────────────────────

/** Is `name` resolvable on PATH? Best-effort synchronous check. */
function onPath(name: string, env: NodeJS.ProcessEnv): boolean {
  const dirs = (env.PATH ?? '').split(path.delimiter).filter(Boolean);
  return dirs.some((dir) => existsSync(path.join(dir, name)));
}

let _counter = 0;
function counter(): number {
  return _counter++;
}

/** Minimal shell-like tokenizer for `--exec` (handles simple quotes). */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3] ?? '');
  }
  return tokens;
}
