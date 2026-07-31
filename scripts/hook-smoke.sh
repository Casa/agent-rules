#!/usr/bin/env bash
#
# Hermetic end-to-end smoke test for the agent-rules PostToolUse hook and the
# `agent-rules setup` subcommand. No real Claude Code session or network
# needed — a fake PostToolUse JSON payload is piped straight into dist/hook.js.
#
# Usage: yarn hook-smoke   (or: bash scripts/hook-smoke.sh)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$ROOT/dist/hook.js"
CLI="$ROOT/dist/cli.js"
PASS=0
FAIL=0

cleanup() {
  [[ -n "${WORK:-}" ]] && rm -rf "$WORK"
  [[ -n "${RUN_ID:-}" ]] && rm -rf "${TMPDIR:-/tmp}/agent-rules-hook/sess-${RUN_ID}-"*.json
}
trap cleanup EXIT

check() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "  ok: $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $label (expected '$expected', got '$actual')"
    FAIL=$((FAIL + 1))
  fi
}

# Build if needed.
[[ -f "$HOOK" && -f "$CLI" ]] || (cd "$ROOT" && yarn build >/dev/null)

WORK="$(mktemp -d)"
# Session IDs derived from $WORK so they're unique per run — the hook's dedup
# state lives under the OS tmpdir keyed by session_id, outside of $WORK, so a
# reused literal id would collide with state left behind by a prior run.
RUN_ID="$(basename "$WORK")"
REPO="$WORK/repo"
mkdir -p "$REPO/.agent/rules" "$REPO/src/payments"
printf -- '---\ndescription: Payments rule\nglobs: "src/payments/**"\n---\nDo not log card numbers.\n' \
  >"$REPO/.agent/rules/payments.md"
printf 'export const x = 1;\n' >"$REPO/src/payments/foo.ts"

payload() {
  node -e "
    const [sessionId, cwd, tool, filePath] = process.argv.slice(1);
    console.log(JSON.stringify({
      session_id: sessionId, cwd, tool_name: tool, tool_input: { file_path: filePath },
    }));
  " "$@"
}

echo "1. matching Read -> additionalContext with the rule body"
out="$(payload sess-${RUN_ID}-1 "$REPO" Read "$REPO/src/payments/foo.ts" | (cd "$REPO" && node "$HOOK"))"
check "emits additionalContext" "yes" \
  "$(grep -q 'Do not log card numbers' <<<"$out" && echo yes || echo no)"

echo "2. same rule, same session, touched again -> deduped (no output)"
out="$(payload sess-${RUN_ID}-1 "$REPO" Read "$REPO/src/payments/foo.ts" | (cd "$REPO" && node "$HOOK"))"
check "no output on repeat" "" "$out"

echo "3. same rule, a different session -> fires again"
out="$(payload sess-${RUN_ID}-2 "$REPO" Read "$REPO/src/payments/foo.ts" | (cd "$REPO" && node "$HOOK"))"
check "emits again for a fresh session" "yes" \
  "$(grep -q 'Do not log card numbers' <<<"$out" && echo yes || echo no)"

echo "4. non-matching tool (Bash) -> no output"
out="$(node -e "console.log(JSON.stringify({session_id:'sess-${RUN_ID}-3', tool_name:'Bash', tool_input:{command:'ls'}}))" | (cd "$REPO" && node "$HOOK"))"
check "no output for unhandled tool" "" "$out"

echo "5. unrelated file -> no output"
out="$(payload sess-${RUN_ID}-3 "$REPO" Read "$REPO/README.md" | (cd "$REPO" && node "$HOOK"))"
check "no output for non-matching path" "" "$out"

echo "6. malformed stdin -> exits 0, no crash"
code=$(echo 'not json' | (cd "$REPO" && node "$HOOK" >/dev/null 2>&1); echo $?)
check "exit code is 0" "0" "$code"

echo "7. agent-rules setup wires the hook into .claude/settings.json"
(cd "$REPO" && node "$CLI" setup >/dev/null)
check "settings.json created" "yes" "$([[ -f "$REPO/.claude/settings.json" ]] && echo yes || echo no)"
check "hook command present" "yes" \
  "$(grep -q 'agent-rules-hook' "$REPO/.claude/settings.json" && echo yes || echo no)"

echo "8. agent-rules setup is idempotent"
before="$(cat "$REPO/.claude/settings.json")"
(cd "$REPO" && node "$CLI" setup >/dev/null)
after="$(cat "$REPO/.claude/settings.json")"
check "settings.json unchanged on rerun" "$before" "$after"

echo "9. dedup state directory unwritable -> still emits additionalContext (degrades gracefully)"
# Node's os.tmpdir() honours $TMPDIR on POSIX. Occupy the path the hook would
# mkdir -p into with a plain file, so the dedup-state write fails with ENOTDIR
# — simulating a sandbox/permissions environment where the OS tmp dir isn't
# writable. The hook must still emit additionalContext (it just can't dedup).
FAKETMP="$WORK/faketmp"
mkdir -p "$FAKETMP"
touch "$FAKETMP/agent-rules-hook"
out="$(payload sess-${RUN_ID}-9 "$REPO" Read "$REPO/src/payments/foo.ts" | (cd "$REPO" && TMPDIR="$FAKETMP" node "$HOOK"))"
check "additionalContext still emitted despite unwritable tmp dir" "yes" \
  "$(grep -q 'Do not log card numbers' <<<"$out" && echo yes || echo no)"
code=$(payload sess-${RUN_ID}-9 "$REPO" Read "$REPO/src/payments/foo.ts" | (cd "$REPO" && TMPDIR="$FAKETMP" node "$HOOK" >/dev/null 2>&1); echo $?)
check "exit code is still 0" "0" "$code"

echo
echo "hook-smoke: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
