/**
 * DOM element → JSX element, by searching the source for a host element with
 * the same tag and the same class list (docs/07, strategy 3: AST search). When
 * the rendered element has text, a candidate whose literal JSX text is the same
 * narrows the field (docs/10 M-03).
 *
 * Confidence is 1 when exactly one element with a class list matches, 0.9 when
 * a classless element is identified by its unique literal text, 0.5 when it is
 * identified by its tag alone, and falls with every other candidate. Below
 * LOCATE_CONFIDENCE_THRESHOLD the fix flow refuses to patch: we never change a
 * file we are not sure we identified.
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

/** A classless element named by its unique literal text: strong, but weaker than a class list. */
const TEXT_IDENTITY_CONFIDENCE = 0.9;

function collapse(text: string): string {
  return text.replace(/s+/g, ' ').trim();
}

/** The element's text as written in the source, or undefined when any part of it is computed. */
function staticText(node: ts.Node): string | undefined {
  if (ts.isJsxSelfClosingElement(node)) return '';
  if (!ts.isJsxElement(node) && !ts.isJsxFragment(node)) return undefined;
  const parts: string[] = [];
  for (const child of node.children) {
    if (ts.isJsxText(child)) parts.push(child.text);
    else if (ts.isJsxExpression(child)) {
      if (!child.expression) continue;
      if (ts.isStringLiteral(child.expression) || ts.isNoSubstitutionTemplateLiteral(child.expression)) parts.push(child.expression.text);
      else return undefined;
    } else {
      const inner = staticText(child);
      if (inner === undefined) return undefined;
      parts.push(inner);
    }
  }
  return collapse(parts.join(' '));
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
  const wantedText = collapse(target.textContent);
  const matches: (Omit<LocatedElement, 'confidence' | 'candidates'> & { text: string | undefined })[] = [];

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
          matches.push({ filePath, lineStart: start.line + 1, lineEnd: end.line + 1, column: start.character + 1, text: staticText(node) });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  // Literal text the page also rendered narrows the candidates. Computed text cannot, so it never excludes one.
  const byText = wantedText ? matches.filter((match) => match.text === wantedText) : [];
  const pool = byText.length > 0 ? byText : matches;
  const first = pool[0];
  if (!first) return null;
  const { text: _text, ...best } = first;
  // An element with no class and no matching literal text is a weak identity even when unique.
  const base = wantedClasses ? 1 : byText.length > 0 ? TEXT_IDENTITY_CONFIDENCE : 0.5;
  return { ...best, confidence: base / pool.length, candidates: pool.length };
}
