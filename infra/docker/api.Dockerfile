# syntax=docker/dockerfile:1
# Ally API — Fastify. Target size under 200MB.

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable

# Copy every manifest before the source so the install layer caches. See F-62:
# pnpm workspace links do not survive a host node_modules copy, so we always
# install inside the image.
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

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Prisma needs OpenSSL present at runtime. See F-63.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /out ./
USER node
EXPOSE 4000
CMD ["node", "dist/api/server.js"]
