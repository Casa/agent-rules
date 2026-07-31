import type { FilterExecutor } from './types.js';
/**
 * Resolve `filePath` (as reported by a tool call, typically absolute) to a
 * path relative to `projectRoot`, in the forward-slash form `matchGlobs`
 * expects. Returns `null` for a path outside the project root (nothing to
 * match against) or the project root itself.
 */
export declare function toRepoRelativePath(filePath: string, projectRoot: string): string | null;
/** Options for {@link buildHookContext}. */
export interface HookContextOptions {
    /**
     * Path to the rules directory to walk. May be relative — in that case it is
     * resolved against `cwd` (the project root), not the process's own working
     * directory, since a hook subprocess's cwd is not guaranteed to match it.
     */
    rulesDir: string;
    /** Repo-relative path of the file the tool just touched (see {@link toRepoRelativePath}). */
    filePath: string;
    /** When `false`, rule `filter` commands are ignored (treated as absent). Default: `true`. */
    runFilters?: boolean;
    /** Per-filter subprocess timeout in ms. Default: 10000. */
    filterTimeoutMs?: number;
    /** Injectable filter executor (for tests). Defaults to the built-in subprocess runner. */
    filterExecutor?: FilterExecutor;
    /** Working directory in which `filter` commands run. Default: `process.cwd()`. */
    cwd?: string;
    /**
     * Dedup keys (see {@link HookContextResult.injectedRuleKeys}) to treat as
     * already injected this session — skipped even if they match. Does not
     * affect `filter` evaluation or discovery.
     */
    alreadyInjected?: ReadonlySet<string>;
}
/** Result of {@link buildHookContext}. */
export interface HookContextResult {
    /**
     * Per-rule dedup keys for the rules that matched and were newly selected —
     * feed these into `alreadyInjected` on the next call to keep deduping.
     * Currently each rule's `filePath` (absolute, set by `loadRules`) — stable
     * and unique across the rules tree, unlike `rule.name`, which is only the
     * filename when a rule has no `description` and collides if two rules
     * share one. Not intended as a human-readable label — see
     * `additionalContext` for that.
     */
    injectedRuleKeys: string[];
    /** Concatenated rule content to inject as `additionalContext`, or `null` if nothing applies. */
    additionalContext: string | null;
}
/**
 * Discover the rules under `rulesDir` that apply to a single touched file, and
 * assemble the context to inject.
 *
 * Mirrors {@link discoverApplicableRules} from `runner.ts`, scoped to one path
 * instead of a diff's changed-files list: `reviewSkip` is deliberately *not*
 * checked here (it only gates the diff-review path), `filter` commands run
 * with the same fail-open exit-code semantics, and rules already present in
 * `alreadyInjected` are dropped from the output (though still evaluated, since
 * applicability can legitimately change from one call to the next).
 */
export declare function buildHookContext(options: HookContextOptions): Promise<HookContextResult>;
