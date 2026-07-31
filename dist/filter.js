const DEFAULT_MIN_SUGGESTION_IMPACT = 7;
const DEFAULT_TEST_FILE_IMPACT_DISCOUNT = 2;
/** Heuristic: does this path look like a test file? */
export function isTestFile(filePath) {
    return (filePath.includes('.test.') ||
        filePath.includes('.spec.') ||
        filePath.includes('/tests/') ||
        filePath.includes('/__tests__/') ||
        filePath.includes('/test/') ||
        filePath.startsWith('tests/') ||
        filePath.startsWith('test/'));
}
/** Deduplicate findings by `path:line`, keeping the first occurrence. */
export function deduplicateFindings(findings) {
    const seen = new Set();
    return findings.filter((f) => {
        const key = `${f.path}:${f.line}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
/** Keep only findings whose `path:line` exists in the diff line map. */
export function filterFindingsToDiff(findings, validLines) {
    if (validLines.size === 0)
        return findings;
    return findings.filter((f) => validLines.has(`${f.path}:${f.line}`));
}
/**
 * Drop `ignored` findings and low-impact suggestions. Test-file findings have a
 * discount subtracted from their impact before the threshold comparison.
 * `blocking` and `nitpick` findings always pass through.
 */
export function prioritizeFindings(findings, options = {}) {
    const minImpact = options.minSuggestionImpact ?? DEFAULT_MIN_SUGGESTION_IMPACT;
    const discount = options.testFileImpactDiscount ?? DEFAULT_TEST_FILE_IMPACT_DISCOUNT;
    return findings.filter((f) => {
        if (f.severity === 'ignored')
            return false;
        if (f.severity !== 'suggestion')
            return true;
        const effective = f.impact - (isTestFile(f.path) ? discount : 0);
        return effective >= minImpact;
    });
}
