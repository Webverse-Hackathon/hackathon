/**
 * The five tools, as the model sees them, and the parser that turns a model's
 * tool call back into a validated AgentTool. All five, and nothing else.
 *
 * Each tool also asks for `reasoning` and `confidence`, which feed the
 * step.decision event. They are stripped before the call is validated against
 * the shared AgentToolSchema, which is strict: an unknown field is rejected.
 */

import {
  AGENT_TOOL_NAMES,
  ALLOWED_KEYS,
  AgentToolSchema,
  BlockerCategorySchema,
  TYPE_TEXT_MAX_LENGTH,
  type AgentTool,
} from '@ally/shared';
import type { JsonSchema, ModelToolCall, ToolDefinition } from '../llm/provider.js';

const commonProperties: JsonSchema = {
  reasoning: { type: 'string', description: 'One sentence: why this is the right next action.' },
  confidence: { type: 'number', description: 'Your confidence in this action, from 0 to 1.' },
};

function schema(properties: JsonSchema, required: string[]): JsonSchema {
  return {
    type: 'object',
    properties: { ...properties, ...commonProperties },
    required: [...required, 'reasoning', 'confidence'],
    additionalProperties: false,
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'press_key',
    description:
      'Press one key. Tab and Shift+Tab move between interactive elements; arrow keys move inside composite widgets; Enter or Space activates; Escape dismisses.',
    inputSchema: schema({ key: { type: 'string', enum: [...ALLOWED_KEYS] } }, ['key']),
  },
  {
    name: 'type_text',
    description: `Type text into the element that currently has focus. At most ${TYPE_TEXT_MAX_LENGTH} characters. Only use it when focus is on an edit field.`,
    inputSchema: schema({ text: { type: 'string' } }, ['text']),
  },
  {
    name: 'read_focus',
    description: 'Re-announce the element that has focus. This costs a step, as re-reading costs a real user time.',
    inputSchema: schema({}, []),
  },
  {
    name: 'declare_success',
    description:
      'Declare the goal complete. Only when the transcript contains explicit confirmation, such as a heading or announcement saying the order was placed. Quote that evidence.',
    inputSchema: schema({ evidence: { type: 'string', description: 'The exact transcript text that proves the goal is done.' } }, ['evidence']),
  },
  {
    name: 'declare_blocked',
    description:
      'Declare that you cannot complete the goal with a screen reader and keyboard. Name the category, explain what stopped you, and give the id in square brackets of the transcript line that blocked you, or an empty string if there is none.',
    inputSchema: schema(
      {
        category: { type: 'string', enum: [...BlockerCategorySchema.options] },
        reason: { type: 'string', description: 'One or two sentences: what you tried and what stopped you.' },
        axNodeId: { type: 'string', description: 'The id of the blocking transcript line, without brackets, or "".' },
      },
      ['category', 'reason', 'axNodeId'],
    ),
  },
];

export interface ParsedDecision {
  tool: AgentTool;
  reasoning: string;
  confidence: number;
}

export type ParseResult = { ok: true; decision: ParsedDecision } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseToolCall(call: ModelToolCall | undefined): ParseResult {
  if (!call) return { ok: false, error: 'No tool was called. Call exactly one of the five tools.' };
  if (!(AGENT_TOOL_NAMES as readonly string[]).includes(call.name)) {
    return { ok: false, error: `Unknown tool "${call.name}". Only the five listed tools exist.` };
  }
  if (!isRecord(call.input)) return { ok: false, error: 'Tool input must be an object.' };

  const { reasoning, confidence, ...input } = call.input;
  if (call.name === 'declare_blocked' && input.axNodeId === '') delete input.axNodeId;

  const parsed = AgentToolSchema.safeParse({ tool: call.name, input });
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    return { ok: false, error: `Invalid ${call.name} input: ${problems}` };
  }

  const numericConfidence = typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : 0.5;
  return {
    ok: true,
    decision: {
      tool: parsed.data,
      reasoning: typeof reasoning === 'string' ? reasoning.trim() : '',
      confidence: Math.min(1, Math.max(0, numericConfidence)),
    },
  };
}
