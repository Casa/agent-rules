/** A parsed rule file: front-matter fields plus the Markdown body. */
export interface AgentRule {
  /** From the `description` front-matter field, or the filename (sans extension). */
  name: string;
  /** Markdown body after the closing `---`. */
  content: string;
  /** Glob patterns controlling which changed files this rule applies to. */
  globs: string[];
  /** When `true`, the rule is parsed but excluded from review. */
  reviewSkip?: boolean;
  /**
   * Optional second-stage applicability command, run after a glob match. The
   * glob-matched changed file paths are appended as arguments. Exit `0` ⇒ the
   * rule applies, `1` ⇒ it is skipped, any other outcome (incl. spawn failure
   * or timeout) ⇒ fail-open (applies). Absent ⇒ no second-stage check.
   */
  filter?: string;
  /** Absolute path to the source rule file. Set by {@link loadRules}. */
  filePath?: string;
}

/** Outcome of running a rule's {@link AgentRule.filter} command. */
export type FilterResult = 'pass' | 'reject' | 'error';

/**
 * Runs a rule's `filter` command against the matched paths and reports whether
 * the rule applies. The default implementation spawns a subprocess; callers may
 * inject their own (e.g. for tests or sandboxing).
 */
export type FilterExecutor = (command: string, paths: string[]) => Promise<FilterResult>;

export type Severity = 'blocking' | 'suggestion' | 'nitpick' | 'ignored';

/** A single reviewer finding, anchored to a line in the diff. */
export interface Finding {
  /** File path (without a leading `b/`). */
  path: string;
  /** Line number in the new version of the file. */
  line: number;
  /** Explanation of the issue and how to fix it. */
  body: string;
  /** Name of the rule that produced this finding. */
  ruleName: string;
  severity: Severity;
  /** 1-10 rating of how much fixing this would improve the code. */
  impact: number;
}

/** The result of a review run. */
export interface ReviewResult {
  /** Findings after dedup, diff-line filtering, and prioritisation. */
  findings: Finding[];
  /** Number of rules that were evaluated. */
  ruleCount: number;
  /** Rule names skipped, with a reason, e.g. "no-secrets (reviewSkip)". */
  skipped: string[];
  /**
   * Non-fatal notices, e.g. a `filter` command that errored and was treated as
   * fail-open ("<rule> (filter error; applied anyway)"). A rule listed here was
   * still applied — unlike {@link ReviewResult.skipped}.
   */
  warnings: string[];
}

/**
 * Pluggable model transport. The package never calls an LLM directly.
 * The adapter is responsible for auth, retries, timeouts, and model selection.
 */
export interface LLMAdapter {
  /** Run a prompt and return the model's text response. */
  run(prompt: string): Promise<string>;
}

/** Options for {@link runReview}. */
export interface RunOptions {
  /** Absolute path to the rules directory to walk. */
  rulesDir: string;
  /** Unified diff string to review. */
  diff: string;
  /**
   * Optional extra context included in each rule prompt (e.g. a ticket
   * description). Treated strictly as data, never as instructions.
   */
  ticketContext?: string;
  /** Model adapter the package calls for each rule. */
  llm: LLMAdapter;
  /** Maximum number of rules to run concurrently. Default: 3. */
  concurrency?: number;
  /**
   * Minimum impact score (1-10) for a `suggestion`-severity finding to be
   * included. Default: 7.
   */
  minSuggestionImpact?: number;
  /**
   * Impact discount applied to findings on test files before comparing
   * against {@link RunOptions.minSuggestionImpact}. Default: 2.
   */
  testFileImpactDiscount?: number;
  /**
   * When `false`, rule `filter` commands are ignored (treated as absent).
   * Default: `true`.
   */
  runFilters?: boolean;
  /** Per-filter subprocess timeout in ms. Default: 10000. */
  filterTimeoutMs?: number;
  /**
   * Injectable filter executor (for tests or custom sandboxing). Defaults to
   * the built-in subprocess runner. Receives the command string and the
   * glob-matched paths.
   */
  filterExecutor?: FilterExecutor;
  /** Working directory in which `filter` commands run. Default: `process.cwd()`. */
  cwd?: string;
}

/** Where {@link getDiff} should source the diff from. */
export type DiffSource =
  | { type: 'working-tree' }
  | { type: 'staged' }
  | { type: 'range'; range: string };
