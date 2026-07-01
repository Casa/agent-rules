import type { AgentRule, ReviewResult, RunOptions } from './types.js';
export interface DiscoveryResult {
    rules: AgentRule[];
    skipped: string[];
}
/**
 * Discover the rules under `rulesDir` that apply to `changedFiles`. Rules are
 * dropped (and recorded in `skipped`) when they set `reviewSkip`, declare no
 * globs, or match none of the changed files.
 */
export declare function discoverApplicableRules(rulesDir: string, changedFiles: string[]): Promise<DiscoveryResult>;
/**
 * Run a code review: discover applicable rules, ask the model about each one
 * against its scoped diff, then dedupe, filter to diff lines, and prioritise.
 *
 * The runner owns no timeout/retry policy — resilience belongs to the
 * {@link RunOptions.llm} adapter. A rejected `run` drops that one rule into
 * `skipped` rather than aborting the whole review.
 */
export declare function runReview(options: RunOptions): Promise<ReviewResult>;
