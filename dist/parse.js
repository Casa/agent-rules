import { z } from 'zod';
/** Schema for a single raw finding as returned by the model. */
export const FindingSchema = z.array(z.object({
    path: z.string(),
    line: z.number().int().positive(),
    body: z.string(),
    rule_name: z.string().optional(),
    severity: z.enum(['blocking', 'suggestion', 'nitpick', 'ignored']).default('suggestion'),
    impact: z.number().int().min(1).max(10).default(5),
}));
/** Cap on how many '[' candidates the scan tries from the end of the text. */
const MAX_JSON_ARRAY_CANDIDATES = 128;
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
export function extractJsonArray(text) {
    if (!text) {
        return null;
    }
    const opens = [];
    let openIdx = text.indexOf('[');
    while (openIdx !== -1) {
        opens.push(openIdx);
        openIdx = text.indexOf('[', openIdx + 1);
    }
    let fallback = null;
    for (let k = opens.length - 1, attempts = 0; k >= 0 && attempts < MAX_JSON_ARRAY_CANDIDATES; k--, attempts++) {
        const span = balancedJsonSpan(text, opens[k]);
        if (span === null) {
            continue;
        }
        let parsed;
        try {
            parsed = JSON.parse(span);
        }
        catch {
            continue;
        }
        if (!Array.isArray(parsed)) {
            continue;
        }
        const hasObjectEntry = parsed.some((entry) => typeof entry === 'object' && entry !== null && !Array.isArray(entry));
        if (hasObjectEntry) {
            return span;
        }
        if (fallback === null) {
            // Remember the latest empty/non-object array (the scan runs end-to-start);
            // an object-bearing array found later in the scan (earlier in the text) wins.
            fallback = span;
        }
    }
    return fallback;
}
/**
 * Bracket-balanced span starting at the '[' at `start`, respecting JSON strings
 * and escapes. Returns null when no balanced close exists.
 */
function balancedJsonSpan(text, start) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (c === '\\') {
            if (inString) {
                escaped = true;
            }
            continue;
        }
        if (c === '"') {
            inString = !inString;
            continue;
        }
        if (inString) {
            continue;
        }
        if (c === '[') {
            depth++;
        }
        else if (c === ']') {
            depth--;
            if (depth === 0) {
                return text.slice(start, i + 1);
            }
        }
    }
    return null;
}
/**
 * Parse and validate findings from raw model output. Returns `[]` on any
 * parse/validation failure so a single malformed response never aborts a run.
 */
export function parseFindings(text, ruleName) {
    const json = extractJsonArray(text);
    if (!json)
        return [];
    let data;
    try {
        data = JSON.parse(json);
    }
    catch {
        return [];
    }
    const result = FindingSchema.safeParse(data);
    if (!result.success)
        return [];
    return result.data.map((item) => ({
        path: item.path,
        line: Math.floor(item.line),
        body: item.body,
        ruleName: item.rule_name ?? ruleName,
        severity: item.severity,
        impact: item.impact,
    }));
}
