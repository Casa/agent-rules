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
  /** Pin a specific built-in tool profile, bypassing context/PATH ordering. */
  prefer?: 'claude' | 'codex';
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
      adapter: makeAdapter({ command, args, timeoutMs, interpret: plainStdout }),
      description: `exec: ${options.exec}`,
    };
  }

  // 1b. Pinned tool profile (`--transport`).
  if (options.prefer === 'claude') {
    const command = env.CLAUDE_CODE_EXECPATH || 'claude';
    if (!env.CLAUDE_CODE_EXECPATH && !onPath('claude', env)) {
      throw new Error('--transport claude requested but `claude` was not found on PATH');
    }
    return {
      adapter: claudeAdapter(command, options.model, timeoutMs),
      description: `claude (pinned: ${command})`,
    };
  }
  if (options.prefer === 'codex') {
    if (!onPath('codex', env)) {
      throw new Error('--transport codex requested but `codex` was not found on PATH');
    }
    return { adapter: codexAdapter('codex', options.model, timeoutMs), description: 'codex (pinned)' };
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
    return {
      adapter: claudeAdapter('claude', options.model, timeoutMs),
      description: 'claude (PATH)',
    };
  }
  if (onPath('codex', env)) {
    return {
      adapter: codexAdapter('codex', options.model, timeoutMs),
      description: 'codex (PATH)',
    };
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
    // claude --output-format json wraps the answer in a `result` field and flags
    // turn-level failures (e.g. "Not logged in") with `is_error: true`.
    interpret: ({ code, stdout, stderr }) => {
      let envelope: { result?: unknown; is_error?: boolean } | undefined;
      try {
        envelope = JSON.parse(stdout) as typeof envelope;
      } catch {
        /* not JSON — fall through */
      }
      if (envelope && typeof envelope.result === 'string') {
        if (envelope.is_error) throw new Error(`claude error: ${envelope.result}`);
        return envelope.result;
      }
      if (code !== 0) {
        throw new Error(`claude exited ${code ?? 'null'}: ${(stderr || stdout).trim()}`);
      }
      return stdout;
    },
  });
}

function codexAdapter(command: string, model: string | undefined, timeoutMs: number): LLMAdapter {
  return {
    async run(prompt: string): Promise<string> {
      const outFile = path.join(tmpdir(), `agent-rules-codex-${process.pid}-${counter()}.txt`);
      const args = [
        'exec',
        '--json',
        '-s',
        'read-only',
        '--skip-git-repo-check',
        '--output-last-message',
        outFile,
      ];
      if (model) args.push('-m', model);
      try {
        const { code, stderr } = await spawnPrompt(command, args, prompt, timeoutMs);
        if (code !== 0) {
          throw new Error(`codex exited ${code ?? 'null'}: ${stderr.trim()}`);
        }
        return await readFile(outFile, 'utf8');
      } finally {
        await rm(outFile, { force: true });
      }
    },
  };
}

// ── Generic subprocess adapter ───────────────────────────────────

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

interface AdapterSpec {
  command: string;
  args: string[];
  timeoutMs: number;
  /** Turn a completed subprocess into the model's text answer (may throw). */
  interpret: (result: SpawnResult) => string;
}

function makeAdapter(spec: AdapterSpec): LLMAdapter {
  return {
    async run(prompt: string): Promise<string> {
      const result = await spawnPrompt(spec.command, spec.args, prompt, spec.timeoutMs);
      return spec.interpret(result);
    },
  };
}

/** Default interpretation for `--exec`: succeed on exit 0, else throw. */
function plainStdout({ code, stdout, stderr }: SpawnResult): string {
  if (code !== 0) throw new Error(`command exited ${code ?? 'null'}: ${stderr.trim()}`);
  return stdout;
}

/**
 * Spawn a command, write `prompt` to stdin, and resolve with the captured
 * output and exit code. Rejects only on spawn failure or timeout — a non-zero
 * exit is returned so the caller can inspect stdout (some tools report errors
 * there).
 */
function spawnPrompt(
  command: string,
  args: string[],
  prompt: string,
  timeoutMs: number,
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    // Mark the child env so a nested agent that re-invokes agent-rules can detect
    // and refuse the recursion (see the guard in cli.ts).
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, AGENT_RULES_SUBPROCESS: '1' },
    });
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
      resolve({ code, stdout, stderr });
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
