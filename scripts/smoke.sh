#!/usr/bin/env bash
#
# Hermetic end-to-end smoke test for the agent-rules CLI.
#
# Uses a fake `--exec` transport (no real agent / no network), so it is safe to
# run in CI. Exercises: argument validation, the full review pipeline, exit
# codes, and the no-transport failure path.
#
# Usage: yarn smoke   (or: bash scripts/smoke.sh)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$ROOT/dist/cli.js"
PASS=0
FAIL=0

cleanup() { [[ -n "${WORK:-}" ]] && rm -rf "$WORK"; }
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
[[ -f "$CLI" ]] || (cd "$ROOT" && yarn build >/dev/null)

WORK="$(mktemp -d)"

# A throwaway git repo with one uncommitted change on line 2.
REPO="$WORK/repo"
mkdir -p "$REPO"
git -C "$REPO" init -q
printf 'const a = 1;\n' >"$REPO/app.ts"
git -C "$REPO" -c user.email=t@t -c user.name=t add -A
git -C "$REPO" -c user.email=t@t -c user.name=t commit -qm init
printf 'console.log(1);\n' >>"$REPO/app.ts"

# A rule that matches the change, and a fake transport that emits one finding.
RULES="$WORK/rules"
mkdir -p "$RULES"
printf -- '---\ndescription: No console\nglobs: "*.ts"\n---\nNo console.\n' >"$RULES/no-console.md"
FAKE="$WORK/fake-llm.sh"
printf '#!/usr/bin/env bash\ncat >/dev/null\necho %s\n' \
  "'[{\"path\":\"app.ts\",\"line\":2,\"body\":\"remove\",\"severity\":\"blocking\",\"impact\":10}]'" >"$FAKE"
chmod +x "$FAKE"

echo "1. full pipeline via fake transport (expect a finding, exit 1)"
out="$(cd "$REPO" && node "$CLI" --working-tree --rules "$RULES" --exec "bash $FAKE" --output json || true)"
code=$(cd "$REPO" && node "$CLI" --working-tree --rules "$RULES" --exec "bash $FAKE" >/dev/null 2>&1; echo $?)
check "exit code is 1" "1" "$code"
check "one finding returned" "1" "$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).findings.length))' <<<"$out")"

echo "2. no diff source (expect exit 2)"
code=$(node "$CLI" --rules "$RULES" >/dev/null 2>&1; echo $?)
check "exit code is 2" "2" "$code"

echo "3. two diff sources (expect exit 2)"
code=$(node "$CLI" --working-tree --staged --rules "$RULES" >/dev/null 2>&1; echo $?)
check "exit code is 2" "2" "$code"

echo "4. no transport available (expect exit 2)"
BIN="$WORK/bin"
mkdir -p "$BIN"
ln -sf "$(command -v node)" "$BIN/node"
ln -sf "$(command -v git)" "$BIN/git"
code=$(cd "$REPO" && env -u CLAUDE_CODE_EXECPATH PATH="$BIN" "$(command -v node)" "$CLI" --working-tree --rules "$RULES" >/dev/null 2>&1; echo $?)
check "exit code is 2" "2" "$code"

echo
echo "smoke: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
