import { describe, expect, it } from 'vitest';

import { extractJsonArray, parseFindings } from '../src/parse.js';

describe('extractJsonArray', () => {
  it('strips json code fences', () => {
    expect(extractJsonArray('```json\n[1,2]\n```')).toBe('[1,2]');
    expect(extractJsonArray('```\n[3]\n```')).toBe('[3]');
  });

  it('extracts an array embedded in prose', () => {
    expect(extractJsonArray('Here you go: [ {"a":1} ] thanks')).toBe('[ {"a":1} ]');
  });

  it('returns null when there is no array', () => {
    expect(extractJsonArray('no array here')).toBeNull();
  });
});

describe('parseFindings', () => {
  it('validates and maps fields, falling back to the rule name', () => {
    const text = JSON.stringify([
      { path: 'src/a.ts', line: 4, body: 'fix it', severity: 'blocking', impact: 9 },
    ]);
    const out = parseFindings(text, 'my-rule');
    expect(out).toEqual([
      {
        path: 'src/a.ts',
        line: 4,
        body: 'fix it',
        ruleName: 'my-rule',
        severity: 'blocking',
        impact: 9,
      },
    ]);
  });

  it('prefers an explicit rule_name', () => {
    const text = JSON.stringify([{ path: 'a', line: 1, body: 'b', rule_name: 'explicit' }]);
    expect(parseFindings(text, 'fallback')[0]!.ruleName).toBe('explicit');
  });

  it('defaults severity and impact when omitted', () => {
    const out = parseFindings(JSON.stringify([{ path: 'a', line: 1, body: 'b' }]), 'r');
    expect(out[0]!.severity).toBe('suggestion');
    expect(out[0]!.impact).toBe(5);
  });

  it('returns [] on invalid JSON', () => {
    expect(parseFindings('not json', 'r')).toEqual([]);
  });

  it('returns [] on schema violations', () => {
    expect(parseFindings(JSON.stringify([{ path: 'a', line: -1, body: 'b' }]), 'r')).toEqual([]);
  });

  it('returns [] for an empty array', () => {
    expect(parseFindings('[]', 'r')).toEqual([]);
  });
});
