import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildHookContext, toRepoRelativePath } from '../src/hook-context.js';
import type { FilterExecutor } from '../src/types.js';

describe('toRepoRelativePath', () => {
  const root = '/repo';

  it('relativizes an absolute path under the project root', () => {
    expect(toRepoRelativePath('/repo/src/foo.ts', root)).toBe('src/foo.ts');
  });

  it('returns null for a path outside the project root', () => {
    expect(toRepoRelativePath('/elsewhere/foo.ts', root)).toBeNull();
  });

  it('returns null for the project root itself', () => {
    expect(toRepoRelativePath('/repo', root)).toBeNull();
  });

  it('resolves an already-relative path against the project root', () => {
    expect(toRepoRelativePath('src/foo.ts', root)).toBe('src/foo.ts');
  });
});

describe('buildHookContext', () => {
  let rulesDir: string;

  beforeAll(async () => {
    rulesDir = await mkdtemp(path.join(tmpdir(), 'agent-rules-hook-test-'));
    const write = (name: string, body: string): Promise<void> =>
      writeFile(path.join(rulesDir, name), body, 'utf8');

    await write(
      'payments.md',
      '---\ndescription: Payments\nglobs: "src/payments/**"\n---\nBody A.',
    );
    await write(
      'skip.md',
      '---\ndescription: Skip\nglobs: "src/payments/**"\nreviewSkip: true\n---\nBody B.',
    );
    await write('noglob.md', '---\ndescription: NoGlob\n---\nx');
    await write('other.md', '---\ndescription: Other\nglobs: "other/**"\n---\nx');
    await write(
      'filtered.md',
      '---\ndescription: Filtered\nglobs: "src/payments/**"\nfilter: "check"\n---\nBody F.',
    );
  });

  afterAll(async () => {
    await rm(rulesDir, { recursive: true, force: true });
  });

  it('injects rules whose globs match, including reviewSkip ones', async () => {
    const result = await buildHookContext({
      rulesDir,
      filePath: 'src/payments/foo.ts',
      filterExecutor: () => Promise.resolve('pass'),
    });

    expect(result.injectedRuleKeys.sort()).toEqual(['filtered.md', 'payments.md', 'skip.md']);
    expect(result.additionalContext).toContain('Body A.');
    expect(result.additionalContext).toContain('Body B.'); // reviewSkip does not exclude
  });

  it('returns null additionalContext when nothing matches', async () => {
    const result = await buildHookContext({ rulesDir, filePath: 'unrelated/file.ts' });
    expect(result.additionalContext).toBeNull();
    expect(result.injectedRuleKeys).toEqual([]);
  });

  it('drops a rule whose filter rejects', async () => {
    const result = await buildHookContext({
      rulesDir,
      filePath: 'src/payments/foo.ts',
      filterExecutor: () => Promise.resolve('reject'),
    });
    expect(result.injectedRuleKeys).not.toContain('filtered.md');
  });

  it('fails open (applies) when the filter errors', async () => {
    const result = await buildHookContext({
      rulesDir,
      filePath: 'src/payments/foo.ts',
      filterExecutor: () => Promise.resolve('error'),
    });
    expect(result.injectedRuleKeys).toContain('filtered.md');
  });

  it('calls the filter executor with the single touched path', async () => {
    const calls: { command: string; paths: string[] }[] = [];
    const filterExecutor: FilterExecutor = (command, paths) => {
      calls.push({ command, paths });
      return Promise.resolve('pass');
    };
    await buildHookContext({ rulesDir, filePath: 'src/payments/foo.ts', filterExecutor });
    expect(calls).toEqual([{ command: 'check', paths: ['src/payments/foo.ts'] }]);
  });

  it('excludes rules already marked as injected (dedup), still applying fresh ones', async () => {
    const result = await buildHookContext({
      rulesDir,
      filePath: 'src/payments/foo.ts',
      filterExecutor: () => Promise.resolve('pass'),
      alreadyInjected: new Set(['payments.md', 'skip.md', 'filtered.md']),
    });
    expect(result.injectedRuleKeys).toEqual([]);
    expect(result.additionalContext).toBeNull();
  });

  it('applies only the rules not yet in alreadyInjected (mixed dedup case)', async () => {
    const result = await buildHookContext({
      rulesDir,
      filePath: 'src/payments/foo.ts',
      filterExecutor: () => Promise.resolve('pass'),
      alreadyInjected: new Set(['payments.md']),
    });
    expect(result.injectedRuleKeys.sort()).toEqual(['filtered.md', 'skip.md']);
    expect(result.additionalContext).not.toContain('Body A.');
    expect(result.additionalContext).toContain('Body B.');
  });

  it('ignores rule filters entirely when runFilters is false', async () => {
    let called = false;
    const result = await buildHookContext({
      rulesDir,
      filePath: 'src/payments/foo.ts',
      runFilters: false,
      filterExecutor: () => {
        called = true;
        return Promise.resolve('reject');
      },
    });
    expect(called).toBe(false);
    expect(result.injectedRuleKeys).toContain('filtered.md');
  });

  it('resolves a relative rulesDir against cwd, not process.cwd()', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'agent-rules-hook-cwd-'));
    await mkdir(path.join(projectRoot, '.agent', 'rules'), { recursive: true });
    await writeFile(
      path.join(projectRoot, '.agent', 'rules', 'x.md'),
      '---\ndescription: X\nglobs: "src/**"\n---\nBody X.',
      'utf8',
    );
    try {
      const result = await buildHookContext({
        rulesDir: '.agent/rules', // relative — must resolve against cwd below, not process.cwd()
        filePath: 'src/foo.ts',
        cwd: projectRoot,
      });
      expect(result.additionalContext).toContain('Body X.');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

describe('buildHookContext — dedup key uniqueness', () => {
  let rulesDir: string;

  beforeAll(async () => {
    rulesDir = await mkdtemp(path.join(tmpdir(), 'agent-rules-hook-collide-'));
    await mkdir(path.join(rulesDir, 'frontend'), { recursive: true });
    await mkdir(path.join(rulesDir, 'api'), { recursive: true });
    // Two rules with the *same* description (and so the same rule.name) in
    // different subdirectories, with different globs and different bodies.
    await writeFile(
      path.join(rulesDir, 'frontend', 'security.md'),
      '---\ndescription: Security\nglobs: "frontend/**"\n---\nFrontend security body.',
      'utf8',
    );
    await writeFile(
      path.join(rulesDir, 'api', 'security.md'),
      '---\ndescription: Security\nglobs: "api/**"\n---\nApi security body.',
      'utf8',
    );
  });

  afterAll(async () => {
    await rm(rulesDir, { recursive: true, force: true });
  });

  it('injects both same-named rules independently instead of one suppressing the other', async () => {
    const alreadyInjected = new Set<string>();

    const first = await buildHookContext({
      rulesDir,
      filePath: 'frontend/app.ts',
      alreadyInjected,
    });
    expect(first.additionalContext).toContain('Frontend security body.');
    for (const key of first.injectedRuleKeys) alreadyInjected.add(key);

    // Same rule.name ("Security"), different rule, different file: must still
    // be injected — a name-keyed dedup would incorrectly suppress this.
    const second = await buildHookContext({
      rulesDir,
      filePath: 'api/handler.ts',
      alreadyInjected,
    });
    expect(second.additionalContext).toContain('Api security body.');
  });
});
