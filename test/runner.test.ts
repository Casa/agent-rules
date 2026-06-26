import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runReview } from '../src/runner.js';
import type { LLMAdapter } from '../src/types.js';

const DIFF = [
  'diff --git a/src/foo.ts b/src/foo.ts',
  'index 1111111..2222222 100644',
  '--- a/src/foo.ts',
  '+++ b/src/foo.ts',
  '@@ -1,2 +1,3 @@',
  ' const a = 1;',
  '+const b = 2;',
  ' export { a };',
].join('\n');

let rulesDir: string;

beforeAll(async () => {
  rulesDir = await mkdtemp(path.join(tmpdir(), 'agent-rules-test-'));
  const write = (name: string, body: string): Promise<void> =>
    writeFile(path.join(rulesDir, name), body, 'utf8');

  await write('rule-a.md', '---\ndescription: Rule A\nglobs: "src/**/*.ts"\n---\nCheck A.');
  await write('rule-b.md', '---\ndescription: Rule B\nglobs: "src/**/*.ts"\n---\nCheck B.');
  await write('skip.md', '---\ndescription: Skip\nglobs: "src/**/*.ts"\nreviewSkip: true\n---\nx');
  await write('noglob.md', '---\ndescription: NoGlob\n---\nx');
  await write('nomatch.md', '---\ndescription: NoMatch\nglobs: "other/**/*.ts"\n---\nx');
});

afterAll(async () => {
  await rm(rulesDir, { recursive: true, force: true });
});

describe('runReview', () => {
  it('reviews applicable rules and records skips', async () => {
    const llm: LLMAdapter = {
      run: (prompt) =>
        Promise.resolve(
          prompt.includes('Rule A')
            ? JSON.stringify([
                {
                  path: 'src/foo.ts',
                  line: 2,
                  body: 'no magic numbers',
                  severity: 'blocking',
                  impact: 9,
                },
              ])
            : '[]',
        ),
    };

    const result = await runReview({ rulesDir, diff: DIFF, llm });

    expect(result.ruleCount).toBe(2); // Rule A + Rule B were evaluated
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ path: 'src/foo.ts', line: 2, ruleName: 'Rule A' });
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        'Skip (reviewSkip)',
        'NoGlob (no globs)',
        'NoMatch (no matching files)',
      ]),
    );
  });

  it('isolates a failing rule without aborting the run', async () => {
    const llm: LLMAdapter = {
      run: (prompt) => {
        if (prompt.includes('Rule B')) return Promise.reject(new Error('boom'));
        return Promise.resolve(
          JSON.stringify([
            { path: 'src/foo.ts', line: 2, body: 'x', severity: 'blocking', impact: 9 },
          ]),
        );
      },
    };

    const result = await runReview({ rulesDir, diff: DIFF, llm });

    expect(result.findings).toHaveLength(1); // Rule A still produced a finding
    expect(result.skipped).toEqual(
      expect.arrayContaining([expect.stringContaining('Rule B (error: boom)')]),
    );
  });

  it('drops findings on lines outside the diff', async () => {
    const llm: LLMAdapter = {
      run: () =>
        Promise.resolve(
          JSON.stringify([
            { path: 'src/foo.ts', line: 999, body: 'x', severity: 'blocking', impact: 9 },
          ]),
        ),
    };
    const result = await runReview({ rulesDir, diff: DIFF, llm });
    expect(result.findings).toHaveLength(0);
  });
});
