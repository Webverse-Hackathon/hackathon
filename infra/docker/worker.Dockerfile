# syntax=docker/dockerfile:1
# Ally worker — the agent loop plus Playwright. Lands around 1.2GB, which is why
# it is a separate service from the API.
#
# The Playwright base image tag MUST match the playwright version in
# backend/package.json. A mismatch produces a confusing "browser not found" at
# runtime rather than at build time. See F-60.

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY backend backend
RUN pnpm --filter @ally/shared build \
 && pnpm --filter @ally/backend exec prisma generate \
 && pnpm --filter @ally/backend build \
 && pnpm --filter @ally/backend deploy --prod /out

FROM mcr.microsoft.com/playwright:v1.49.0-jammy AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    ALLY_RECORDINGS_DIR=/recordings
COPY --from=build /out ./
RUN mkdir -p /recordings && chown -R pwuser:pwuser /recordings
# Never run a browser that visits arbitrary user-supplied URLs as root.
USER pwuser
CMD ["node", "dist/worker/index.js"]
