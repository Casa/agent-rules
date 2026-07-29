import path from 'node:path';
import { makeFilterExecutor } from './filter-exec.js';
import { matchGlobs } from './glob.js';
import { loadRules } from './rule.js';
/**
 * Resolve `filePath` (as reported by a tool call, typically absolute) to a
 * path relative to `projectRoot`, in the forward-slash form `matchGlobs`
 * expects. Returns `null` for a path outside the project root (nothing to
 * match against) or the project root itself.
 */
export function toRepoRelativePath(filePath, projectRoot) {
    const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
    const rel = path.relative(projectRoot, absolute);
    if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`))
        return null;
    return rel.split(path.sep).join('/');
}
/** A rule's dedup key: its source file path, falling back to its name if somehow unset. */
function keyOf(rule) {
    return rule.filePath ?? rule.name;
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
export async function buildHookContext(options) {
    const runFilters = options.runFilters ?? true;
    const alreadyInjected = options.alreadyInjected ?? new Set();
    const executor = options.filterExecutor ??
        makeFilterExecutor({ timeoutMs: options.filterTimeoutMs, cwd: options.cwd });
    // Resolve a relative rulesDir against the project root (options.cwd), not
    // this process's own cwd — the two aren't guaranteed to match for a hook
    // subprocess, unlike the filter executor's cwd two lines above, which is
    // already threaded through correctly.
    const rulesDir = path.isAbsolute(options.rulesDir)
        ? options.rulesDir
        : path.resolve(options.cwd ?? process.cwd(), options.rulesDir);
    const rules = await loadRules(rulesDir);
    const applicable = [];
    for (const rule of rules) {
        if (rule.globs.length === 0)
            continue;
        if (!matchGlobs(options.filePath, rule.globs))
            continue;
        if (rule.filter && runFilters) {
            let result;
            try {
                result = await executor(rule.filter, [options.filePath]);
            }
            catch {
                result = 'error';
            }
            if (result === 'reject')
                continue;
            // 'error' fails open, same as the diff-review path.
        }
        applicable.push(rule);
    }
    const fresh = applicable.filter((rule) => !alreadyInjected.has(keyOf(rule)));
    if (fresh.length === 0) {
        return { injectedRuleKeys: [], additionalContext: null };
    }
    return {
        injectedRuleKeys: fresh.map(keyOf),
        additionalContext: fresh.map((rule) => `## ${rule.name}\n\n${rule.content}`).join('\n\n'),
    };
}
