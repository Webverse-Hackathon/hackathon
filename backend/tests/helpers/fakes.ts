/**
 * Test doubles for the two things the agent loop depends on: a driver that
 * replays recorded snapshots, and a scripted model provider that records every
 * request it is sent (the spy the purity suite asserts against).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AllowedKey } from '@ally/shared';
import { focusedNode, nameOf, roleOf } from '../../src/driver/tree.js';
import type { AgentDriver, AXSnapshot, FocusInfo } from '../../src/driver/types.js';
import { emptyUsage, type LlmProvider, type ModelRequest, type ModelResponse, type ModelToolCall } from '../../src/llm/provider.js';
import type { RecordedSession } from '../tools/record-session.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadRecording(name: string): RecordedSession {
  return JSON.parse(readFileSync(path.join(here, '../fixtures', name), 'utf8')) as RecordedSession;
}

/** Advances to the next snapshot on every key press or typed text. */
export class ReplayDriver implements AgentDriver {
  private index = 0;
  readonly pressed: AllowedKey[] = [];
  readonly typed: string[] = [];

  constructor(private readonly snapshots: AXSnapshot[]) {
    if (snapshots.length === 0) throw new Error('ReplayDriver needs at least one snapshot.');
  }

  private get current(): AXSnapshot {
    return this.snapshots[Math.min(this.index, this.snapshots.length - 1)] as AXSnapshot;
  }

  async axSnapshot(): Promise<AXSnapshot> {
    return this.current;
  }

  async pressKey(key: AllowedKey): Promise<void> {
    this.pressed.push(key);
    this.index++;
  }

  async typeText(text: string): Promise<void> {
    this.typed.push(text);
    this.index++;
  }

  async focusInfo(): Promise<FocusInfo | null> {
    const node = focusedNode(this.current.nodes);
    if (!node) return null;
    return { axNodeId: node.nodeId, backendNodeId: node.backendDOMNodeId ?? null, role: roleOf(node), name: nameOf(node) || null };
  }

  currentUrl(): string {
    return this.current.url;
  }
}

export interface ScriptedCall {
  name: string;
  input: Record<string, unknown>;
}

/** Returns the scripted tool calls in order, then keeps pressing Tab. Records every request. */
export class ScriptedProvider implements LlmProvider {
  readonly requests: { kind: 'narrate' | 'decide'; request: ModelRequest }[] = [];
  private cursor = 0;

  constructor(
    private readonly script: (ScriptedCall | null)[],
    private readonly narration = 'I hear a list and several unnamed images.',
  ) {}

  private respond(model: string, text: string, toolCalls: ModelToolCall[]): ModelResponse {
    return { model, text, toolCalls, stopReason: toolCalls.length ? 'tool_use' : 'end_turn', usage: emptyUsage(), latencyMs: 1 };
  }

  async narrate(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push({ kind: 'narrate', request });
    return this.respond('scripted-narrate', this.narration, []);
  }

  async decide(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push({ kind: 'decide', request });
    const next = this.cursor < this.script.length ? this.script[this.cursor] : { name: 'press_key', input: { key: 'Tab' } };
    this.cursor++;
    if (next === null || next === undefined) return this.respond('scripted-decide', 'I am not sure.', []);
    return this.respond('scripted-decide', '', [
      { name: next.name, input: { reasoning: 'scripted', confidence: 0.9, ...next.input } },
    ]);
  }
}

export const press = (key: AllowedKey): ScriptedCall => ({ name: 'press_key', input: { key } });
