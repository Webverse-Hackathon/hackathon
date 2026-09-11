# 08 · Deployment — Docker and AWS

Two paths. **Path A** is what runs during the hackathon and on stage. **Path B** is the scale story
we present and partly build. Do not attempt Path B before the demo works end to end on Path A.

## Local development

```bash
pnpm install
cp .env.example .env            # fill in ANTHROPIC_API_KEY at minimum
docker compose up -d postgres redis
pnpm --filter @ally/backend prisma migrate dev
pnpm dev                        # api :4000, worker, frontend :3000
```

Or the whole stack in containers:

```bash
docker compose up --build       # adds api, worker, frontend, fixture site
```

`docker compose` services:

| Service | Image | Port | Notes |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | 5432 | volume `ally-pg` |
| `redis` | `redis:7-alpine` | 6379 | queue and pub/sub |
| `api` | `infra/docker/api.Dockerfile` | 4000 | Fastify |
| `worker` | `infra/docker/worker.Dockerfile` | — | Playwright base image |
| `frontend` | `infra/docker/frontend.Dockerfile` | 3000 | Next.js standalone |
| `fixture` | `infra/docker/fixture.Dockerfile` | 3100 | the deliberately broken shop |

## The three images

### API — `infra/docker/api.Dockerfile`

Multi-stage on `node:22-slim`. Builds the workspace, prunes to production dependencies, runs as an
unprivileged user. Target size under 200 MB.

```dockerfile
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @ally/shared build && pnpm --filter @ally/backend build
RUN pnpm --filter @ally/backend deploy --prod /out

FROM node:22-slim AS runtime
WORKDIR /app
COPY --from=build /out ./
USER node
EXPOSE 4000
CMD ["node", "dist/api/server.js"]
```

### Worker — `infra/docker/worker.Dockerfile`

Built on Playwright's official image, which already carries Chromium and the system libraries. Do
not try to install Chromium onto `node:slim` by hand. That path has eaten entire hackathon days; see
F-60.

```dockerfile
FROM mcr.microsoft.com/playwright:v1.49.0-jammy AS runtime
WORKDIR /app
RUN corepack enable
COPY --from=build /out ./
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
USER pwuser
CMD ["node", "dist/worker/index.js"]
```

The worker image lands around 1.2 GB. That is expected and is the reason it is a separate service.

**Chromium in a container needs headroom.** `--shm-size=1g` in compose, and 2 GB of task memory on
Fargate. The default 64 MB of shared memory makes Chromium crash in ways that look like random
navigation failures. F-61.

### Frontend — `infra/docker/frontend.Dockerfile`

Next.js with `output: 'standalone'`. Under 200 MB.

## Path A — the hackathon deployment

**One EC2 instance running docker compose, behind Caddy for automatic TLS.**

- `t3.large` (2 vCPU, 8 GB). Chromium plus Postgres plus Redis on a `t3.micro` will fall over.
- Elastic IP so the demo URL never changes between rehearsal and stage.
- Caddy terminates TLS for `ally.<your-domain>` and reverse-proxies `/api` to the API container and
  everything else to the frontend container.
- Postgres and Redis run as containers with named volumes. Not production-grade. Correct for four
  days.
- Deploy is `infra/scripts/deploy.sh`: build, push to ECR, ssh, pull, `docker compose up -d`.

**Why not Fargate first:** an ECS deployment cycle is five to ten minutes and debugging a broken
task definition costs an hour you do not have. On one box, a deploy is thirty seconds and the logs
are `docker compose logs -f`.

## Path B — the scale story

Present this as the architecture, and build it if the core is done early.

```
                       Route 53
                          │
                   CloudFront (frontend static assets)
                          │
                   ALB (:443, ACM cert)
                    │            │
          /api/*  ──┤            ├── /*  ──▶ ECS Service: frontend
                    │                           Fargate 0.5 vCPU / 1 GB, 2 tasks
                    ▼
            ECS Service: api
            Fargate 0.5 vCPU / 1 GB, 2 tasks
            target group health check: /api/health
                    │
        ┌───────────┼─────────────┐
        ▼           ▼             ▼
   RDS Postgres  ElastiCache   ECS Service: worker
   db.t4g.micro   Redis        Fargate 1 vCPU / 2 GB
   Multi-AZ off   cache.t4g.micro   NO public ingress
                                    scales 1..10 on queue depth
                                    │
                                    ▼
                               S3: ally-recordings
                               AX snapshots for replay, 7-day lifecycle
```

**Networking**

- Public subnets: ALB only.
- Private subnets: all three ECS services, RDS, ElastiCache.
- The worker reaches the internet through a NAT gateway. It has **no inbound rule at all**.
- Security groups are chained by reference, never by CIDR: ALB to api, api to rds, api to redis,
  worker to rds, worker to redis.

**Scaling the worker on queue depth**

The right signal is BullMQ's waiting count, not CPU. A worker holding a browser open sits near idle
CPU while being fully occupied. Publish `ally.queue.waiting` to CloudWatch every thirty seconds from
the API, and target-track the worker service to keep it near 2.

**Secrets**

`ANTHROPIC_API_KEY`, `DATABASE_URL`, `GITHUB_APP_PRIVATE_KEY` and `GITHUB_WEBHOOK_SECRET` live in
AWS Secrets Manager and are injected as task-definition `secrets`, never as `environment`. The
worker's task role has no permissions beyond CloudWatch Logs and the recordings bucket prefix.

**Cost, rough monthly**

| Item | Approx |
|---|---|
| ALB | $18 |
| ECS Fargate, 4 small tasks | $45 |
| RDS db.t4g.micro | $15 |
| ElastiCache cache.t4g.micro | $12 |
| NAT gateway | $33 |
| S3 + CloudWatch | $5 |
| **Total** | **~$128** |

Path A on one `t3.large` is about $60 with far less operational surface. Mention both if a judge
asks about cost.

**Budget alarms.** A CloudWatch alarm on the Anthropic spend metric we publish ourselves, plus an
AWS Budgets alert at 50% and 80% of the hackathon credit. An unbounded agent loop against a paid API
is a real way to lose the weekend's credits. F-22.

## CI/CD — `.github/workflows/`

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | every push and pull request | typecheck, lint, `jsx-a11y` as error, unit tests, integration tests against the fixture site, build all three images |
| `dogfood.yml` | pull requests touching `frontend/` | runs Ally against our own dashboard and fails on any regression |
| `deploy.yml` | push to `main` | builds, pushes to ECR, deploys Path A over SSH; the Path B job is behind a workflow input |
| `ally.yml` | the example consumers copy | the CI integration from Flow 5 in `03-USER-FLOWS.md` |

CI caching: pnpm store and the Playwright browser cache. Without the browser cache, every job
re-downloads Chromium and CI takes six minutes instead of ninety seconds.

## Demo-day infrastructure rules

1. **Pin the fixture site to an image digest.** Not a tag. A tag can move.
2. **Pre-warm everything thirty minutes before.** Cold Fargate tasks and a cold browser pool add
   fifteen seconds to the first run, which is exactly the fifteen seconds the audience is deciding
   whether this works.
3. **Run the whole demo once on the venue wifi.** Then run it again.
4. **Have the replay recording on the laptop.** `ALLY_REPLAY=<runId>` renders the entire demo from
   disk with no network. If the wifi dies, the demo still happens. F-50.
5. **Keep a recorded video as the third fallback.** You will not need it. Have it.
