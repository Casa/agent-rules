import { buildDiffLineMap, extractChangedFiles, extractDiffSections } from './diff.js';
import { makeFilterExecutor } from './filter-exec.js';
import { deduplicateFindings, filterFindingsToDiff, prioritizeFindings } from './filter.js';
import { matchGlobs } from './glob.js';
import { parseFindings } from './parse.js';
import { buildReviewPrompt } from './prompt.js';
import { loadRules } from './rule.js';
const DEFAULT_CONCURRENCY = 3;
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
export async function discoverApplicableRules(rulesDir, changedFiles, options = {}) {
    const all = await loadRules(rulesDir);
    const rules = [];
    const skipped = [];
    const warnings = [];
    const runFilters = options.runFilters ?? true;
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    // Glob stage: collect the candidates that survive, with their matched paths.
    const candidates = [];
    for (const rule of all) {
        if (rule.reviewSkip) {
            skipped.push(`${rule.name} (reviewSkip)`);
            continue;
        }
        if (rule.globs.length === 0) {
            skipped.push(`${rule.name} (no globs)`);
            continue;
        }
        const matched = changedFiles.filter((f) => matchGlobs(f, rule.globs));
        if (matched.length === 0) {
            skipped.push(`${rule.name} (no matching files)`);
            continue;
        }
        candidates.push({ rule, matched });
    }
    // Filter stage: only candidates with a `filter` (and filters enabled) spawn a
    // command. Run them concurrently; everything else passes straight through.
    const executor = options.filterExecutor ??
        makeFilterExecutor({ timeoutMs: options.filterTimeoutMs, cwd: options.cwd });
    const decisions = new Map();
    const needFilter = runFilters ? candidates.filter((c) => c.rule.filter) : [];
    await mapPool(needFilter, concurrency, async ({ rule, matched }) => {
        let result;
        try {
            result = await executor(rule.filter, matched);
        }
        catch {
            result = 'error';
        }
        if (result === 'reject' || result === 'error')
            decisions.set(rule, result);
    });
    for (const { rule } of candidates) {
        const decision = decisions.get(rule);
        if (decision === 'reject') {
            skipped.push(`${rule.name} (filtered)`);
            continue;
        }
        if (decision === 'error') {
            warnings.push(`${rule.name} (filter error; applied anyway)`);
        }
        rules.push(rule);
    }
    return { rules, skipped, warnings };
}
/**
 * Run a code review: discover applicable rules, ask the model about each one
 * against its scoped diff, then dedupe, filter to diff lines, and prioritise.
 *
 * The runner owns no timeout/retry policy — resilience belongs to the
 * {@link RunOptions.llm} adapter. A rejected `run` drops that one rule into
 * `skipped` rather than aborting the whole review.
 */
export async function runReview(options) {
    const { rulesDir, diff, ticketContext, llm, concurrency = DEFAULT_CONCURRENCY, minSuggestionImpact, testFileImpactDiscount, runFilters, filterTimeoutMs, filterExecutor, cwd, } = options;
    const changedFiles = extractChangedFiles(diff);
    const { rules, skipped, warnings } = await discoverApplicableRules(rulesDir, changedFiles, {
        runFilters,
        filterTimeoutMs,
        filterExecutor,
        cwd,
        concurrency,
    });
    const validLines = buildDiffLineMap(diff);
    // Pair each rule with its scoped diff; drop rules with no relevant sections.
    const queue = [];
    for (const rule of rules) {
        const matching = new Set(changedFiles.filter((f) => matchGlobs(f, rule.globs)));
        const scopedDiff = extractDiffSections(diff, matching);
        if (!scopedDiff) {
            skipped.push(`${rule.name} (no diff sections)`);
            continue;
        }
        queue.push({ rule, scopedDiff });
    }
    const all = [];
    await mapPool(queue, concurrency, async ({ rule, scopedDiff }) => {
        try {
            const text = await llm.run(buildReviewPrompt(rule, scopedDiff, ticketContext));
            all.push(...parseFindings(text, rule.name));
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            skipped.push(`${rule.name} (error: ${msg})`);
        }
    });
    const findings = prioritizeFindings(filterFindingsToDiff(deduplicateFindings(all), validLines), {
        minSuggestionImpact,
        testFileImpactDiscount,
    });
    return { findings, ruleCount: queue.length, skipped, warnings };
}
/** Run `fn` over `items` with at most `limit` concurrent executions. */
async function mapPool(items, limit, fn) {
    const size = Math.max(1, limit);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
        while (cursor < items.length) {
            const index = cursor++;
            await fn(items[index]);
        }
    });
    await Promise.all(workers);
}
