import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadInjected, saveInjected } from '../src/hook-state.js';

describe('hook session state', () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(tmpdir(), 'agent-rules-hook-state-'));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('returns an empty set when no state exists yet', async () => {
    const injected = await loadInjected('session-a', baseDir);
    expect(injected.size).toBe(0);
  });

  it('round-trips a saved set', async () => {
    await saveInjected('session-a', new Set(['Rule A', 'Rule B']), baseDir);
    const injected = await loadInjected('session-a', baseDir);
    expect([...injected].sort()).toEqual(['Rule A', 'Rule B']);
  });

  it('keeps state isolated per session id', async () => {
    await saveInjected('session-a', new Set(['Rule A']), baseDir);
    await saveInjected('session-b', new Set(['Rule B']), baseDir);
    expect([...(await loadInjected('session-a', baseDir))]).toEqual(['Rule A']);
    expect([...(await loadInjected('session-b', baseDir))]).toEqual(['Rule B']);
  });

  it('treats corrupt state as empty rather than throwing', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(baseDir, { recursive: true });
    await writeFile(path.join(baseDir, 'session-c.json'), 'not json', 'utf8');
    const injected = await loadInjected('session-c', baseDir);
    expect(injected.size).toBe(0);
  });
});
