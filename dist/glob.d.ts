/** Match a single file path against one glob pattern. */
export declare function matchGlob(filePath: string, pattern: string): boolean;
/**
 * Match a file against a list of globs. A file matches when it satisfies at
 * least one positive pattern and no negative (`!`) pattern.
 */
export declare function matchGlobs(filePath: string, globs: string[]): boolean;
