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

# Baseline: a privileged operation protected by an auth guard and error handling.
cat >"$REPO/account.ts" <<'TS'
import { db, logger } from './infra.js';

export async function deleteAccount(user, id) {
  if (!user.isAdmin) {
    throw new Error('forbidden');
  }
  try {
    return await db.delete(id);
  } catch (err) {
    logger.error('delete failed', err);
    throw err;
  }
}
TS
git -C "$REPO" -c user.email=demo@demo -c user.name=demo add -A
git -C "$REPO" -c user.email=demo@demo -c user.name=demo commit -qm init

# The change silently strips the authorization guard AND the error handling.
# Both removals are invisible in the new file — only the diff reveals them.
cat >"$REPO/account.ts" <<'TS'
import { db, logger } from './infra.js';

export async function deleteAccount(user, id) {
  return await db.delete(id);
}
TS

cd "$REPO"
echo "=== sample change under review ==="
git --no-pager diff
echo
echo "=== agent-rules review ==="
node "$CLI" --working-tree --rules "$RULES" --min-impact 1 "$@"
