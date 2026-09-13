/**
 * Records a keystroke session against a live page as a golden fixture: the AX
 * snapshot before the first key and after every key. Replayed by the
 * serialiser golden test and the purity suite with no browser and no network.
 *
 *   pnpm --filter @ally/backend exec tsx tests/tools/record-session.ts \
 *     --url http://localhost:3100 --out tests/fixtures/broken-shop/home-tab-cart.json \
 *     --keys Tab,Tab,Tab,Tab,Tab,Enter,Tab
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { AllowedKeySchema, type AllowedKey } from '@ally/shared';
import { bindAgentDriver, closeSession, openSession } from '../../src/driver/session.js';
import type { AXSnapshot } from '../../src/driver/types.js';

export interface RecordedSession {
  url: string;
  recordedAt: string;
  keys: AllowedKey[];
  /** snapshots[0] is before any key; snapshots[i] is after keys[i - 1]. */
  snapshots: AXSnapshot[];
}

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    out: { type: 'string' },
    keys: { type: 'string', default: '' },
  },
});

if (!values.url || !values.out) {
  console.error('usage: record-session.ts --url <url> --out <file.json> --keys Tab,Enter,...');
  process.exit(2);
}

const keys = values.keys
  .split(',')
  .filter((key) => key !== '')
  .map((key) => AllowedKeySchema.parse(key));

const session = await openSession(values.url);
try {
  const driver = bindAgentDriver(session);
  const snapshots: AXSnapshot[] = [await driver.axSnapshot()];
  for (const key of keys) {
    await driver.pressKey(key);
    snapshots.push(await driver.axSnapshot());
  }
  const recording: RecordedSession = { url: values.url, recordedAt: new Date().toISOString(), keys, snapshots };
  await mkdir(path.dirname(values.out), { recursive: true });
  await writeFile(values.out, `${JSON.stringify(recording, null, 1)}\n`);
  console.log(`recorded ${snapshots.length} snapshots to ${values.out}`);
} finally {
  await closeSession(session);
}
