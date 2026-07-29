import type { Finding } from './types.js';
/** Heuristic: does this path look like a test file? */
export declare function isTestFile(filePath: string): boolean;
/** Deduplicate findings by `path:line`, keeping the first occurrence. */
export declare function deduplicateFindings(findings: Finding[]): Finding[];
/** Keep only findings whose `path:line` exists in the diff line map. */
export declare function filterFindingsToDiff(findings: Finding[], validLines: Set<string>): Finding[];
export interface PrioritizeOptions {
    minSuggestionImpact?: number;
    testFileImpactDiscount?: number;
}
/**
 * Drop `ignored` findings and low-impact suggestions. Test-file findings have a
 * discount subtracted from their impact before the threshold comparison.
 * `blocking` and `nitpick` findings always pass through.
 */
export declare function prioritizeFindings(findings: Finding[], options?: PrioritizeOptions): Finding[];
