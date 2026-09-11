# syntax=docker/dockerfile:1
# Ally dashboard — Next.js 15 standalone output.

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY frontend frontend
RUN pnpm --filter @ally/shared build \
 && pnpm --filter @ally/frontend build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/frontend/.next/standalone ./
COPY --from=build /app/frontend/.next/static ./frontend/.next/static
COPY --from=build /app/frontend/public ./frontend/public
USER node
EXPOSE 3000
CMD ["node", "frontend/server.js"]
