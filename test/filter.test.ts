import { describe, expect, it } from 'vitest';

import { deduplicateFindings, filterFindingsToDiff, prioritizeFindings } from '../src/filter.js';
import type { Finding } from '../src/types.js';

function finding(over: Partial<Finding>): Finding {
  return {
    path: 'src/a.ts',
    line: 1,
    body: 'x',
    ruleName: 'r',
    severity: 'suggestion',
    impact: 8,
    ...over,
  };
}

describe('deduplicateFindings', () => {
  it('keeps the first finding per path:line', () => {
    const out = deduplicateFindings([
      finding({ line: 1, body: 'first' }),
      finding({ line: 1, body: 'second' }),
      finding({ line: 2, body: 'third' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]!.body).toBe('first');
  });
});

describe('filterFindingsToDiff', () => {
  it('drops findings not present in the diff line map', () => {
    const valid = new Set(['src/a.ts:1']);
    const out = filterFindingsToDiff([finding({ line: 1 }), finding({ line: 9 })], valid);
    expect(out).toHaveLength(1);
    expect(out[0]!.line).toBe(1);
  });
});

describe('prioritizeFindings', () => {
  it('drops ignored findings', () => {
    expect(prioritizeFindings([finding({ severity: 'ignored', impact: 10 })])).toHaveLength(0);
  });

  it('always keeps blocking and nitpick', () => {
    const out = prioritizeFindings([
      finding({ severity: 'blocking', impact: 1 }),
      finding({ severity: 'nitpick', impact: 1 }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('drops suggestions below the impact threshold', () => {
    const out = prioritizeFindings(
      [
        finding({ severity: 'suggestion', impact: 6 }),
        finding({ severity: 'suggestion', impact: 7 }),
      ],
      { minSuggestionImpact: 7 },
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.impact).toBe(7);
  });

  it('applies the test-file discount', () => {
    const out = prioritizeFindings(
      [
        finding({ path: 'src/a.test.ts', severity: 'suggestion', impact: 8 }), // 8-2=6 < 7
        finding({ path: 'src/a.test.ts', severity: 'suggestion', impact: 9, line: 2 }), // 9-2=7
      ],
      { minSuggestionImpact: 7, testFileImpactDiscount: 2 },
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.impact).toBe(9);
  });
});
