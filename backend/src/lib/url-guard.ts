/**
 * F-01: the browser must never be pointed at a private, loopback, link-local or
 * metadata address, because it runs on our network. The only exception is a
 * host listed in ALLY_PRIVATE_HOST_ALLOWLIST, which for the demo is the local
 * fixture on localhost.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class UrlRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlRejected';
  }
}

function ipv4Private(address: string): boolean {
  const parts = address.split('.').map(Number);
  const [a = -1, b = -1] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return ipv4Private(address);
  if (version === 6) {
    const lower = address.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return ipv4Private(mapped[1]);
    return lower === '::' || lower === '::1' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith('ff');
  }
  return true;
}

export async function assertPublicUrl(raw: string, allowlist: readonly string[]): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlRejected('That is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new UrlRejected('Only http and https addresses can be tested.');
  if (url.username || url.password) throw new UrlRejected('URLs with credentials are not allowed.');

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (allowlist.includes(host)) return url;

  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((entry) => entry.address);
  } catch {
    throw new UrlRejected(`Could not resolve ${host}.`);
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new UrlRejected('Private network addresses are not allowed.');
  }
  return url;
}
