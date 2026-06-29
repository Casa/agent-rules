import { describe, expect, it } from 'vitest';

import { parseRuleFile } from '../src/rule.js';

describe('parseRuleFile', () => {
  it('parses YAML-list globs and description', () => {
    const raw = [
      '---',
      'description: No console logs',
      'globs:',
      '  - "src/**/*.ts"',
      '  - "!src/**/*.test.ts"',
      'reviewSkip: false',
      '---',
      '',
      '# Body',
      'Use the logger.',
    ].join('\n');

    const rule = parseRuleFile('no-console.md', raw);
    expect(rule.name).toBe('No console logs');
    expect(rule.globs).toEqual(['src/**/*.ts', '!src/**/*.test.ts']);
    expect(rule.reviewSkip).toBe(false);
    expect(rule.content).toBe('# Body\nUse the logger.');
  });

  it('parses inline comma-separated globs', () => {
    const raw = ['---', 'globs: a/**/*.ts, b/**/*.ts', '---', 'body'].join('\n');
    const rule = parseRuleFile('inline.mdc', raw);
    expect(rule.globs).toEqual(['a/**/*.ts', 'b/**/*.ts']);
  });

  it('honors reviewSkip: true', () => {
    const raw = ['---', 'globs: "*.ts"', 'reviewSkip: true', '---', 'body'].join('\n');
    expect(parseRuleFile('x.md', raw).reviewSkip).toBe(true);
  });

  it('falls back to filename when description is absent', () => {
    const raw = ['---', 'globs: "*.ts"', '---', 'body'].join('\n');
    expect(parseRuleFile('my-rule.md', raw).name).toBe('my-rule');
  });

  it('returns empty globs when there is no front-matter', () => {
    const rule = parseRuleFile('plain.md', '# Just markdown');
    expect(rule.globs).toEqual([]);
    expect(rule.name).toBe('plain');
    expect(rule.content).toBe('# Just markdown');
  });
});
