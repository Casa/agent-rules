import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { makeFilterExecutor } from './filter-exec.js';
import { matchGlobs } from './glob.js';
import { collectRuleFiles, parseRuleFile } from './rule.js';
import type { AgentRule, FilterExecutor, FilterResult } from './types.js';

/**
 * Resolve `filePath` (as reported by a tool call, typically absolute) to a
 * path relative to `projectRoot`, in the forward-slash form `matchGlobs`
 * expects. Returns `null` for a path outside the project root (nothing to
 * match against) or the project root itself.
 */
export function toRepoRelativePath(filePath: string, projectRoot: string): string | null {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
  const rel = path.relative(projectRoot, absolute);
  if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`)) return null;
  return rel.split(path.sep).join('/');
}

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
   * Currently each rule's file path relative to `rulesDir` (stable and unique
   * across the rules tree, unlike `rule.name`, which is only the filename
   * when a rule has no `description` and collides if two rules share one).
   * Not intended as a human-readable label — see `additionalContext` for that.
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
export async function buildHookContext(options: HookContextOptions): Promise<HookContextResult> {
  const runFilters = options.runFilters ?? true;
  const alreadyInjected = options.alreadyInjected ?? new Set<string>();
  const executor =
    options.filterExecutor ??
    makeFilterExecutor({ timeoutMs: options.filterTimeoutMs, cwd: options.cwd });

  // Resolve a relative rulesDir against the project root (options.cwd), not
  // this process's own cwd — the two aren't guaranteed to match for a hook
  // subprocess, unlike the filter executor's cwd two lines above, which is
  // already threaded through correctly.
  const rulesDir = path.isAbsolute(options.rulesDir)
    ? options.rulesDir
    : path.resolve(options.cwd ?? process.cwd(), options.rulesDir);

  // Loaded directly via collectRuleFiles/parseRuleFile (rather than the
  // loadRules() convenience wrapper) so each rule can be paired with its file
  // path relative to rulesDir — a stable, unique-per-file dedup key. rule.name
  // isn't: it falls back to the bare filename when a rule has no
  // `description`, and two rules in different subdirectories can share one.
  const files = await collectRuleFiles(rulesDir);
  const applicable: { rule: AgentRule; key: string }[] = [];

  for (const file of files) {
    const raw = await readFile(file, 'utf8');
    const rule = parseRuleFile(path.basename(file), raw);
    const key = path.relative(rulesDir, file);

    if (rule.globs.length === 0) continue;
    if (!matchGlobs(options.filePath, rule.globs)) continue;

    if (rule.filter && runFilters) {
      let result: FilterResult;
      try {
        result = await executor(rule.filter, [options.filePath]);
      } catch {
        result = 'error';
      }
      if (result === 'reject') continue;
      // 'error' fails open, same as the diff-review path.
    }

    applicable.push({ rule, key });
  }

  const fresh = applicable.filter(({ key }) => !alreadyInjected.has(key));
  if (fresh.length === 0) {
    return { injectedRuleKeys: [], additionalContext: null };
  }

  return {
    injectedRuleKeys: fresh.map(({ key }) => key),
    additionalContext: fresh.map(({ rule }) => `## ${rule.name}\n\n${rule.content}`).join('\n\n'),
  };
}
