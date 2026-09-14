/**
 * DOM element → JSX element, by searching the source for a host element with
 * the same tag and the same class list (docs/07, strategy 3: AST search).
 *
 * Confidence is 1 when exactly one element in the source matches, and falls
 * with every other candidate. Below LOCATE_CONFIDENCE_THRESHOLD the fix flow
 * refuses to patch: we never change a file we are not sure we identified.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { ts } from 'ts-morph';
import type { FixTarget } from '../runs/store.js';

export interface LocatedElement {
  /** Relative to the source directory, with forward slashes. */
  filePath: string;
  /** 1-based, inclusive, covering the whole element from `<` to its closing tag. */
  lineStart: number;
  lineEnd: number;
  column: number;
  confidence: number;
  candidates: number;
}

const SKIP_DIRECTORIES = new Set(['node_modules', '.next', 'dist', 'build', 'out', '.git', 'public']);

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRECTORIES.has(entry)) continue;
    const full = path.join(directory, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...sourceFiles(full));
    else if (/\.(tsx|jsx)$/.test(entry)) files.push(full);
  }
  return files;
}

function classSet(value: string | null): string {
  return (value ?? '').split(/\s+/).filter(Boolean).sort().join(' ');
}

function staticClassName(attributes: ts.JsxAttributes): string | null | undefined {
  for (const property of attributes.properties) {
    if (!ts.isJsxAttribute(property) || property.name.getText() !== 'className') continue;
    const initializer = property.initializer;
    if (!initializer) return '';
    if (ts.isStringLiteral(initializer)) return initializer.text;
    if (ts.isJsxExpression(initializer) && initializer.expression && ts.isNoSubstitutionTemplateLiteral(initializer.expression)) {
      return initializer.expression.text;
    }
    // A computed className cannot be matched statically.
    return undefined;
  }
  return null;
}

/** The overrides are the files as the running site was built: source plus any earlier patches. */
export function readSource(sourceDir: string, filePath: string, overrides: Record<string, string>): string {
  return overrides[filePath] ?? readFileSync(path.join(sourceDir, filePath), 'utf8');
}

export function locateElement(sourceDir: string, target: FixTarget, overrides: Record<string, string> = {}): LocatedElement | null {
  const wantedClasses = classSet(target.className);
  const matches: Omit<LocatedElement, 'confidence' | 'candidates'>[] = [];

  for (const absolute of sourceFiles(sourceDir)) {
    const filePath = path.relative(sourceDir, absolute).split(path.sep).join('/');
    const text = readSource(sourceDir, filePath, overrides);
    const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const visit = (node: ts.Node) => {
      let opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement | null = null;
      if (ts.isJsxElement(node)) opening = node.openingElement;
      else if (ts.isJsxSelfClosingElement(node)) opening = node;

      if (opening && opening.tagName.getText() === target.tagName) {
        const className = staticClassName(opening.attributes);
        if (className !== undefined && classSet(className) === wantedClasses) {
          const start = source.getLineAndCharacterOfPosition(node.getStart(source));
          const end = source.getLineAndCharacterOfPosition(node.getEnd());
          matches.push({ filePath, lineStart: start.line + 1, lineEnd: end.line + 1, column: start.character + 1 });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  const best = matches[0];
  if (!best) return null;
  // An element with no class at all is a weak identity even when unique.
  const base = wantedClasses ? 1 : 0.5;
  return { ...best, confidence: base / matches.length, candidates: matches.length };
}
