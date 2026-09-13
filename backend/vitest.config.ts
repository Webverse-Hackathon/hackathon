import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Test against the shared package's source, so a change there needs no rebuild.
    alias: { '@ally/shared': path.join(here, '../packages/shared/src/index.ts') },
  },
  test: {
    environment: 'node',
  },
});
