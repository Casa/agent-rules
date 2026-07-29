export type {
  AgentRule,
  Finding,
  Severity,
  ReviewResult,
  RunOptions,
  LLMAdapter,
  DiffSource,
  FilterResult,
  FilterExecutor,
} from './types.js';

export { collectRuleFiles, parseRuleFile, loadRules } from './rule.js';
export { matchGlob, matchGlobs } from './glob.js';
export { extractChangedFiles, extractDiffSections, buildDiffLineMap, getDiff } from './diff.js';
export { buildReviewPrompt } from './prompt.js';
export {
  deduplicateFindings,
  filterFindingsToDiff,
  prioritizeFindings,
  isTestFile,
} from './filter.js';
export { FindingSchema, extractJsonArray, parseFindings } from './parse.js';
export { makeFilterExecutor } from './filter-exec.js';
export type { FilterExecOptions } from './filter-exec.js';
export { runReview, discoverApplicableRules } from './runner.js';
export type { DiscoveryResult, DiscoverOptions } from './runner.js';
export { buildHookContext, toRepoRelativePath } from './hook-context.js';
export type { HookContextOptions, HookContextResult } from './hook-context.js';
export { mergeHookSettings, HOOK_MATCHER, HOOK_COMMAND } from './settings.js';
export type { ClaudeSettings, MergeHookSettingsResult } from './settings.js';
