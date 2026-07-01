import type { LLMAdapter } from './types.js';
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
export declare function resolveTransport(options?: ResolveOptions): ResolvedTransport;
