import type { AgentRule } from './types.js';
/**
 * Build the review prompt for a single rule. The scoped diff is inlined; the
 * model is asked to return a JSON array of findings.
 */
export declare function buildReviewPrompt(rule: AgentRule, diff: string, ticketContext?: string): string;
