import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { makeFilterExecutor } from '../src/filter-exec.js';

describe('makeFilterExecutor', () => {
  const run = makeFilterExecutor({ timeoutMs: 2000 });

  it('maps exit 0 to pass', async () => {
    expect(await run('sh -c "exit 0"', [])).toBe('pass');
  });

  it('maps exit 1 to reject', async () => {
    expect(await run('sh -c "exit 1"', [])).toBe('reject');
  });

  it('maps any other exit code to error (fail-open)', async () => {
    expect(await run('sh -c "exit 2"', [])).toBe('error');
  });

  it('treats a missing command as error', async () => {
    expect(await run('this-command-does-not-exist-xyz', [])).toBe('error');
  });

  it('treats a timeout as error', async () => {
    const slow = makeFilterExecutor({ timeoutMs: 50 });
    expect(await slow('sh -c "sleep 5"', [])).toBe('error');
  });

  describe('with matched paths passed as arguments', () => {
    let dir: string;
    let file: string;

    beforeAll(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'agent-rules-fexec-'));
      file = path.join(dir, 'src.ts');
      await writeFile(file, 'const x = 1; // needle\n', 'utf8');
    });

    afterAll(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('passes when grep finds the pattern in a supplied file', async () => {
      expect(await run('grep -q needle', [file])).toBe('pass');
    });

    it('rejects when grep does not find the pattern', async () => {
      expect(await run('grep -q haystack', [file])).toBe('reject');
    });
  });
});
