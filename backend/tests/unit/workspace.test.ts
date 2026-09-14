import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { patchesOnVerifySite, syncVerifySite } from '../../src/fix/workspace.js';

let root = '';
let source = '';
let verify = '';

function write(dir: string, filePath: string, content: string): void {
  mkdirSync(path.dirname(path.join(dir, filePath)), { recursive: true });
  writeFileSync(path.join(dir, filePath), content);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'ally-workspace-'));
  source = path.join(root, 'source');
  verify = path.join(root, 'verify');
  write(source, 'components/ProductCard.tsx', '<div className="add" />');
  write(source, 'components/Header.tsx', '<header />');
  write(source, 'app/globals.css', '.add { cursor: pointer; }');
  mkdirSync(verify);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('patchesOnVerifySite (F-81)', () => {
  it('finds nothing on a freshly synced verify site', () => {
    syncVerifySite(source, verify, {});
    expect(patchesOnVerifySite(source, verify)).toEqual({});
  });

  it('returns exactly the patched source files, so a later fix builds on them instead of wiping them', () => {
    const patched = '<button type="button" className="add" aria-label="Add" />';
    syncVerifySite(source, verify, { 'components/ProductCard.tsx': patched });
    expect(patchesOnVerifySite(source, verify)).toEqual({ 'components/ProductCard.tsx': patched });

    // Fixing a run started on the verify site syncs with those overrides plus its own patch.
    syncVerifySite(source, verify, { ...patchesOnVerifySite(source, verify), 'components/Header.tsx': '<header role="banner" />' });
    expect(Object.keys(patchesOnVerifySite(source, verify)).sort()).toEqual(['components/Header.tsx', 'components/ProductCard.tsx']);
  });

  it('ignores files a patch can never target', () => {
    syncVerifySite(source, verify, {});
    write(verify, 'app/globals.css', '.add { cursor: default; }');
    expect(patchesOnVerifySite(source, verify)).toEqual({});
  });

  it('returns nothing when the verify site does not exist', () => {
    expect(patchesOnVerifySite(source, path.join(root, 'missing'))).toEqual({});
  });
});
