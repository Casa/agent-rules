import type { FilterExecutor } from './types.js';
export interface FilterExecOptions {
    /** Per-filter subprocess timeout in ms. Default: 10000. */
    timeoutMs?: number;
    /** Working directory the command runs in. Default: `process.cwd()`. */
    cwd?: string;
    /** Environment for the child (defaults to `process.env`). */
    env?: NodeJS.ProcessEnv;
}
/**
 * Build the default {@link FilterExecutor}: it tokenises the `filter` command,
 * appends the matched paths as arguments, and spawns it. The decision is taken
 * entirely from the exit code (grep-style):
 *
 *   - `0`               ⇒ `'pass'`   (rule applies)
 *   - `1`               ⇒ `'reject'` (rule skipped)
 *   - anything else,    ⇒ `'error'`  (fail-open — caller applies the rule)
 *     timeout, or a
 *     spawn failure
 *
 * stdout/stderr are ignored and stdin is closed; only the exit status matters.
 */
export declare function makeFilterExecutor(options?: FilterExecOptions): FilterExecutor;
