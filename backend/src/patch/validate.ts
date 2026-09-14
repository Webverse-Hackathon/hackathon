/**
 * The five gates a patch passes before it may be called a fix (docs/07). A
 * patch that fails any of them is a SUGGESTION and is never shown as a fix (F-33).
 *
 *   appliesCleanly  the located lines are still what we read
 *   parses          the patched file has no syntax errors
 *   typechecks      tsc passes on the patched site
 *   jsxA11y         eslint-plugin-jsx-a11y (strict) reports nothing in the changed lines
 *   sizeOk          the change is small
 */

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { PatchGateResults } from '@ally/shared';
import { ESLint } from 'eslint';
import { ts } from 'ts-morph';

export const MAX_LINES_CHANGED = 30;

export interface GateReport {
  gates: PatchGateResults;
  passed: boolean;
  /** Human-readable failures, fed back to the model on the next attempt. */
  problems: string[];
}

const require = createRequire(import.meta.url);

function syntaxErrors(filePath: string, content: string): string[] {
  const output = ts.transpileModule(content, {
    fileName: filePath,
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2022 },
  });
  return (output.diagnostics ?? []).map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

function runTsc(projectDir: string, timeoutMs = 90_000): Promise<{ ok: boolean; output: string }> {
  const tsc = require.resolve('typescript/lib/tsc.js');
  return new Promise((resolve) => {
    // Node plus an absolute script path, not `pnpm exec`: no shell, so it works on Windows too (F-71).
    const child = spawn(process.execPath, [tsc, '--noEmit', '-p', projectDir], { cwd: projectDir });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output: output.trim() });
    });
  });
}

async function jsxA11yProblems(filePath: string, content: string, fromLine: number, toLine: number): Promise<string[]> {
  const [{ default: jsxA11y }, { default: tseslint }] = await Promise.all([
    import('eslint-plugin-jsx-a11y'),
    import('typescript-eslint'),
  ]);
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.tsx', '**/*.jsx'],
        languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
        plugins: { 'jsx-a11y': jsxA11y as unknown as ESLint.Plugin },
        rules: jsxA11y.flatConfigs.strict.rules as ESLint.ConfigData['rules'],
      },
    ],
  });
  const [result] = await eslint.lintText(content, { filePath: path.resolve('ally-patch-check', filePath) });
  // The rest of the file may be deliberately broken (it is a fixture); judge only what we changed.
  return (result?.messages ?? [])
    .filter((message) => message.severity === 2 && message.line >= fromLine && message.line <= toLine)
    .map((message) => `line ${message.line}: ${message.message} (${message.ruleId ?? 'parse'})`);
}

export interface ValidateInput {
  filePath: string;
  originalText: string;
  expectedOriginal: string;
  patchedText: string;
  newLineStart: number;
  newLineEnd: number;
  linesChanged: number;
  /** A copy of the site where the patched file is written for tsc. */
  projectDir: string;
}

export async function validatePatch(input: ValidateInput): Promise<GateReport> {
  const problems: string[] = [];
  const gates: PatchGateResults = { appliesCleanly: false, parses: false, typechecks: false, jsxA11y: false, sizeOk: false };

  gates.appliesCleanly = input.originalText === input.expectedOriginal;
  if (!gates.appliesCleanly) problems.push('The file changed since it was read, so the patch no longer applies.');

  gates.sizeOk = input.linesChanged > 0 && input.linesChanged <= MAX_LINES_CHANGED;
  if (input.linesChanged === 0) problems.push('The replacement is identical to the original: nothing changed.');
  else if (!gates.sizeOk) problems.push(`The change touches ${input.linesChanged} lines; keep it under ${MAX_LINES_CHANGED}.`);

  const syntax = syntaxErrors(input.filePath, input.patchedText);
  gates.parses = syntax.length === 0;
  if (!gates.parses) problems.push(`Syntax errors: ${syntax.slice(0, 3).join('; ')}`);

  if (gates.parses) {
    const a11y = await jsxA11yProblems(input.filePath, input.patchedText, input.newLineStart, input.newLineEnd).catch(
      (error: unknown) => [`jsx-a11y could not run: ${error instanceof Error ? error.message : String(error)}`],
    );
    gates.jsxA11y = a11y.length === 0;
    if (!gates.jsxA11y) problems.push(`jsx-a11y: ${a11y.slice(0, 4).join('; ')}`);

    writeFileSync(path.join(input.projectDir, input.filePath), input.patchedText);
    const tsc = await runTsc(input.projectDir);
    gates.typechecks = tsc.ok;
    if (!tsc.ok) problems.push(`tsc: ${tsc.output.split('\n').slice(0, 5).join('\n')}`);
  }

  const passed = Object.values(gates).every(Boolean);
  return { gates, passed, problems };
}
