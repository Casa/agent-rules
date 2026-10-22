import { describe, expect, it } from 'vitest';

import { extractJsonArray, parseFindings } from '../src/parse.js';

// ---------------------------------------------------------------------------
// Victim corpus: resultText shapes recovered from the PD-1768 harness-trial
// run artifacts (2026-10-21, S3 run folders). Prose fragments and JSON
// structure are faithful to the recorded sessions; long bodies are condensed.
// Each constant names its victim (run + session).
// ---------------------------------------------------------------------------

// Q03-B-r2 session a22: reasoning prose containing code-span brackets
// (`keys ?? []`) and array indexing (devices.trezor.b[0]) followed by a valid
// findings array. The previous first-'['→last-']' slice died on the prose
// bracket; both suggestions were silently lost.
const VICTIM_Q03_B_R2_A22 = [
  "I've completed the review against the TypeScript guidelines (strict typing, formatting, function style, validation rules).",
  'The new code complies with most rules: it uses the `function` keyword for pure functions, curly braces in conditionals,',
  'no `any` casts, no new enums, early guard checks, and defensive edge-case handling (`keys ?? []`, null `keyId` guards).',
  'The assertion `devices.trezor.b[0].deviceType` matches the established pattern in the same file.',
  '',
  JSON.stringify(
    [
      {
        path: 'packages/vault-api/server/services/recoveryRequestRequirement.service.ts',
        line: 190,
        rule_name: 'Rules for all TypeScript files',
        body: 'Parameter list exceeds printWidth of 120 (packages/vault-api/.prettierrc).',
        severity: 'suggestion',
        impact: 5,
      },
      {
        path: 'packages/vault-api/server/api/tests/recoveryData/recoveryRequestRequirement.service.spec.ts',
        line: 46,
        rule_name: 'Rules for all TypeScript files',
        body: 'The one-line `assert` calls exceed the package prettier `printWidth` of 120.',
        severity: 'suggestion',
        impact: 4,
      },
    ],
    null,
    2,
  ),
].join('\n');

// Q03-B-r4 session a22: prose clean-verdict with bracket poison, then [].
const VICTIM_Q03_B_R4_A22 = [
  'The import `DEVICE_TYPE` remains used (line 556) and `devices.trezor.b[0].deviceType` matches the',
  'established pattern in the same file (lines 264, 281).',
  '',
  'No violations of the TypeScript rules were found in the diff.',
  '',
  '[]',
].join('\n');

// Q01-A-main session s21: double empty-array output.
const VICTIM_Q01_A_S21 = '[]\n[]';

// Q01-B-r2 s0 / Q10-B-r2 s1: nested empty arrays — previously a whole-array
// schema failure that dropped the session.
const VICTIM_NESTED_EMPTY = '[\n  []\n]';

// Q03-B-r3 session s14: died mid-reasoning, no JSON anywhere.
const VICTIM_Q03_B_R3_S14 =
  'Checking the changed file names now. All changed files use camelCase so far, but the signature looks like it exceeds that. Let me check exact line lengths in the changed files.';

// Q03-B-r3 session s18: imp-7 finding on a test file whose body carries
// brackets inside JSON string values (devices.trezor.b[0], update({...})).
const VICTIM_Q03_B_R3_S18 = JSON.stringify(
  [
    {
      path: 'packages/vault-api/server/api/tests/wallets/signature.webCreate.integration.ts',
      line: 320,
      rule_name: 'Test behavior rules',
      body: "This change makes the test pass by coincidence. A keyId-based pending signature already has deviceType 'trezor' (the home key is devices.trezor.b[0]; see the assertion at line 133). Restore a known mismatch before completing.",
      severity: 'suggestion',
      impact: 7,
    },
  ],
  null,
  2,
);

/** Parse the span returned by extractJsonArray; the contract guarantees parseability. */
function parseSpan(text: string): unknown {
  const span = extractJsonArray(text);
  expect(span).not.toBeNull();
  return JSON.parse(span as string);
}

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

  it('recovers findings when reasoning prose contains stray brackets (Q03-B-r2 a22)', () => {
    const recovered = parseSpan(VICTIM_Q03_B_R2_A22) as unknown[];
    expect(recovered).toHaveLength(2);
    expect(recovered[0]).toMatchObject({
      path: 'packages/vault-api/server/services/recoveryRequestRequirement.service.ts',
      line: 190,
      impact: 5,
    });
    expect(recovered[1]).toMatchObject({ line: 46, impact: 4 });
  });

  it('takes the last array for double empty-array output (Q01-A-main s21)', () => {
    expect(parseSpan(VICTIM_Q01_A_S21)).toEqual([]);
  });

  it('salvages nested empty arrays instead of failing the whole array (Q01-B-r2 s0)', () => {
    expect(parseSpan(VICTIM_NESTED_EMPTY)).toEqual([]);
  });

  it('prefers the object-bearing answer over a later empty-array fragment', () => {
    const text = `${JSON.stringify([
      { path: 'a.ts', line: 1, body: 'x', severity: 'suggestion', impact: 8 },
    ])}\nDone — see devices.trezor.b[0] and keys ?? [] for context.`;
    const recovered = parseSpan(text) as unknown[];
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({ path: 'a.ts' });
  });

  it('returns the empty verdict array after prose (Q03-B-r4 a22)', () => {
    expect(parseSpan(VICTIM_Q03_B_R4_A22)).toEqual([]);
  });

  it('honors brackets inside JSON string values (Q03-B-r3 s18)', () => {
    const recovered = parseSpan(`Analysis complete.\n\n${VICTIM_Q03_B_R3_S18}`) as unknown[];
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({ impact: 7 });
  });

  it('honors escaped quotes inside JSON string values', () => {
    const text = String.raw`[{"path":"a.ts","line":1,"body":"say \" then ] bracket","severity":"suggestion","impact":8}]`;
    expect(parseSpan(text)).toHaveLength(1);
  });

  it('ignores a stray backslash outside JSON strings', () => {
    expect(parseSpan(String.raw`x [a\b] y []`)).toEqual([]);
  });

  it('returns null for prose-only text (Q03-B-r3 s14 mid-reasoning death)', () => {
    expect(extractJsonArray(VICTIM_Q03_B_R3_S14)).toBeNull();
  });

  it('returns null for empty text', () => {
    expect(extractJsonArray('')).toBeNull();
  });

  it('bounds the candidate scan when text is full of unbalanced brackets', () => {
    expect(extractJsonArray(`x ${'['.repeat(200)}`)).toBeNull();
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
