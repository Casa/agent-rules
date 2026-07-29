#!/usr/bin/env bash
#
# Packaged-install smoke test. Builds the tarball `npm publish` would ship,
# installs it into a throwaway project, and verifies the public surface:
#   - the `files` allowlist ships dist/ (and not src/)
#   - the ESM `exports` map resolves named exports
#   - the `bin` entry runs
#
# Usage: yarn pack:smoke   (or: bash scripts/pack-smoke.sh)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

cleanup() { [[ -n "${WORK:-}" ]] && rm -rf "$WORK"; }
trap cleanup EXIT

check() {
  if [[ "$2" == "$3" ]]; then
    echo "  ok: $1"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $1 (expected '$2', got '$3')"
    FAIL=$((FAIL + 1))
  fi
}

cd "$ROOT"
yarn build >/dev/null

WORK="$(mktemp -d)"
TARBALL="$(cd "$WORK" && npm pack "$ROOT" --silent)"
echo "packed: $TARBALL"

# Tarball must contain dist/ and must not contain src/.
contents="$(tar -tzf "$WORK/$TARBALL")"
check "tarball ships dist/" "yes" "$(grep -q 'package/dist/index.js' <<<"$contents" && echo yes || echo no)"
check "tarball excludes src/" "yes" "$(grep -q 'package/src/' <<<"$contents" && echo no || echo yes)"

# Install into a throwaway ESM project.
PROJ="$WORK/proj"
mkdir -p "$PROJ"
(cd "$PROJ" && npm init -y >/dev/null && npm install "$WORK/$TARBALL" --silent >/dev/null)

# Named exports resolve via the exports map.
exports_ok="$(cd "$PROJ" && node --input-type=module -e '
  import * as m from "@casa/agent-rules";
  const need = [
    "runReview","getDiff","matchGlob","matchGlobs","parseRuleFile","buildReviewPrompt","parseFindings",
    "buildHookContext","toRepoRelativePath","mergeHookSettings",
  ];
  const missing = need.filter((n) => typeof m[n] !== "function");
  process.stdout.write(missing.length ? "missing:" + missing.join(",") : "ok");
')"
check "named exports resolve" "ok" "$exports_ok"

# The `agent-rules` bin entry runs and reports the version.
version="$(cd "$PROJ" && node node_modules/.bin/agent-rules --version)"
pkg_version="$(node -p "require('$ROOT/package.json').version")"
check "bin --version" "$pkg_version" "$version"

# The `agent-rules-hook` bin entry resolves and runs (no matching rule -> no output, exit 0).
hook_out="$(cd "$PROJ" && echo '{"tool_name":"Read","tool_input":{"file_path":"x.ts"}}' | node node_modules/.bin/agent-rules-hook)"
hook_code=$(cd "$PROJ" && echo '{"tool_name":"Read","tool_input":{"file_path":"x.ts"}}' | node node_modules/.bin/agent-rules-hook >/dev/null 2>&1; echo $?)
check "agent-rules-hook bin resolves and exits 0" "0" "$hook_code"
check "agent-rules-hook produces no output with no rules dir" "" "$hook_out"

echo
echo "pack-smoke: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
