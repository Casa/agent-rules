/** The `matcher` used for the agent-rules `PostToolUse` hook: fires on file reads, writes, and edits. */
export declare const HOOK_MATCHER = "Read|Write|Edit";
/** The hook `command`, resolved via the installed package's bin entry — stable across versions. */
export declare const HOOK_COMMAND = "${CLAUDE_PROJECT_DIR}/node_modules/.bin/agent-rules-hook";
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
export declare function mergeHookSettings(existing: ClaudeSettings): MergeHookSettingsResult;
export {};
