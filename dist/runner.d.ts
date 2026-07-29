import type { AgentRule, FilterExecutor, ReviewResult, RunOptions } from './types.js';
export interface DiscoveryResult {
    rules: AgentRule[];
    skipped: string[];
    warnings: string[];
}
/** Filter-stage options for {@link discoverApplicableRules}. */
export interface DiscoverOptions {
    /** When `false`, `filter` commands are ignored (treated as absent). Default: `true`. */
    runFilters?: boolean;
    /** Per-filter subprocess timeout in ms. Default: 10000. */
    filterTimeoutMs?: number;
    /** Injectable filter executor. Defaults to the built-in subprocess runner. */
    filterExecutor?: FilterExecutor;
    /** Working directory in which `filter` commands run. Default: `process.cwd()`. */
    cwd?: string;
    /** Max filter commands to run concurrently. Default: 3. */
    concurrency?: number;
}
/**
 * Discover the rules under `rulesDir` that apply to `changedFiles`.
 *
 * Rules are dropped (and recorded in `skipped`) when they set `reviewSkip`,
 * declare no globs, or match none of the changed files. A rule that survives the
 * glob stage and declares a `filter` command then runs that command against its
 * matched paths: `reject` skips the rule (`"<name> (filtered)"`), `error` is
 * fail-open (the rule applies, with a note in `warnings`), and `pass` (or no
 * filter) applies it.
 */
export declare function discoverApplicableRules(rulesDir: string, changedFiles: string[], options?: DiscoverOptions): Promise<DiscoveryResult>;
/**
 * Run a code review: discover applicable rules, ask the model about each one
 * against its scoped diff, then dedupe, filter to diff lines, and prioritise.
 *
 * The runner owns no timeout/retry policy — resilience belongs to the
 * {@link RunOptions.llm} adapter. A rejected `run` drops that one rule into
 * `skipped` rather than aborting the whole review.
 */
export declare function runReview(options: RunOptions): Promise<ReviewResult>;
