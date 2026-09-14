// Types only from @ally/shared: the dashboard carries no copy of a contract.
import type { ApiError, RunCreated, RunListResponse, RunReport, RunRequest, ServerConfig } from '@ally/shared';

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { cache: 'no-store', ...init });
  } catch {
    throw new ApiRequestError(`The Ally server at ${API_BASE} is not reachable. Is it running?`, 'UNREACHABLE', 0);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(body?.error.message ?? `Request failed with ${response.status}.`, body?.error.code ?? 'UNKNOWN', response.status);
  }
  return (await response.json()) as T;
}

export const api = {
  config: () => request<ServerConfig>('/api/config'),
  runs: () => request<RunListResponse>('/api/runs'),
  report: (id: string) => request<RunReport>(`/api/runs/${encodeURIComponent(id)}`),
  createRun: (body: RunRequest) =>
    request<RunCreated>('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  rerun: (id: string) => request<RunCreated>(`/api/runs/${encodeURIComponent(id)}/rerun`, { method: 'POST' }),
  fix: (id: string) => request<{ runId: string }>(`/api/runs/${encodeURIComponent(id)}/fix`, { method: 'POST' }),
  streamUrl: (id: string) => `${API_BASE}/api/runs/${encodeURIComponent(id)}/stream`,
  frameUrl: (id: string, after: number) => `${API_BASE}/api/runs/${encodeURIComponent(id)}/frame?after=${after}`,
};
