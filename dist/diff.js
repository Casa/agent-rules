import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
/** Extract changed file paths (the `b/` paths) from a unified diff. */
export function extractChangedFiles(diff) {
    const files = [];
    for (const line of diff.split('\n')) {
        const m = /^diff --git a\/.*? b\/(.*)/.exec(line);
        if (m)
            files.push(m[1]);
    }
    return files;
}
/**
 * Narrow a unified diff to only the sections for the given file paths.
 * Returns `null` when no section matches.
 */
export function extractDiffSections(fullDiff, matchingPaths) {
    const sections = [];
    let currentFile = null;
    let currentSection = [];
    const flush = () => {
        if (currentFile && matchingPaths.has(currentFile) && currentSection.length) {
            sections.push(currentSection.join('\n'));
        }
    };
    for (const line of fullDiff.split('\n')) {
        const header = /^diff --git a\/(.+?) b\//.exec(line);
        if (header) {
            flush();
            currentFile = header[1];
            currentSection = [line];
        }
        else {
            currentSection.push(line);
        }
    }
    flush();
    return sections.length ? sections.join('\n') : null;
}
/**
 * Build the set of valid `path:line` targets from a unified diff. Only lines
 * present on the right side (added or context) are valid finding targets.
 */
export function buildDiffLineMap(diff) {
    const valid = new Set();
    let file = '';
    let line = 0;
    let inHunk = false;
    for (const raw of diff.split('\n')) {
        const fileMatch = /^diff --git a\/.*? b\/(.*)/.exec(raw);
        if (fileMatch) {
            file = fileMatch[1];
            inHunk = false;
            continue;
        }
        const hunkMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
        if (hunkMatch) {
            line = Number.parseInt(hunkMatch[1], 10);
            inHunk = true;
            continue;
        }
        if (!inHunk || raw.startsWith('-'))
            continue;
        // Skip the "\ No newline at end of file" marker.
        if (raw.startsWith('\\'))
            continue;
        if (file)
            valid.add(`${file}:${line}`);
        line++;
    }
    return valid;
}
/**
 * Acquire a unified diff from git for the requested source.
 *
 * `working-tree` includes staged + unstaged tracked changes plus untracked
 * files (rendered via `git diff --no-index` against /dev/null).
 *
 * Throws if git is unavailable, the directory is not a repo, or the range is bad.
 */
export async function getDiff(source, cwd = process.cwd()) {
    switch (source.type) {
        case 'staged':
            return git(['diff', '--cached'], cwd);
        case 'range':
            return git(['diff', source.range], cwd);
        case 'working-tree': {
            const tracked = await git(['diff', 'HEAD'], cwd);
            const untracked = await untrackedDiff(cwd);
            return [tracked, untracked].filter(Boolean).join('');
        }
    }
}
/** Run a git command, returning stdout. */
async function git(args, cwd) {
    try {
        const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 });
        return stdout;
    }
    catch (err) {
        const e = err;
        if (e.code === 'ENOENT') {
            throw new Error('git is not installed or not on PATH', { cause: err });
        }
        throw new Error(`git ${args.join(' ')} failed: ${(e.stderr || e.message || '').trim()}`, {
            cause: err,
        });
    }
}
/** Render untracked (but not ignored) files as added-file diffs. */
async function untrackedDiff(cwd) {
    const list = await git(['ls-files', '--others', '--exclude-standard'], cwd);
    const files = list.split('\n').filter(Boolean);
    let out = '';
    for (const file of files) {
        // `git diff --no-index` exits 1 when files differ; capture stdout regardless.
        try {
            await execFileAsync('git', ['diff', '--no-index', '--', '/dev/null', file], {
                cwd,
                maxBuffer: 64 * 1024 * 1024,
            });
        }
        catch (err) {
            const e = err;
            if (e.stdout)
                out += e.stdout;
        }
    }
    return out;
}
