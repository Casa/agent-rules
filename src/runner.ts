import { buildDiffLineMap, extractChangedFiles, extractDiffSections } from './diff.js';
import { deduplicateFindings, filterFindingsToDiff, prioritizeFindings } from './filter.js';
import { matchGlobs } from './glob.js';
import { parseFindings } from './parse.js';
import { buildReviewPrompt } from './prompt.js';
import { loadRules } from './rule.js';
import type { AgentRule, Finding, ReviewResult, RunOptions } from './types.js';

const DEFAULT_CONCURRENCY = 3;

export interface DiscoveryResult {
  rules: AgentRule[];
  skipped: string[];
}

/**
 * Discover the rules under `rulesDir` that apply to `changedFiles`. Rules are
 * dropped (and recorded in `skipped`) when they set `reviewSkip`, declare no
 * globs, or match none of the changed files.
 */
export async function discoverApplicableRules(
  rulesDir: string,
  changedFiles: string[],
): Promise<DiscoveryResult> {
  const all = await loadRules(rulesDir);
  const rules: AgentRule[] = [];
  const skipped: string[] = [];

  for (const rule of all) {
    if (rule.reviewSkip) {
      skipped.push(`${rule.name} (reviewSkip)`);
      continue;
    }
    if (rule.globs.length === 0) {
      skipped.push(`${rule.name} (no globs)`);
      continue;
    }
    if (!changedFiles.some((f) => matchGlobs(f, rule.globs))) {
      skipped.push(`${rule.name} (no matching files)`);
      continue;
    }
    rules.push(rule);
  }

  return { rules, skipped };
}

/**
 * Run a code review: discover applicable rules, ask the model about each one
 * against its scoped diff, then dedupe, filter to diff lines, and prioritise.
 *
 * The runner owns no timeout/retry policy — resilience belongs to the
 * {@link RunOptions.llm} adapter. A rejected `run` drops that one rule into
 * `skipped` rather than aborting the whole review.
 */
export async function runReview(options: RunOptions): Promise<ReviewResult> {
  const {
    rulesDir,
    diff,
    ticketContext,
    llm,
    concurrency = DEFAULT_CONCURRENCY,
    minSuggestionImpact,
    testFileImpactDiscount,
  } = options;

  const changedFiles = extractChangedFiles(diff);
  const { rules, skipped } = await discoverApplicableRules(rulesDir, changedFiles);
  const validLines = buildDiffLineMap(diff);

  // Pair each rule with its scoped diff; drop rules with no relevant sections.
  const queue: { rule: AgentRule; scopedDiff: string }[] = [];
  for (const rule of rules) {
    const matching = new Set(changedFiles.filter((f) => matchGlobs(f, rule.globs)));
    const scopedDiff = extractDiffSections(diff, matching);
    if (!scopedDiff) {
      skipped.push(`${rule.name} (no diff sections)`);
      continue;
    }
    queue.push({ rule, scopedDiff });
  }

  const all: Finding[] = [];
  await mapPool(queue, concurrency, async ({ rule, scopedDiff }) => {
    try {
      const text = await llm.run(buildReviewPrompt(rule, scopedDiff, ticketContext));
      all.push(...parseFindings(text, rule.name));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      skipped.push(`${rule.name} (error: ${msg})`);
    }
  });

  const findings = prioritizeFindings(
    filterFindingsToDiff(deduplicateFindings(all), validLines),
    { minSuggestionImpact, testFileImpactDiscount },
  );

  return { findings, ruleCount: queue.length, skipped };
}

/** Run `fn` over `items` with at most `limit` concurrent executions. */
async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const size = Math.max(1, limit);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await fn(items[index]!);
    }
  });
  await Promise.all(workers);
}
