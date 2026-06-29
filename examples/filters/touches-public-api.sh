#!/usr/bin/env bash
#
# Example agent-rules `filter` command.
#
# A rule's `filter` runs after its globs match, receiving the matched file paths
# as arguments. It decides whether the rule applies via its exit code:
#
#   exit 0  -> rule applies
#   exit 1  -> rule is skipped (clean rejection)
#   exit >1 -> error; agent-rules treats it as "no filter" and applies the rule
#              (fail-open). Spawn failures and timeouts are treated the same way.
#
# This filter applies a rule only when one of the changed files looks like part
# of the public API surface — a barrel/index module or a file under a `public/`
# directory, or a file that re-exports with `export * from`.
#
# Usage in a rule's front-matter:
#   filter: '.agent/filters/touches-public-api.sh'

set -euo pipefail

for f in "$@"; do
  case "$f" in
    */index.ts | */public/*) exit 0 ;;
  esac
  if grep -Eq '^export \* from' "$f" 2>/dev/null; then
    exit 0
  fi
done

exit 1
