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
 * Extract a JSON array substring from model output. Strips markdown code fences
 * and any prose surrounding the array. Returns `null` if no array is found.
 */
export declare function extractJsonArray(text: string): string | null;
/**
 * Parse and validate findings from raw model output. Returns `[]` on any
 * parse/validation failure so a single malformed response never aborts a run.
 */
export declare function parseFindings(text: string, ruleName: string): Finding[];
