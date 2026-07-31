import { spawn } from 'node:child_process';
const DEFAULT_FILTER_TIMEOUT_MS = 10_000;
/**
 * Build the default {@link FilterExecutor}: it tokenises the `filter` command,
 * appends the matched paths as arguments, and spawns it. The decision is taken
 * entirely from the exit code (grep-style):
 *
 *   - `0`               ⇒ `'pass'`   (rule applies)
 *   - `1`               ⇒ `'reject'` (rule skipped)
 *   - anything else,    ⇒ `'error'`  (fail-open — caller applies the rule)
 *     timeout, or a
 *     spawn failure
 *
 * stdout/stderr are ignored and stdin is closed; only the exit status matters.
 */
export function makeFilterExecutor(options = {}) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_FILTER_TIMEOUT_MS;
    const cwd = options.cwd ?? process.cwd();
    const baseEnv = options.env ?? process.env;
    return (command, paths) => new Promise((resolve) => {
        const [cmd, ...cmdArgs] = tokenize(command);
        if (!cmd) {
            resolve('error');
            return;
        }
        // Mark the child so a filter that re-invokes agent-rules is caught by the
        // recursion guard in cli.ts.
        const child = spawn(cmd, [...cmdArgs, ...paths], {
            stdio: ['ignore', 'ignore', 'ignore'],
            cwd,
            env: { ...baseEnv, AGENT_RULES_SUBPROCESS: '1' },
        });
        let settled = false;
        const finish = (result) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(result);
        };
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            finish('error');
        }, timeoutMs);
        child.on('error', () => finish('error'));
        child.on('close', (code) => {
            if (code === 0)
                finish('pass');
            else if (code === 1)
                finish('reject');
            else
                finish('error');
        });
    });
}
/** Minimal shell-like tokenizer (handles simple single/double quotes). */
function tokenize(input) {
    const tokens = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let m;
    while ((m = re.exec(input)) !== null) {
        tokens.push(m[1] ?? m[2] ?? m[3] ?? '');
    }
    return tokens;
}
