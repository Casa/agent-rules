/** Directory the state files live under (parameterised for tests). */
export declare function defaultStateDir(): string;
/** Load the set of rule names already injected for `sessionId`. Missing/corrupt state ⇒ empty set. */
export declare function loadInjected(sessionId: string, baseDir?: string): Promise<Set<string>>;
/** Persist the set of rule names injected so far for `sessionId`. */
export declare function saveInjected(sessionId: string, injected: ReadonlySet<string>, baseDir?: string): Promise<void>;
