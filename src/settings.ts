/** The `matcher` used for the agent-rules `PostToolUse` hook: fires on file reads, writes, and edits. */
export const HOOK_MATCHER = 'Read|Write|Edit';

/** The hook `command`, resolved via the installed package's bin entry — stable across versions. */
export const HOOK_COMMAND = '${CLAUDE_PROJECT_DIR}/node_modules/.bin/agent-rules-hook';

interface HookCommandEntry {
  type: string;
  command?: string;
  [key: string]: unknown;
}

interface HookMatcherEntry {
  matcher?: string;
  hooks: HookCommandEntry[];
  [key: string]: unknown;
}

/** Minimal shape of a Claude Code `.claude/settings.json` file, as far as this package cares. */
export interface ClaudeSettings {
  hooks?: {
    PostToolUse?: HookMatcherEntry[];
    [event: string]: unknown;
  };
  [key: string]: unknown;
}

export interface MergeHookSettingsResult {
  /** The resulting settings object. Identical to the input when `changed` is `false`. */
  settings: ClaudeSettings;
  /** Whether a new hook entry was added. `false` means the hook was already configured. */
  changed: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Does this `PostToolUse` entry already register the agent-rules hook under
 * our exact matcher? `entry` comes from an unchecked `JSON.parse(...) as
 * ClaudeSettings` (see cli.ts) — a hand-edited or foreign settings.json may
 * not conform to `HookMatcherEntry` at all — so every field is validated
 * before use rather than trusted from its static type.
 */
function registersOurHook(entry: unknown): boolean {
  if (!isPlainObject(entry)) return false;
  if (entry.matcher !== HOOK_MATCHER) return false;
  if (!Array.isArray(entry.hooks)) return false;
  return entry.hooks.some(
    (h: unknown) => isPlainObject(h) && h.type === 'command' && h.command === HOOK_COMMAND,
  );
}

/**
 * Merge the agent-rules `PostToolUse` hook into an existing `settings.json`
 * object, without disturbing any other hooks or settings already present.
 * Idempotent: if a hook with {@link HOOK_COMMAND} is already registered under
 * the {@link HOOK_MATCHER} matcher specifically (not just present somewhere
 * under `PostToolUse` with a different matcher), the input is returned
 * unchanged.
 *
 * `existing` may not actually conform to `ClaudeSettings` at runtime — it's
 * parsed from a file that could have been hand-edited into something
 * unexpected (`null`, an entry missing `hooks`, etc.). This never throws on
 * that: anything that doesn't look like our hook is left untouched and passed
 * through verbatim in the output, rather than crashing `agent-rules setup`.
 */
export function mergeHookSettings(existing: ClaudeSettings): MergeHookSettingsResult {
  const base: ClaudeSettings = isPlainObject(existing) ? existing : {};
  const existingHooks = isPlainObject(base.hooks) ? base.hooks : undefined;
  const rawPostToolUse = existingHooks?.PostToolUse;
  const postToolUse = Array.isArray(rawPostToolUse) ? rawPostToolUse : [];

  if (postToolUse.some(registersOurHook)) {
    return { settings: base, changed: false };
  }

  const settings: ClaudeSettings = {
    ...base,
    hooks: {
      ...existingHooks,
      PostToolUse: [
        ...postToolUse,
        {
          matcher: HOOK_MATCHER,
          hooks: [{ type: 'command', command: HOOK_COMMAND, timeout: 10 }],
        },
      ] as HookMatcherEntry[],
    },
  };
  return { settings, changed: true };
}
