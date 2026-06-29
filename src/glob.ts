// Glob matching for rule `globs` patterns.
//
// Supported syntax:
//   *.ext            extension match anywhere in the tree
//   dir/** and **    a double-star spans any number of path segments (incl. zero)
//   dir/*            single path segment
//   !pattern         negation (handled in matchGlobs)
//   exact/path.ts    exact match
//
// Patterns with multiple double-star segments (e.g. "a/**/b/**/x.ts") are fully supported.

/** Match a single file path against one glob pattern. */
export function matchGlob(filePath: string, pattern: string): boolean {
  const p = pattern.trim();

  // `*.ext` — extension match anywhere (no path component in the pattern).
  if (p.startsWith('*.') && !p.slice(1).includes('/')) {
    return filePath.endsWith(p.slice(1));
  }

  return matchSegments(filePath.split('/'), p.split('/'));
}

/**
 * Recursive segment matcher. `**` matches zero or more whole path segments,
 * so any number of `**` segments compose correctly.
 */
function matchSegments(path: string[], pat: string[]): boolean {
  if (pat.length === 0) return path.length === 0;

  const [head, ...rest] = pat;

  if (head === '**') {
    // Try consuming 0..n leading path segments with this `**`.
    for (let i = 0; i <= path.length; i++) {
      if (matchSegments(path.slice(i), rest)) return true;
    }
    return false;
  }

  if (path.length === 0) return false;
  if (!matchSegment(path[0]!, head!)) return false;
  return matchSegments(path.slice(1), rest);
}

/** One path segment vs a pattern segment whose `*` matches any run of non-`/` chars. */
function matchSegment(segment: string, pat: string): boolean {
  const escape = (s: string): string => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const re = '^' + pat.split('*').map(escape).join('[^/]*') + '$';
  return new RegExp(re).test(segment);
}

/**
 * Match a file against a list of globs. A file matches when it satisfies at
 * least one positive pattern and no negative (`!`) pattern.
 */
export function matchGlobs(filePath: string, globs: string[]): boolean {
  const positive = globs.filter((g) => !g.startsWith('!'));
  const negative = globs.filter((g) => g.startsWith('!')).map((g) => g.slice(1));
  if (!positive.some((g) => matchGlob(filePath, g))) return false;
  if (negative.some((g) => matchGlob(filePath, g))) return false;
  return true;
}
