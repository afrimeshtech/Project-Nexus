# AfriMesh Commerce Platform — production image.
#
# "Containerisation: Docker ... Orchestration: Kubernetes (later phases)"
# — CIM Volume III §6.
#
# Multi-stage so the shipped image carries the built application and its
# production dependencies only: no source, no toolchain, no dev packages. That
# is a smaller attack surface as much as a smaller download.

# --- 1. Dependencies -------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
# Only the manifests, so this layer is cached until a dependency actually
# changes — a source edit should not reinstall node_modules.
COPY package.json package-lock.json ./
RUN npm ci

# --- 2. Build --------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `output: standalone` in next.config.ts emits a self-contained server bundle
# with only the modules it actually imports.
RUN npm run build

# --- 3. Runtime ------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Never root. A container process that is compromised should not also be
# privileged inside its own filesystem.
RUN addgroup --system --gid 1001 afrimesh \
 && adduser  --system --uid 1001 afrimesh

COPY --from=build --chown=afrimesh:afrimesh /app/.next/standalone ./
COPY --from=build --chown=afrimesh:afrimesh /app/.next/static ./.next/static
COPY --from=build --chown=afrimesh:afrimesh /app/public ./public

# Uploads written by the local storage driver. On more than one instance this
# must be an S3-compatible bucket instead — the driver interface already
# exists for exactly that swap (CIM §6, object storage).
RUN mkdir -p /app/public/uploads && chown afrimesh:afrimesh /app/public/uploads

USER afrimesh
EXPOSE 3000

# Readiness, not liveness: the orchestrator should stop routing traffic to an
# instance that cannot reach its database, without restarting it — a restart
# does not fix a database that is down, and restarting every instance turns a
# degraded platform into an outage.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health?ready || exit 1

CMD ["node", "server.js"]
