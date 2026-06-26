import { describe, expect, it } from 'vitest';

import { matchGlob, matchGlobs } from '../src/glob.js';

describe('matchGlob', () => {
  it('matches *.ext anywhere in the tree', () => {
    expect(matchGlob('a.ts', '*.ts')).toBe(true);
    expect(matchGlob('src/a.ts', '*.ts')).toBe(true);
    expect(matchGlob('a.tsx', '*.ts')).toBe(false);
  });

  it('matches dir/**/*.ext recursively, including zero segments', () => {
    expect(matchGlob('packages/foo/bar.ts', 'packages/**/*.ts')).toBe(true);
    expect(matchGlob('packages/bar.ts', 'packages/**/*.ts')).toBe(true);
    expect(matchGlob('other/bar.ts', 'packages/**/*.ts')).toBe(false);
  });

  it('matches dir/** for anything under a directory', () => {
    expect(matchGlob('packages/a/b.ts', 'packages/**')).toBe(true);
    expect(matchGlob('packages', 'packages/**')).toBe(true);
    expect(matchGlob('pkg/a.ts', 'packages/**')).toBe(false);
  });

  it('matches dir/* only one level deep', () => {
    expect(matchGlob('src/a.ts', 'src/*')).toBe(true);
    expect(matchGlob('src/a/b.ts', 'src/*')).toBe(false);
  });

  it('supports multiple ** segments', () => {
    expect(matchGlob('a/1/2/b/3/4/x.ts', 'a/**/b/**/x.ts')).toBe(true);
    expect(matchGlob('a/b/x.ts', 'a/**/b/**/x.ts')).toBe(true);
    expect(matchGlob('a/1/c/3/x.ts', 'a/**/b/**/x.ts')).toBe(false);
  });

  it('matches exact paths', () => {
    expect(matchGlob('README.md', 'README.md')).toBe(true);
    expect(matchGlob('docs/README.md', 'README.md')).toBe(false);
  });
});

describe('matchGlobs', () => {
  it('requires a positive match and no negative match', () => {
    const globs = ['src/**/*.ts', '!src/**/*.test.ts'];
    expect(matchGlobs('src/foo.ts', globs)).toBe(true);
    expect(matchGlobs('src/foo.test.ts', globs)).toBe(false);
    expect(matchGlobs('lib/foo.ts', globs)).toBe(false);
  });

  it('returns false when there is no positive pattern', () => {
    expect(matchGlobs('src/foo.ts', ['!src/**/*.ts'])).toBe(false);
  });
});
