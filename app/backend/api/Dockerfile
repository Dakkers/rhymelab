# ─────────────────────────────────────────────────────────────────────────────
# Container image for @rhymelab/api (Fastify + Prisma over Postgres).
#
# A plain OCI image build — no engine-specific build features or frontend
# directives, so it builds identically with Docker, OrbStack, Podman/Buildah, or
# Render's own builder (OrbStack exposes the standard `docker build` CLI).
#
# BUILD CONTEXT IS THE REPO ROOT, not app/backend/api. The API depends on the
# workspace packages @rhymelab/core and @rhymelab/api-contract (pnpm
# `workspace:*`), which live outside this directory, so the whole workspace is
# installed from the root. Render is configured with dockerContext "." and
# dockerfilePath "app/backend/api/Dockerfile" (see infra/api.tf).
#
# The app runs its TypeScript directly via `tsx`, and both `tsx` and the Prisma
# CLI are devDependencies — so this image deliberately KEEPS dev dependencies (no
# `--prod` prune), and NODE_ENV is left unset until the final runtime stage.
# Setting NODE_ENV=production before install would make pnpm skip devDependencies,
# and the API's `postinstall` (which runs `prisma generate`) needs the Prisma CLI.
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

# ── Store warm-up ────────────────────────────────────────────────────────────
# Populate the pnpm store from the lockfile alone. This layer caches until
# pnpm-lock.yaml changes, and `pnpm fetch` runs no lifecycle scripts — so it
# needs neither the workspace manifests nor the Prisma schema yet.
COPY pnpm-lock.yaml ./
RUN pnpm fetch

# ── Source + install ─────────────────────────────────────────────────────────
# Bring in the whole workspace (root context, per the note above). .dockerignore
# keeps node_modules, build output, and local env files out.
COPY . .

# Link only the API subtree from the warm store, offline: the API plus its
# workspace deps (@rhymelab/core, @rhymelab/api-contract) and their externals —
# the web app's heavy toolchain (Vite/Wrangler/React) is skipped. The API's
# `postinstall` runs `prisma generate` during this step, which is why the source
# (and the Prisma schema) is copied first. Drop the filter if a partial install
# ever misbehaves; it only affects image size, not correctness.
RUN pnpm install --frozen-lockfile --offline --filter "@rhymelab/api..."

# ── Runtime ──────────────────────────────────────────────────────────────────
# HOST=0.0.0.0 so the server binds all interfaces (Render can't reach a
# 127.0.0.1 bind). PORT is injected by Render at runtime and read by the app.
ENV NODE_ENV=production \
  HOST=0.0.0.0

WORKDIR /app/app/backend/api
CMD ["pnpm", "start"]
