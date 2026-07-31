import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
/**
 * Per-session dedup state for the `PostToolUse` hook: which rule names have
 * already been injected into this Claude Code session's context, so a rule's
 * content is surfaced at most once per session rather than on every matching
 * Read/Write/Edit.
 *
 * Stored as one small JSON file per session under the OS temp directory,
 * keyed by the hook payload's `session_id`.
 */
function statePath(sessionId, baseDir) {
    return path.join(baseDir, `${sessionId}.json`);
}
/** Directory the state files live under (parameterised for tests). */
export function defaultStateDir() {
    return path.join(tmpdir(), 'agent-rules-hook');
}
/** Load the set of rule names already injected for `sessionId`. Missing/corrupt state ⇒ empty set. */
export async function loadInjected(sessionId, baseDir = defaultStateDir()) {
    try {
        const raw = await readFile(statePath(sessionId, baseDir), 'utf8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return new Set();
        return new Set(parsed.filter((v) => typeof v === 'string'));
    }
    catch {
        return new Set();
    }
}
/** Persist the set of rule names injected so far for `sessionId`. */
export async function saveInjected(sessionId, injected, baseDir = defaultStateDir()) {
    await mkdir(baseDir, { recursive: true });
    await writeFile(statePath(sessionId, baseDir), JSON.stringify([...injected]), 'utf8');
}
