import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isPrivateAddress, assertPublicUrl } from '../../src/lib/url-guard.js';
import { applyReplacement } from '../../src/patch/generate.js';
import { locateElement } from '../../src/sourcemap/ast-search.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const shop = path.join(here, '../../../fixtures/broken-shop');

describe('locateElement (AST search)', () => {
  it('maps div.add to ProductCard.tsx lines 43–45 with full confidence: one source element renders all six cards', () => {
    const located = locateElement(shop, { tagName: 'div', className: 'add', outerHtml: '', domPath: '', textContent: '' });
    expect(located).toEqual({ filePath: 'components/ProductCard.tsx', lineStart: 43, lineEnd: 45, column: 9, confidence: 1, candidates: 1 });
  });

  it('maps the cart overlay to CartDialog.tsx line 12', () => {
    const located = locateElement(shop, { tagName: 'div', className: 'overlay', outerHtml: '', domPath: '', textContent: '' });
    expect(located?.filePath).toBe('components/CartDialog.tsx');
    expect(located?.lineStart).toBe(12);
  });

  it('reads a patched file from the overrides instead of disk', () => {
    const original = readFileSync(path.join(shop, 'components/ProductCard.tsx'), 'utf8');
    const overrides = { 'components/ProductCard.tsx': original.replace('className="add"', 'className="add-button"') };
    expect(locateElement(shop, { tagName: 'div', className: 'add', outerHtml: '', domPath: '', textContent: '' }, overrides)).toBeNull();
  });

  it('returns null when nothing matches, rather than guessing', () => {
    expect(locateElement(shop, { tagName: 'section', className: 'nope', outerHtml: '', domPath: '', textContent: '' })).toBeNull();
  });
});

describe('applyReplacement', () => {
  const file = ['a', 'b', '  <div x>', '    <Icon />', '  </div>', 'c', 'd'].join('\n');
  const located = { filePath: 'f.tsx', lineStart: 3, lineEnd: 5, column: 3, confidence: 1, candidates: 1 };

  it('replaces only the located lines and diffs only what changed', () => {
    const applied = applyReplacement(file, 'f.tsx', located, '  <button x>\n    <Icon />\n  </button>');
    expect(applied.content).toBe(['a', 'b', '  <button x>', '    <Icon />', '  </button>', 'c', 'd'].join('\n'));
    expect(applied.linesChanged).toBe(6);
    expect(applied.diff).toBe(
      ['--- a/f.tsx', '+++ b/f.tsx', '@@ -1,7 +1,7 @@', ' a', ' b', '-  <div x>', '-    <Icon />', '-  </div>', '+  <button x>', '+    <Icon />', '+  </button>', ' c', ' d'].join('\n'),
    );
  });

  it('keeps CRLF line endings and reports no change for an identical replacement', () => {
    const crlf = file.replace(/\n/g, '\r\n');
    const same = applyReplacement(crlf, 'f.tsx', located, '  <div x>\n    <Icon />\n  </div>\n');
    expect(same.content).toBe(crlf);
    expect(same.linesChanged).toBe(0);
  });
});

describe('url guard (F-01)', () => {
  it('classifies private, loopback, link-local and metadata addresses', () => {
    for (const address of ['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.5.4', '192.168.1.1', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    for (const address of ['8.8.8.8', '172.32.0.1', '2606:4700::1111']) expect(isPrivateAddress(address), address).toBe(false);
  });

  it('refuses private hosts unless allow-listed, and non-http schemes always', async () => {
    await expect(assertPublicUrl('http://169.254.169.254/latest', ['localhost'])).rejects.toThrow(/Private/);
    await expect(assertPublicUrl('http://127.0.0.1:3100', [])).rejects.toThrow(/Private/);
    await expect(assertPublicUrl('file:///etc/passwd', ['localhost'])).rejects.toThrow(/http/);
    await expect(assertPublicUrl('http://user:pw@localhost', ['localhost'])).rejects.toThrow(/credentials/);
    await expect(assertPublicUrl('http://localhost:3100', ['localhost'])).resolves.toBeInstanceOf(URL);
  });
});
