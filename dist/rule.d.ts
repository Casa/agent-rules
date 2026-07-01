import type { AgentRule } from './types.js';
/** Recursively collect `.md` and `.mdc` rule files from a directory. */
export declare function collectRuleFiles(dir: string): Promise<string[]>;
/**
 * Parse a rule file, extracting front-matter fields and the Markdown body.
 *
 * Supports both inline (`globs: a, b`) and YAML-list globs. Returns a rule with
 * empty `globs` when there is no front-matter (callers then discard it).
 */
export declare function parseRuleFile(filename: string, raw: string): AgentRule;
/** Read and parse every rule file under `dir`. */
export declare function loadRules(dir: string): Promise<AgentRule[]>;
