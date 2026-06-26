#!/usr/bin/env bash
#
# Demo: review a bundled sample change against a real agent, using the rules in
# examples/rules. Extra args pass through to the CLI (e.g. --transport codex).
#
# Needs credentials for the resolved agent (see docker/README.md). Inside Docker:
#   docker run --rm -e CLAUDE_CODE_OAUTH_TOKEN agent-rules demo

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$ROOT/dist/cli.js"
RULES="$ROOT/examples/rules"

cleanup() { [[ -n "${WORK:-}" ]] && rm -rf "$WORK"; }
trap cleanup EXIT

[[ -f "$CLI" ]] || (cd "$ROOT" && yarn build >/dev/null)

WORK="$(mktemp -d)"
REPO="$WORK/repo"
mkdir -p "$REPO"
git -C "$REPO" init -q
printf 'export function start() {\n  return true;\n}\n' >"$REPO/server.ts"
git -C "$REPO" -c user.email=demo@demo -c user.name=demo add -A
git -C "$REPO" -c user.email=demo@demo -c user.name=demo commit -qm init

# A change that trips both sample rules: a console.log and a magic number.
cat >>"$REPO/server.ts" <<'TS'

export function poll() {
  console.log('polling');
  return setTimeout(poll, 86400000);
}
TS

cd "$REPO"
echo "=== sample change under review ==="
git --no-pager diff
echo
echo "=== agent-rules review ==="
node "$CLI" --working-tree --rules "$RULES" --min-impact 1 "$@"
