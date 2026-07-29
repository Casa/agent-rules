import { describe, expect, it } from 'vitest';

import { HOOK_COMMAND, HOOK_MATCHER, mergeHookSettings } from '../src/settings.js';
import type { ClaudeSettings } from '../src/settings.js';

describe('mergeHookSettings', () => {
  it('adds the hook to an empty settings object', () => {
    const { settings, changed } = mergeHookSettings({});
    expect(changed).toBe(true);
    expect(settings.hooks?.PostToolUse).toEqual([
      {
        matcher: HOOK_MATCHER,
        hooks: [{ type: 'command', command: HOOK_COMMAND, timeout: 10 }],
      },
    ]);
  });

  it('is idempotent — running twice does not duplicate the entry', () => {
    const first = mergeHookSettings({});
    const second = mergeHookSettings(first.settings);
    expect(second.changed).toBe(false);
    expect(second.settings.hooks?.PostToolUse).toHaveLength(1);
  });

  it('preserves unrelated existing settings and hooks', () => {
    const existing = {
      someOtherSetting: true,
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hi' }] }],
        PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo done' }] }],
      },
    };

    const { settings, changed } = mergeHookSettings(existing);
    expect(changed).toBe(true);
    expect(settings.someOtherSetting).toBe(true);
    expect(settings.hooks?.PreToolUse).toEqual(existing.hooks.PreToolUse);
    expect(settings.hooks?.PostToolUse).toHaveLength(2);
    expect(settings.hooks?.PostToolUse?.[0]).toEqual(existing.hooks.PostToolUse[0]);
  });

  it('does not mutate the input object', () => {
    const existing = {};
    mergeHookSettings(existing);
    expect(existing).toEqual({});
  });

  it('does not throw and merges fresh when existing is null', () => {
    const { settings, changed } = mergeHookSettings(null as unknown as ClaudeSettings);
    expect(changed).toBe(true);
    expect(settings.hooks?.PostToolUse).toHaveLength(1);
  });

  it('does not throw and merges fresh when existing is a non-object primitive', () => {
    const { settings, changed } = mergeHookSettings('not an object' as unknown as ClaudeSettings);
    expect(changed).toBe(true);
    expect(settings.hooks?.PostToolUse).toHaveLength(1);
  });

  it('does not throw when an existing PostToolUse entry is malformed, and preserves it', () => {
    const malformedEntry = { matcher: 'Bash' }; // no `hooks` array at all
    const existing = { hooks: { PostToolUse: [malformedEntry] } } as unknown as ClaudeSettings;

    const { settings, changed } = mergeHookSettings(existing);
    expect(changed).toBe(true);
    expect(settings.hooks?.PostToolUse).toHaveLength(2);
    expect(settings.hooks?.PostToolUse?.[0]).toEqual(malformedEntry); // untouched, not dropped
  });

  it('does not throw when a PostToolUse array element is not an object', () => {
    const existing = { hooks: { PostToolUse: [null, 'oops', 42] } } as unknown as ClaudeSettings;
    const { settings, changed } = mergeHookSettings(existing);
    expect(changed).toBe(true);
    expect(settings.hooks?.PostToolUse).toHaveLength(4); // 3 originals preserved + our new entry
  });

  it('does not treat our command registered under a different matcher as already configured', () => {
    const existing: ClaudeSettings = {
      hooks: {
        PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: HOOK_COMMAND }] }],
      },
    };

    const { settings, changed } = mergeHookSettings(existing);
    expect(changed).toBe(true); // must still wire up Read|Write|Edit — Bash coverage isn't enough
    expect(settings.hooks?.PostToolUse).toHaveLength(2);
    expect(settings.hooks?.PostToolUse?.some((e) => e.matcher === HOOK_MATCHER)).toBe(true);
  });

  it('is idempotent when our command is already registered under our own matcher specifically', () => {
    const existing: ClaudeSettings = {
      hooks: {
        PostToolUse: [
          { matcher: HOOK_MATCHER, hooks: [{ type: 'command', command: HOOK_COMMAND }] },
        ],
      },
    };

    const { changed } = mergeHookSettings(existing);
    expect(changed).toBe(false);
  });
});
