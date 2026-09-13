import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // infra/docker/fixture.Dockerfile copies .next/standalone and expects
  // fixtures/broken-shop/server.js inside it, so trace from the repo root.
  output: 'standalone',
  outputFileTracingRoot: path.join(here, '../..'),
  // The dev-tools button would otherwise appear in the accessibility tree and
  // the agent would hear it on every snapshot.
  devIndicators: false,
  // ALLY_SOURCE=1 will enable the data-ally-src plugin here. That plugin is Day 3
  // work (docs/12-ROADMAP.md); until then the flag is accepted and has no effect.
};

export default nextConfig;
