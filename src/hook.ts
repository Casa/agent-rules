#!/usr/bin/env node
import { buildHookContext, toRepoRelativePath } from './hook-context.js';
import { loadInjected, saveInjected } from './hook-state.js';

/** The subset of the Claude Code `PostToolUse` hook payload this entrypoint reads. */
interface HookInput {
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: { file_path?: string };
}

const HANDLED_TOOLS = new Set(['Read', 'Write', 'Edit']);
const DEFAULT_RULES_DIR = '.agent/rules';

/**
 * `agent-rules-hook` — a Claude Code `PostToolUse` hook that injects matching
 * `.agent/rules/*.md` rule content into the model's context when a Read,
 * Write, or Edit touches a file covered by a rule's `globs` (and `filter`).
 *
 * Never fails the calling tool invocation: any error here (bad input, a
 * missing rules directory, a filter crash) is swallowed and the hook exits 0
 * with no output, exactly like "no rule matched." Diagnostics go to stderr,
 * which Claude Code ignores on exit 0 but which is visible when run by hand.
 */
async function main(): Promise<number> {
  // Recursion guard: if a rule's `filter` command re-invoked us somehow,
  // refuse rather than recurse (mirrors the guard in cli.ts).
  if (process.env.AGENT_RULES_SUBPROCESS === '1') return 0;

  let input: HookInput;
  try {
    input = JSON.parse(await readStdin()) as HookInput;
  } catch (err) {
    warn('could not parse hook input', err);
    return 0;
  }

  if (!input.tool_name || !HANDLED_TOOLS.has(input.tool_name)) return 0;
  const filePath = input.tool_input?.file_path;
  if (!filePath) return 0;

  const projectRoot = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const relPath = toRepoRelativePath(filePath, projectRoot);
  if (relPath === null) return 0;

  const sessionId = input.session_id || 'unknown';

  // Dedup state (loadInjected/saveInjected) lives under the OS tmp dir, which
  // isn't guaranteed writable in every environment (locked-down sandboxes,
  // unusual TMPDIR setups, stale permissions from a prior run). It's a pure
  // optimization — worst case we re-inject a rule more than once per session —
  // so a failure there must never prevent emitting additionalContext for a
  // rule that *did* match. loadInjected already fails safe (empty set) on any
  // read error; saveInjected is isolated in its own try/catch here so a write
  // failure only costs the dedup bookkeeping, not the injection itself.
  let alreadyInjected: Set<string>;
  let result;
  try {
    alreadyInjected = await loadInjected(sessionId);
    result = await buildHookContext({
      rulesDir: resolveRulesDir(),
      filePath: relPath,
      cwd: projectRoot,
      alreadyInjected,
    });
  } catch (err) {
    warn('failed to build hook context', err);
    return 0;
  }

  if (!result.additionalContext) return 0;

  try {
    for (const key of result.injectedRuleKeys) alreadyInjected.add(key);
    await saveInjected(sessionId, alreadyInjected);
  } catch (err) {
    warn('failed to persist dedup state (continuing without it)', err);
  }

  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: result.additionalContext,
      },
    })}\n`,
  );
  return 0;
}

/** `--rules <dir>` baked into the hook's `command` string in settings.json; defaults to `.agent/rules`. */
function resolveRulesDir(): string {
  const idx = process.argv.indexOf('--rules');
  const value = idx !== -1 ? process.argv[idx + 1] : undefined;
  return value || DEFAULT_RULES_DIR;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function warn(message: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  process.stderr.write(`agent-rules-hook: ${message}: ${detail}\n`);
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    warn('unexpected error', err);
    process.exit(0); // a hook must never break the tool call it fired on
  });
