import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
/** Recursively collect `.md` and `.mdc` rule files from a directory. */
export async function collectRuleFiles(dir) {
    const results = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...(await collectRuleFiles(full)));
        }
        else if (entry.name.endsWith('.mdc') || entry.name.endsWith('.md')) {
            results.push(full);
        }
    }
    return results.sort();
}
/**
 * Parse a rule file, extracting front-matter fields and the Markdown body.
 *
 * Supports both inline (`globs: a, b`) and YAML-list globs. Returns a rule with
 * empty `globs` when there is no front-matter (callers then discard it).
 */
export function parseRuleFile(filename, raw) {
    const fallbackName = filename.replace(/\.mdc$/, '').replace(/\.md$/, '');
    const lines = raw.split('\n');
    if (lines[0]?.trim() !== '---') {
        return { name: fallbackName, content: raw.trim(), globs: [], reviewSkip: false };
    }
    const closing = lines.indexOf('---', 1);
    if (closing === -1) {
        return { name: fallbackName, content: raw.trim(), globs: [], reviewSkip: false };
    }
    const globs = [];
    let description = '';
    let reviewSkip = false;
    let filter = '';
    let inGlobsList = false;
    for (const line of lines.slice(1, closing)) {
        const trimmed = line.trim();
        // YAML list item under `globs:` (e.g. `  - "**/*.ts"`).
        if (inGlobsList) {
            const item = /^-\s+(.+)$/.exec(trimmed);
            if (item) {
                globs.push(stripQuotes(item[1]));
                continue;
            }
            inGlobsList = false;
        }
        const inlineGlobs = /^globs:\s*(.+)$/i.exec(trimmed);
        if (inlineGlobs) {
            for (const g of inlineGlobs[1].split(',')) {
                const v = stripQuotes(g.trim());
                if (v)
                    globs.push(v);
            }
            continue;
        }
        if (/^globs:\s*$/i.test(trimmed)) {
            inGlobsList = true;
            continue;
        }
        const desc = /^description:\s*(.+)$/i.exec(trimmed);
        if (desc) {
            description = stripQuotes(desc[1].trim());
            continue;
        }
        const skip = /^reviewskip:\s*(.+)$/i.exec(trimmed);
        if (skip) {
            reviewSkip = skip[1].trim().toLowerCase() === 'true';
            continue;
        }
        const filterMatch = /^filter:\s*(.+)$/i.exec(trimmed);
        if (filterMatch) {
            filter = stripQuotes(filterMatch[1].trim()).trim();
        }
    }
    const content = lines
        .slice(closing + 1)
        .join('\n')
        .trim();
    const rule = { name: description || fallbackName, content, globs, reviewSkip };
    if (filter)
        rule.filter = filter;
    return rule;
}
/** Read and parse every rule file under `dir`. */
export async function loadRules(dir) {
    const files = await collectRuleFiles(dir);
    const rules = [];
    for (const file of files) {
        const raw = await readFile(file, 'utf8');
        const rule = parseRuleFile(path.basename(file), raw);
        rule.filePath = file;
        rules.push(rule);
    }
    return rules;
}
function stripQuotes(s) {
    return s.replace(/^["']|["']$/g, '');
}
