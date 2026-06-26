# Reproducible environment for running agent-rules against a real agent CLI.
#
# Both `claude` and `codex` are installed. Credentials are NEVER baked into the
# image — pass them at run time (see docker/README.md):
#   docker run --rm -e CLAUDE_CODE_OAUTH_TOKEN agent-rules verify
#   docker run --rm -e OPENAI_API_KEY        agent-rules verify --transport codex
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates bash \
  && rm -rf /var/lib/apt/lists/*

# Pin yarn 1.x via corepack (honours the package.json packageManager field).
RUN corepack enable

# Agent CLIs used by the exec transport.
RUN npm install -g @anthropic-ai/claude-code @openai/codex

WORKDIR /app

# Dependencies first for better layer caching.
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Build the package.
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN yarn build

# Scripts, sample rules, and entrypoint.
COPY scripts ./scripts
COPY examples ./examples
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh scripts/*.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["smoke"]
