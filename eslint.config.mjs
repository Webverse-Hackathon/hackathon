// One flat config for the whole workspace. Each package's `lint` script runs
// ESLint from its own directory, and ESLint finds this file by walking upward.

import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';

const sdkImports = {
  group: ['@anthropic-ai/sdk', '@anthropic-ai/sdk/*'],
  message: 'Only backend/src/llm/ may import a model SDK. Go through the LlmProvider interface.',
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      'recordings/**',
      // The fixture sites are deliberately inaccessible. Linting them with
      // jsx-a11y would demand we fix the very blockers the agent must find.
      'fixtures/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // The correctness-critical paths. See CLAUDE.md: no `any` here.
  {
    files: ['backend/src/agent/**/*.ts', 'backend/src/driver/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // CLAUDE.md: every LLM call goes through backend/src/llm/. No SDK imports elsewhere.
  {
    files: ['backend/src/**/*.ts'],
    ignores: ['backend/src/llm/**', 'backend/src/agent/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [sdkImports] }],
    },
  },

  // Purity suite P-4: the agent never touches the browser, the preview or the
  // source mapper directly. docs/10-TEST-CASES.md, section 1. It receives an
  // AgentDriver already bound to a session, and may import only the pure driver
  // modules (types, serialize, hash, tree).
  {
    files: ['backend/src/agent/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['playwright', 'playwright/*', 'playwright-core', 'playwright-core/*', '@playwright/*'],
              message: 'agent/ must not import Playwright. Perceive and act only through driver/ (P-4).',
            },
            {
              group: ['**/preview', '**/preview/**', '**/sourcemap', '**/sourcemap/**'],
              message: 'agent/ must not import preview/ or sourcemap/. The agent never receives pixels (P-4).',
            },
            {
              group: ['**/driver/index*', '**/driver/session*', '**/driver/internal*', '**/driver/cdp*', '**/driver/stabilize*'],
              message: 'agent/ must not import driver internals. It receives an AgentDriver (P-4).',
            },
            {
              group: [...sdkImports.group, '**/llm/anthropic*'],
              message: 'agent/ talks to models only through the LlmProvider interface.',
            },
          ],
        },
      ],
    },
  },

  // We ship an accessibility product: every jsx-a11y rule is an error on our own UI.
  {
    files: ['frontend/**/*.{ts,tsx,js,jsx}'],
    ...jsxA11y.flatConfigs.strict,
  },
);
