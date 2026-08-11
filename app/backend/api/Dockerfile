# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Container image for @rhymelab/api (Fastify + Prisma over Postgres).
#
# BUILD CONTEXT IS THE REPO ROOT, not app/backend/api. The API depends on the
# workspace packages @rhymelab/core and @rhymelab/api-contract (pnpm
# `workspace:*`), which live outside this directory, so the whole workspace is
# installed from the root. Render is configured with dockerContext "." and
# dockerfilePath "app/backend/api/Dockerfile" (see infra/api.tf).
#
# The app runs its TypeScript directly via `tsx`, and both `tsx` and the Prisma
# CLI are devDependencies — so this image deliberately KEEPS dev dependencies (no
# `--prod` prune). Install therefore happens while NODE_ENV is unset; NODE_ENV is
# only set to production at the end, for runtime.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:26-bookworm-slim

# Prisma's query engine needs OpenSSL; TLS to Neon needs CA certs.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Use the repo-pinned pnpm (root package.json `packageManager`) via Corepack.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

# ── Dependency layer ─────────────────────────────────────────────────────────
# Copy only manifests + lockfile first so this layer caches until a package.json
# or the lockfile changes. All workspace manifests are needed for pnpm to build
# the workspace graph, even though we install only the API's subtree below.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY app/backend/api/package.json        app/backend/api/package.json
COPY app/frontend/web/package.json       app/frontend/web/package.json
COPY packages/core/package.json          packages/core/package.json
COPY packages/api-contract/package.json  packages/api-contract/package.json

# `--filter @rhymelab/api...` installs only the API and its workspace deps (core,
# api-contract) plus their externals — the web app's heavy toolchain
# (Vite/Wrangler/React) is skipped. Drop the filter if a partial install ever
# misbehaves; it only affects image size, not correctness.
RUN pnpm install --frozen-lockfile --filter "@rhymelab/api..."

# ── Source + Prisma client ───────────────────────────────────────────────────
COPY . .

# Generate the Prisma client into app/backend/api/src/_generated (gitignored, so
# it must be produced at build time). Does not need a database connection.
RUN pnpm --filter @rhymelab/api db:generate

# ── Runtime ──────────────────────────────────────────────────────────────────
# HOST=0.0.0.0 so the server binds all interfaces (Render can't reach a
# 127.0.0.1 bind). PORT is injected by Render at runtime and read by the app.
ENV NODE_ENV=production \
  HOST=0.0.0.0

WORKDIR /app/app/backend/api
CMD ["pnpm", "start"]
