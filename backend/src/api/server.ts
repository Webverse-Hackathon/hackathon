/**
 * The demo API (DECISIONS.md #13): one Fastify process that validates requests,
 * runs the agent in-process, and relays each run's events over SSE.
 *
 *   POST /api/runs               create and queue a run
 *   GET  /api/runs               recent runs
 *   GET  /api/runs/:id           the report
 *   GET  /api/runs/:id/stream    server-sent events, replayable with Last-Event-ID
 *   GET  /api/runs/:id/frame     the latest frame of the agent's browser, for humans only
 *   POST /api/runs/:id/fix       locate, patch, validate, open a PR, verify
 *   POST /api/runs/:id/rerun     the same URL and goal again
 *   GET  /api/config · /api/health
 *
 * Shapes come from @ally/shared (docs/05-API-CONTRACT.md).
 */

import cors from '@fastify/cors';
import {
  RunRequestSchema,
  STEP_BUDGET_DEFAULT,
  type ApiError,
  type ErrorCode,
  type FixStarted,
  type HealthResponse,
  type RunCreated,
  type RunListResponse,
  type RunRequest,
  type ServerConfig,
} from '@ally/shared';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { loadConfig, loadDotEnv, type Config } from '../config/index.js';
import { executeFix, fixRefusal, reportVerification, resolveDir } from '../fix/execute.js';
import { patchesOnVerifySite } from '../fix/workspace.js';
import { UrlRejected, assertPublicUrl } from '../lib/url-guard.js';
import { createLlmProvider, missingModelConfig } from '../llm/factory.js';
import type { LlmProvider } from '../llm/provider.js';
import { RunQueue } from '../runs/execute.js';
import { RunStore, toReport, toSummary, type RunRecord } from '../runs/store.js';

export interface AppDeps {
  config: Config;
  /** Injected so tests can run the whole API with a scripted model. */
  createLlm?: () => LlmProvider;
  store?: RunStore;
}

