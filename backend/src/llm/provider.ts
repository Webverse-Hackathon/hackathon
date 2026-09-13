/**
 * The provider interface. EVERY model call in this codebase goes through an
 * LlmProvider, so the provider is swappable, the spend is traceable, and the
 * purity suite can spy on exactly what is sent (P-2, P-3).
 *
 * A ModelRequest can only carry text. There is no image block type here, by
 * design: the agent must never receive pixels.
 */

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonSchema = { [key: string]: JsonValue };

export interface TextBlock {
  type: 'text';
  text: string;
  /** Mark the prefix up to and including this block as cacheable. */
  cache?: boolean;
}

export interface ModelMessage {
  role: 'user' | 'assistant';
  content: TextBlock[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

export interface ModelRequest {
  system: TextBlock[];
  messages: ModelMessage[];
  tools?: ToolDefinition[];
  maxTokens: number;
}

export interface ModelToolCall {
  name: string;
  input: unknown;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface ModelResponse {
  model: string;
  text: string;
  toolCalls: ModelToolCall[];
  stopReason: string;
  usage: ModelUsage;
  latencyMs: number;
}

export interface LlmProvider {
  /** The cheap, fast call whose output is spoken aloud. Claude Haiku 4.5 by default. */
  narrate(request: ModelRequest): Promise<ModelResponse>;
  /** The reasoning call that chooses the next keystroke. Claude Sonnet 5 by default. */
  decide(request: ModelRequest): Promise<ModelResponse>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly code: 'REFUSED' | 'RATE_LIMITED' | 'TIMEOUT' | 'AUTH' | 'UPSTREAM' | 'BAD_REQUEST',
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = 'LlmError';
  }
}

export function emptyUsage(): ModelUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
}

export function addUsage(total: ModelUsage, more: ModelUsage): ModelUsage {
  return {
    inputTokens: total.inputTokens + more.inputTokens,
    outputTokens: total.outputTokens + more.outputTokens,
    cacheReadInputTokens: total.cacheReadInputTokens + more.cacheReadInputTokens,
    cacheCreationInputTokens: total.cacheCreationInputTokens + more.cacheCreationInputTokens,
  };
}
