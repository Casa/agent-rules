# Running agent-rules in Docker

A reproducible image with `claude` and `codex` installed, the package built, and
sample rules under `examples/rules`. Useful for trying the real exec transport
without touching your host setup.

> **Credentials are never baked into the image.** Pass them at run time with
> `-e VAR` (Docker forwards the value from your shell). Do not use `--build-arg`
> for secrets — build args persist in image history.

## Build

```sh
docker build -t agent-rules .
# or: yarn docker:build
```

## Hermetic smoke test (no credentials)

The default command runs `scripts/smoke.sh` — a fake `--exec` transport, so it
needs no agent login and is safe anywhere (also what CI runs).

```sh
docker run --rm agent-rules
# or: yarn docker:smoke
```

## Live review against a real agent

### claude (OAuth token)

```sh
docker run --rm -e CLAUDE_CODE_OAUTH_TOKEN agent-rules demo
```

`claude` is first in the resolution order, so no `--transport` is needed. The
`CLAUDE_CODE_OAUTH_TOKEN` value is read from your shell and forwarded into the
container for headless auth.

### codex (mounted login)

codex authenticates from its own config (`codex login` on the host writes
`~/.codex`). Mount a **writable** copy into the container — codex writes runtime
files at startup, so a read-only mount fails. Copy it first to avoid mutating
your host config:

```sh
cp -r "$HOME/.codex" /tmp/codex-home
docker run --rm -v /tmp/codex-home:/root/.codex agent-rules demo --transport codex
```

(A bare `-e OPENAI_API_KEY` is not enough for `codex exec` — it expects the
logged-in session config.)

## Review your own repository

Mount a repo and point at its rules:

```sh
docker run --rm \
  -e CLAUDE_CODE_OAUTH_TOKEN \
  -v "$PWD:/repo" -w /repo \
  agent-rules cli --working-tree --rules .agent/rules
```

## Commands

The entrypoint accepts: `smoke` (default), `verify [args]`, `demo [args]`,
`cli [args]`, or any other command to exec directly. `verify`/`demo` forward
extra args to the CLI, e.g. `--transport codex` or `--output json`.