function sendError(reply: FastifyReply, status: number, code: ErrorCode, message: string, details?: Record<string, unknown>) {
  const body: ApiError = { error: details ? { code, message, details } : { code, message } };
  return reply.code(status).send(body);
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

export function buildApp(deps: AppDeps): { app: FastifyInstance; store: RunStore; queue: RunQueue } {
  const { config } = deps;
  const store = deps.store ?? new RunStore();
  const modelConfigured = Boolean(deps.createLlm) || missingModelConfig(config) === null;
  const createLlm = deps.createLlm ?? (() => createLlmProvider(config));

  const queue: RunQueue = new RunQueue({
    store,
    config,
    createLlm,
    onVerifyFinished: (verify) => reportVerification(verify, { store, config }),
  });

  const app = Fastify({ logger: { level: 'info' } });
  app.register(cors, { origin: config.FRONTEND_ORIGIN, exposedHeaders: ['X-Frame-Seq'] });

  const connected = (url: string) => sameOrigin(url, config.ALLY_CONNECTED_SITE_URL) || sameOrigin(url, config.ALLY_VERIFY_SITE_URL);

  const find = (id: string, reply: FastifyReply): RunRecord | null => {
    const record = store.get(id);
    if (!record) {
      sendError(reply, 404, 'RUN_NOT_FOUND', 'No run with that id. Runs live in memory and are cleared when the server restarts.');
      return null;
    }
    return record;
  };

  const startRun = (request: RunRequest): RunRecord => {
    const record = store.create({
      url: request.url,
      goal: request.goal,
      mode: connected(request.url) ? 'REPO_CONNECTED' : 'URL_ONLY',
      source: request.source ?? 'MANUAL',
      stepBudget: request.stepBudget ?? config.ALLY_STEP_BUDGET ?? STEP_BUDGET_DEFAULT,
      // A run on the verify site tests the patches already there; a fix must build on them (F-81).
      overrides: sameOrigin(request.url, config.ALLY_VERIFY_SITE_URL)
        ? patchesOnVerifySite(resolveDir(config.ALLY_CONNECTED_SOURCE_DIR), resolveDir(config.ALLY_VERIFY_SOURCE_DIR))
        : undefined,
    });
    queue.enqueue(record);
    return record;
  };

  const created = (record: RunRecord): RunCreated => ({
    id: record.id,
    status: record.status,
    mode: record.mode,
    streamUrl: `/api/runs/${record.id}/stream`,
    liveUrl: `/live/${record.id}`,
    createdAt: record.createdAt.toISOString(),
  });

  app.get('/api/config', async (): Promise<ServerConfig> => ({
    modelConfigured,
    decideModel: config.ALLY_MODEL_DECIDE,
    narrateModel: config.ALLY_MODEL_NARRATE,
    connectedSiteUrl: config.ALLY_CONNECTED_SITE_URL,
    pullRequestsEnabled: Boolean(config.GITHUB_TOKEN && config.GITHUB_REPO),
    pullRequestRepo: config.GITHUB_REPO ?? null,
  }));

  app.get('/api/health', async (): Promise<HealthResponse> => ({
    status: modelConfigured ? 'ok' : 'degraded',
    db: 'absent',
    redis: 'absent',
    queueDepth: queue.depth,
    browserPoolFree: queue.free,
  }));

  app.post('/api/runs', async (request, reply) => {
    const parsed = RunRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return sendError(reply, 400, 'VALIDATION_FAILED', issue?.message ?? 'Invalid request.', { field: issue?.path.join('.') });
    }
    if (!modelConfigured) {
      return sendError(reply, 503, 'MODEL_NOT_CONFIGURED', `No model key is configured on the server, so the agent cannot run. ${missingModelConfig(config) ?? ''}`.trim());
    }
    try {
      await assertPublicUrl(parsed.data.url, config.ALLY_PRIVATE_HOST_ALLOWLIST);
    } catch (error) {
      if (error instanceof UrlRejected) return sendError(reply, 400, 'INVALID_URL', error.message, { field: 'url' });
      throw error;
    }
    return reply.code(201).send(created(startRun(parsed.data)));
  });

  app.get('/api/runs', async (): Promise<RunListResponse> => ({
    runs: store.list().filter((record) => record.source !== 'VERIFY').slice(0, 20).map(toSummary),
    nextCursor: null,
  }));

  app.get<{ Params: { id: string } }>('/api/runs/:id', async (request, reply) => {
    const record = find(request.params.id, reply);
    if (!record) return reply;
    return toReport(record, store, fixRefusal(record) === null);
  });

  app.post<{ Params: { id: string } }>('/api/runs/:id/rerun', async (request, reply) => {
    const record = find(request.params.id, reply);
    if (!record) return reply;
    const next = startRun({ url: record.url, goal: record.goal, stepBudget: record.stepBudget });
    return reply.code(201).send(created(next));
  });

  app.post<{ Params: { id: string } }>('/api/runs/:id/fix', async (request, reply) => {
    const record = find(request.params.id, reply);
    if (!record) return reply;
    const refusal = fixRefusal(record);
    if (refusal) {
      const code: ErrorCode = record.status !== 'BLOCKED' ? 'RUN_NOT_BLOCKED' : record.mode !== 'REPO_CONNECTED' ? 'REPO_NOT_CONNECTED' : 'FIX_IN_PROGRESS';
      return sendError(reply, 409, code, refusal);
    }
    executeFix(record, { store, config, queue, createLlm }).catch((error: unknown) => app.log.error(error));
    const body: FixStarted = { runId: record.id, status: 'FIXING', streamUrl: `/api/runs/${record.id}/stream` };
    return reply.code(202).send(body);
  });

  app.get<{ Params: { id: string }; Querystring: { after?: string } }>('/api/runs/:id/frame', async (request, reply) => {
    const record = find(request.params.id, reply);
    if (!record) return reply;
    const after = Number(request.query.after ?? 0);
    reply.header('Cache-Control', 'no-store');
    if (!record.frame || record.frame.seq <= after) return reply.code(204).send();
    return reply.header('Content-Type', 'image/jpeg').header('X-Frame-Seq', String(record.frame.seq)).send(record.frame.jpeg);
  });

  app.get<{ Params: { id: string } }>('/api/runs/:id/stream', (request, reply) => {
    const record = find(request.params.id, reply);
    if (!record) return reply;

    const lastEventId = Number(request.headers['last-event-id'] ?? 0) || 0;
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': config.FRONTEND_ORIGIN,
    });
    raw.write('retry: 2000\n\n');

    const unsubscribe = store.subscribe(record, lastEventId, (logged) => {
      raw.write(`id: ${logged.id}\nevent: ${logged.event.event}\ndata: ${JSON.stringify(logged.event.data)}\n\n`);
    });
    // F-21: a comment every 15 s keeps idle proxies from culling the connection.
    const heartbeat = setInterval(() => raw.write(': keep-alive\n\n'), 15_000);
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return { app, store, queue };
}

async function main(): Promise<void> {
  loadDotEnv();
  const config = loadConfig();
  const { app } = buildApp({ config });
  const missing = missingModelConfig(config);
  if (missing) app.log.warn(`${missing} The dashboard will load, but runs will be refused until it is set.`);
  await app.listen({ port: config.API_PORT, host: 'localhost' });
}

const invokedDirectly = process.argv[1] !== undefined && /[\\/]api[\\/]server\.(ts|js)$/.test(process.argv[1]);
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
