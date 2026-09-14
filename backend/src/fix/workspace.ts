/**
 * The verify site: a copy of the connected source, served by its own dev
 * server, into which the patched files are written. Syncing only rewrites
 * files whose content differs, so the dev server recompiles just those.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const COPY_ROOTS = ['app', 'components', 'lib', 'public', 'pages', 'src', 'styles'];

function writeIfChanged(file: string, content: Buffer | string): void {
  const next = typeof content === 'string' ? Buffer.from(content) : content;
  if (existsSync(file) && readFileSync(file).equals(next)) return;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, next);
}

function copyTree(from: string, to: string): void {
  for (const entry of readdirSync(from)) {
    const source = path.join(from, entry);
    const target = path.join(to, entry);
    if (statSync(source).isDirectory()) copyTree(source, target);
    else writeIfChanged(target, readFileSync(source));
  }
}

/** Makes verifyDir's source equal to sourceDir's, then applies the overrides on top. */
export function syncVerifySite(sourceDir: string, verifyDir: string, overrides: Record<string, string>): void {
  if (!existsSync(verifyDir)) throw new Error(`The verify site ${verifyDir} does not exist. See fixtures/fixed-shop/README.md.`);
  for (const root of COPY_ROOTS) {
    const from = path.join(sourceDir, root);
    if (existsSync(from)) copyTree(from, path.join(verifyDir, root));
  }
  for (const [filePath, content] of Object.entries(overrides)) writeIfChanged(path.join(verifyDir, filePath), content);
}

/** Only files a patch can target (see sourcemap/ast-search.ts) are ever overrides. */
const PATCHABLE = /\.(tsx|jsx)$/;

function patchedFiles(sourceDir: string, verifyDir: string, relative: string, found: Record<string, string>): void {
  for (const entry of readdirSync(path.join(verifyDir, relative))) {
    const filePath = path.posix.join(relative, entry);
    const full = path.join(verifyDir, filePath);
    if (statSync(full).isDirectory()) {
      patchedFiles(sourceDir, verifyDir, filePath, found);
      continue;
    }
    if (!PATCHABLE.test(entry)) continue;
    const content = readFileSync(full);
    const original = path.join(sourceDir, filePath);
    if (!existsSync(original) || !readFileSync(original).equals(content)) found[filePath] = content.toString('utf8');
  }
}

/**
 * The patches the verify site is serving right now: every source file that differs
 * from the connected source. A run started by hand on the verify site inherits these
 * as its overrides, so fixing that run builds on them instead of wiping them (F-81).
 */
export function patchesOnVerifySite(sourceDir: string, verifyDir: string): Record<string, string> {
  const found: Record<string, string> = {};
  if (!existsSync(verifyDir)) return found;
  for (const root of COPY_ROOTS) {
    if (existsSync(path.join(verifyDir, root))) patchedFiles(sourceDir, verifyDir, root, found);
  }
  return found;
}

/** Waits until the site answers, then gives the dev server a moment to pick up changed files. */
export async function waitForSite(url: string, timeoutMs = 60_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}
