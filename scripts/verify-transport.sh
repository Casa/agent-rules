#!/usr/bin/env bash
#
# Live transport verification for the agent-rules CLI.
#
# Unlike scripts/smoke.sh, this spawns a REAL agent CLI (claude or codex,
# whichever the resolver picks) and makes a real model call. It is NOT hermetic
# and is NOT part of `yarn test` / CI. Run it manually to confirm the built-in
# tool profiles still work against installed agent versions.
#
# Usage: yarn verify:transport   (or: bash scripts/verify-transport.sh)
#
# Requires a logged-in `claude` or an authenticated `codex` on PATH.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$ROOT/dist/cli.js"

cleanup() { [[ -n "${WORK:-}" ]] && rm -rf "$WORK"; }
trap cleanup EXIT

[[ -f "$CLI" ]] || (cd "$ROOT" && yarn build >/dev/null)

WORK="$(mktemp -d)"
REPO="$WORK/repo"
mkdir -p "$REPO"
git -C "$REPO" init -q
printf 'export const a = 1;\n' >"$REPO/app.ts"
git -C "$REPO" -c user.email=t@t -c user.name=t add -A
git -C "$REPO" -c user.email=t@t -c user.name=t commit -qm init
printf 'console.log("debugging", 12345);\n' >>"$REPO/app.ts"

RULES="$WORK/rules"
mkdir -p "$RULES"
printf -- '---\ndescription: No console.log\nglobs: "*.ts"\n---\nFlag every use of console.log; it must be removed before merge.\n' \
  >"$RULES/no-console.md"

echo "Running a real review (this calls a live agent and may take a minute)..."
echo "Transport auto-resolves; pass extra args to override (e.g. --transport codex)."
echo
cd "$REPO"
node "$CLI" --working-tree --rules "$RULES" --min-impact 1 --output json "$@"
echo
echo "If 'findings' contains the console.log on app.ts, the live transport works."
