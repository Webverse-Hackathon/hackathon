/**
 * Asks the decision model for the smallest change that removes the blocker,
 * as a replacement for exactly the located element's lines. The prompt carries
 * source code and the blocker the agent reported: text only, no pixels.
 */

import type { BlockerInfo } from '@ally/shared';
import { CATEGORY_GUIDE } from '../agent/categories.js';
import type { LlmProvider, ModelRequest, ModelUsage, ToolDefinition } from '../llm/provider.js';
import type { FixTarget } from '../runs/store.js';
import type { LocatedElement } from '../sourcemap/ast-search.js';

export interface PatchProposal {
  replacement: string;
  rationale: string;
  model: string;
  usage: ModelUsage;
}

const PATCH_TOOL: ToolDefinition = {
  name: 'propose_patch',
  description: 'Propose the replacement for the located lines. Call exactly once.',
  inputSchema: {
    type: 'object',
    properties: {
      replacement: {
        type: 'string',
        description: 'The new source text that replaces the located lines exactly, including indentation. No markdown fences.',
      },
      rationale: { type: 'string', description: 'One or two sentences: what changed and why it removes the blocker.' },
    },
    required: ['replacement', 'rationale'],
    additionalProperties: false,
  },
};

const SYSTEM = `You fix one accessibility blocker in a React (JSX/TSX) codebase with the smallest correct change.

A screen-reader agent tried to complete a task using only the accessibility tree and the keyboard, and was
stopped. You are given the blocker it reported, the element in the rendered page, and the source lines that
render that element. Replace those lines, and only those lines.

Rules:
- Keep behaviour, handlers, props and className exactly as they are. Do not restyle.
- Prefer native semantics: a control that performs an action is a <button type="button">, not a div with a role.
- Give every control an accessible name that says what it does for this item, using values already in scope
  (for example a product's name), with aria-label when there is no visible text.
- A dialog gets role="dialog", aria-modal="true", aria-labelledby pointing at its heading, and focus moved into
  it when it opens. Everything must fit inside the replaced lines, so move focus with an inline ref callback
  (for example ref={(node) => { if (node && open && !node.contains(document.activeElement)) node.querySelector('button, a')?.focus(); }})
  rather than new hooks or imports.
- Do not add dependencies, comments or unrelated changes. Keep the original indentation.
- Call propose_patch exactly once.`;

function numbered(text: string, from: number, to: number): string {
  const lines = text.split('\n');
  const start = Math.max(1, from);
  const end = Math.min(lines.length, to);
  const width = String(end).length;
  return lines
    .slice(start - 1, end)
    .map((line, index) => `${String(start + index).padStart(width, ' ')}| ${line}`)
    .join('\n');
}

export function buildPatchRequest(input: {
  fileText: string;
  located: LocatedElement;
  blocker: BlockerInfo;
  target: FixTarget;
  goal: string;
  correction?: string;
}): ModelRequest {
  const { fileText, located, blocker, target, goal } = input;
  const lineCount = fileText.split('\n').length;
  const body = [
    `Goal the agent was pursuing: ${goal}`,
    `Blocker category: ${blocker.category} (${CATEGORY_GUIDE[blocker.category]})`,
    `WCAG: ${blocker.wcagCriteria.join(', ') || 'none'}`,
    `What the agent reported: ${blocker.summary}`,
    `The agent's reasoning: ${blocker.agentReasoning}`,
    '',
    `The element in the rendered page (${target.domPath}):`,
    target.outerHtml,
    '',
    `File: ${located.filePath} (${lineCount} lines). The whole file, numbered:`,
    numbered(fileText, 1, lineCount),
    '',
    `Replace lines ${located.lineStart} to ${located.lineEnd} inclusive:`,
    numbered(fileText, located.lineStart, located.lineEnd),
  ];
  if (input.correction) {
    body.push('', `Your previous replacement failed validation. Fix this and try again:\n${input.correction}`);
  }
  return {
    system: [{ type: 'text', text: SYSTEM }],
    messages: [{ role: 'user', content: [{ type: 'text', text: body.join('\n') }] }],
    tools: [PATCH_TOOL],
    maxTokens: 8000,
  };
}

export async function proposePatch(llm: LlmProvider, request: ModelRequest): Promise<PatchProposal | { error: string; model: string; usage: ModelUsage }> {
  // The patch is a reasoning call with one tool, the same shape as a decision.
  const response = await llm.decide(request);
  const call = response.toolCalls.find((toolCall) => toolCall.name === PATCH_TOOL.name);
  const input = call?.input as { replacement?: unknown; rationale?: unknown } | undefined;
  if (!input || typeof input.replacement !== 'string' || typeof input.rationale !== 'string') {
    return { error: 'The model did not call propose_patch with a replacement and a rationale.', model: response.model, usage: response.usage };
  }
  const replacement = input.replacement.replace(/^```\w*\n?|\n?```$/g, '').replace(/\r\n/g, '\n');
  return { replacement, rationale: input.rationale.trim(), model: response.model, usage: response.usage };
}

export interface AppliedPatch {
  content: string;
  diff: string;
  linesChanged: number;
  /** Where the new element sits in the patched file. */
  newLineStart: number;
  newLineEnd: number;
}

/** Replaces the located lines and renders a minimal unified diff with three lines of context. */
export function applyReplacement(fileText: string, filePath: string, located: LocatedElement, replacement: string): AppliedPatch {
  const eol = fileText.includes('\r\n') ? '\r\n' : '\n';
  const oldLines = fileText.split(/\r?\n/);
  const newBlock = replacement.replace(/\n$/, '').split('\n');
  const before = oldLines.slice(0, located.lineStart - 1);
  const oldBlock = oldLines.slice(located.lineStart - 1, located.lineEnd);
  const after = oldLines.slice(located.lineEnd);
  const newLines = [...before, ...newBlock, ...after];

  // Trim lines common to both ends of the block so the diff shows only what changed.
  let prefix = 0;
  while (prefix < oldBlock.length && prefix < newBlock.length && oldBlock[prefix] === newBlock[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < oldBlock.length - prefix &&
    suffix < newBlock.length - prefix &&
    oldBlock[oldBlock.length - 1 - suffix] === newBlock[newBlock.length - 1 - suffix]
  ) {
    suffix++;
  }
  const removed = oldBlock.slice(prefix, oldBlock.length - suffix);
  const added = newBlock.slice(prefix, newBlock.length - suffix);

  const changeStart = located.lineStart + prefix; // 1-based line in the old file
  const context = 3;
  const oldFrom = Math.max(1, changeStart - context);
  const leading = oldLines.slice(oldFrom - 1, changeStart - 1);
  const trailingStart = changeStart - 1 + removed.length;
  const trailing = oldLines.slice(trailingStart, trailingStart + context);
  const oldCount = leading.length + removed.length + trailing.length;
  const newCount = leading.length + added.length + trailing.length;

  const diff = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -${oldFrom},${oldCount} +${oldFrom},${newCount} @@`,
    ...leading.map((line) => ` ${line}`),
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
    ...trailing.map((line) => ` ${line}`),
  ].join('\n');

  return {
    content: newLines.join(eol),
    diff,
    linesChanged: removed.length + added.length,
    newLineStart: located.lineStart,
    newLineEnd: located.lineStart + newBlock.length - 1,
  };
}
