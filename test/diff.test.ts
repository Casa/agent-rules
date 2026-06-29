import { describe, expect, it } from 'vitest';

import { buildDiffLineMap, extractChangedFiles, extractDiffSections } from '../src/diff.js';

const DIFF = [
  'diff --git a/src/foo.ts b/src/foo.ts',
  'index 1111111..2222222 100644',
  '--- a/src/foo.ts',
  '+++ b/src/foo.ts',
  '@@ -1,3 +1,4 @@',
  ' const a = 1;',
  '-const b = 2;',
  '+const b = 3;',
  '+const c = 4;',
  ' export { a };',
  'diff --git a/src/bar.ts b/src/bar.ts',
  'index 3333333..4444444 100644',
  '--- a/src/bar.ts',
  '+++ b/src/bar.ts',
  '@@ -10,2 +10,3 @@',
  ' const x = 1;',
  '+const y = 2;',
  ' const z = 3;',
].join('\n');

describe('extractChangedFiles', () => {
  it('lists the b/ paths', () => {
    expect(extractChangedFiles(DIFF)).toEqual(['src/foo.ts', 'src/bar.ts']);
  });
});

describe('extractDiffSections', () => {
  it('keeps only matching file sections', () => {
    const section = extractDiffSections(DIFF, new Set(['src/foo.ts']));
    expect(section).toContain('a/src/foo.ts');
    expect(section).not.toContain('a/src/bar.ts');
  });

  it('returns null when nothing matches', () => {
    expect(extractDiffSections(DIFF, new Set(['nope.ts']))).toBeNull();
  });
});

describe('buildDiffLineMap', () => {
  it('marks added and context lines on the right side', () => {
    const map = buildDiffLineMap(DIFF);
    expect(map.has('src/foo.ts:1')).toBe(true); // context
    expect(map.has('src/foo.ts:2')).toBe(true); // +const b
    expect(map.has('src/foo.ts:3')).toBe(true); // +const c
    expect(map.has('src/foo.ts:4')).toBe(true); // context
    expect(map.has('src/bar.ts:10')).toBe(true);
    expect(map.has('src/bar.ts:11')).toBe(true);
    expect(map.has('src/bar.ts:12')).toBe(true);
  });

  it('does not include deleted-line positions', () => {
    // The deleted "const b = 2;" never occupies a right-side line number.
    const map = buildDiffLineMap(DIFF);
    expect(map.has('src/foo.ts:5')).toBe(false);
  });
});
