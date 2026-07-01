import type { DiffSource } from './types.js';
/** Extract changed file paths (the `b/` paths) from a unified diff. */
export declare function extractChangedFiles(diff: string): string[];
/**
 * Narrow a unified diff to only the sections for the given file paths.
 * Returns `null` when no section matches.
 */
export declare function extractDiffSections(fullDiff: string, matchingPaths: Set<string>): string | null;
/**
 * Build the set of valid `path:line` targets from a unified diff. Only lines
 * present on the right side (added or context) are valid finding targets.
 */
export declare function buildDiffLineMap(diff: string): Set<string>;
/**
 * Acquire a unified diff from git for the requested source.
 *
 * `working-tree` includes staged + unstaged tracked changes plus untracked
 * files (rendered via `git diff --no-index` against /dev/null).
 *
 * Throws if git is unavailable, the directory is not a repo, or the range is bad.
 */
export declare function getDiff(source: DiffSource, cwd?: string): Promise<string>;
