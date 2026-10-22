import { z } from 'zod';
import type { Finding } from './types.js';
/** Schema for a single raw finding as returned by the model. */
export declare const FindingSchema: z.ZodArray<z.ZodObject<{
    path: z.ZodString;
    line: z.ZodNumber;
    body: z.ZodString;
    rule_name: z.ZodOptional<z.ZodString>;
    severity: z.ZodDefault<z.ZodEnum<{
        blocking: "blocking";
        suggestion: "suggestion";
        nitpick: "nitpick";
        ignored: "ignored";
    }>>;
    impact: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>>;
/**
 * Extract a JSON array substring from model output.
 *
 * Model results rarely arrive as a bare array: reasoning prose may contain
 * stray brackets (array indexing like `devices.trezor.b[0]`, code spans like
 * `keys ?? []`), and a first-'['→last-']' slice of such text fails JSON.parse,
 * silently losing every finding in the session. This scanner instead walks '['
 * candidates from the END of the text and returns the last span that parses as
 * a JSON array, bracket-balanced and respecting JSON strings and escapes.
 * Spans containing at least one object (the findings entries) win over bare
 * fragments like `[0]` that also happen to parse. The candidate scan is bounded
 * at {@link MAX_JSON_ARRAY_CANDIDATES}. Returns `null` if no array is found.
 */
export declare function extractJsonArray(text: string): string | null;
/**
 * Parse and validate findings from raw model output. Returns `[]` on any
 * parse/validation failure so a single malformed response never aborts a run.
 */
export declare function parseFindings(text: string, ruleName: string): Finding[];
