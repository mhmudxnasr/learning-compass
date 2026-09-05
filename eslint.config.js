import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const workerImports = [
  { regex: '^(\\.\\./)+client/', message: 'Worker code must not depend on the browser client.' },
  { regex: '^(preact|cytoscape)(/|$)', message: 'UI libraries belong in client/.' },
]
const clientImports = [
  { regex: '^(\\.\\./)+src/', message: 'Use the shared HTTP client; do not import Worker implementation.' },
]
const importRules = (patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
  'no-restricted-syntax': [
    'error',
    ...patterns.map(({ regex, message }) => ({
      selector: `ImportExpression[source.value=/${regex.replaceAll('/', '\\/')}/]`,
      message,
    })),
  ],
})

export default tseslint.config(
  {
    ignores: [
      'backups/**',
      'client/public/**',
      'dist/**',
      'node_modules/**',
      'test-results/**',
      '.wrangler/**',
      '.tmp/**',
      'tmp/**',
      '.codex-tmp/**',
      'whatsapp-insights-site/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['src/**/*.ts'], rules: importRules(workerImports) },
  {
    files: ['src/services/**/*.ts', 'src/domain.ts'],
    rules: importRules([
      ...workerImports,
      {
        regex: '^(\\.\\.?/)+(api/|index(\\.ts)?$)',
        message: 'Services and domain rules must not import HTTP routes or the composition root.',
      },
    ]),
  },
  { files: ['client/src/**/*.{ts,tsx}'], rules: importRules(clientImports) },
  {
    files: ['client/src/features/**/*.{ts,tsx}'],
    rules: importRules([
      ...clientImports,
      {
        regex: '^(\\.\\./)+workspaces/',
        message: 'Workspaces compose features; features must not depend on workspaces.',
      },
    ]),
  },
  {
    files: ['client/src/**/*.{ts,tsx}', 'src/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['browser-extension/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}', 'tests/**/*.{ts,js,mjs}', 'vite*.{ts,mjs}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
)
