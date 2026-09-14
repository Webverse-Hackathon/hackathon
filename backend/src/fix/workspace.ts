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
