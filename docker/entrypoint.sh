#!/usr/bin/env bash
#
# Container entrypoint. Dispatches to the project scripts / CLI.
#
#   smoke            hermetic end-to-end test (fake transport, no creds)   [default]
#   test             unit test suite (vitest), no creds
#   check            unit tests + smoke + hook-smoke (full hermetic test pass), no creds
#   verify [args]    live review against a real agent (needs creds);
#                    extra args pass through, e.g. `verify --transport codex`
#   demo [args]      review the bundled examples/ sample against a real agent
#   cli [args]       run the agent-rules CLI directly
#   <anything else>  executed as a command
set -euo pipefail

cmd="${1:-smoke}"
case "$cmd" in
  smoke)
    exec bash scripts/smoke.sh
    ;;
  test)
    exec yarn test
    ;;
  check)
    yarn test
    bash scripts/smoke.sh
    exec bash scripts/hook-smoke.sh
    ;;
  verify)
    shift
    exec bash scripts/verify-transport.sh "$@"
    ;;
  demo)
    shift
    exec bash scripts/demo.sh "$@"
    ;;
  cli)
    shift
    exec node dist/cli.js "$@"
    ;;
  help | -h | --help)
    exec node dist/cli.js --help
    ;;
  *)
    exec "$@"
    ;;
esac
