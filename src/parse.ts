import { z } from 'zod';

import type { Finding } from './types.js';

/** Schema for a single raw finding as returned by the model. */
export const FindingSchema = z.array(
  z.object({
    path: z.string(),
    line: z.number().int().positive(),
    body: z.string(),
    rule_name: z.string().optional(),
    severity: z.enum(['blocking', 'suggestion', 'nitpick', 'ignored']).default('suggestion'),
    impact: z.number().int().min(1).max(10).default(5),
  }),
);

/**
 * Extract a JSON array substring from model output. Strips markdown code fences
 * and any prose surrounding the array. Returns `null` if no array is found.
 */
export function extractJsonArray(text: string): string | null {
  let t = text.trim();

  // Strip a leading ```json / ``` fence and trailing ``` fence.
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(t);
  if (fence) t = fence[1]!.trim();

  if (t.startsWith('[')) return t;

  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    return t.slice(start, end + 1);
  }
  return null;
}

/**
 * Parse and validate findings from raw model output. Returns `[]` on any
 * parse/validation failure so a single malformed response never aborts a run.
 */
export function parseFindings(text: string, ruleName: string): Finding[] {
  const json = extractJsonArray(text);
  if (!json) return [];

  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }

  const result = FindingSchema.safeParse(data);
  if (!result.success) return [];

  return result.data.map((item) => ({
    path: item.path,
    line: Math.floor(item.line),
    body: item.body,
    ruleName: item.rule_name ?? ruleName,
    severity: item.severity,
    impact: item.impact,
  }));
}
