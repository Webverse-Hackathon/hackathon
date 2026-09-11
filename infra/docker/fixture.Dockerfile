# syntax=docker/dockerfile:1
# The deliberately broken storefront the agent is demonstrated against.
#
# Built with ALLY_SOURCE=1 so the Babel/SWC plugin stamps data-ally-src onto
# every JSX element. That attribute is what makes the source mapping
# deterministic on stage, and it will be visible in the DOM inspector if a judge
# asks to see it. Let them look. See docs/07-SOURCE-MAPPING-AND-PATCH.md.
#
# Demo rule: pin this image by DIGEST, never by tag, and freeze the fixture repo
# twelve hours before the demo at the tag demo-frozen. See F-51.

FROM node:22-slim AS build
ARG ALLY_SOURCE=1
ENV ALLY_SOURCE=${ALLY_SOURCE}
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY fixtures/broken-shop/package.json fixtures/broken-shop/
RUN pnpm install --frozen-lockfile
COPY fixtures/broken-shop fixtures/broken-shop
RUN pnpm --filter @ally/fixture-broken-shop build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3100
COPY --from=build /app/fixtures/broken-shop/.next/standalone ./
COPY --from=build /app/fixtures/broken-shop/.next/static ./fixtures/broken-shop/.next/static
COPY --from=build /app/fixtures/broken-shop/public ./fixtures/broken-shop/public
USER node
EXPOSE 3100
CMD ["node", "fixtures/broken-shop/server.js"]
