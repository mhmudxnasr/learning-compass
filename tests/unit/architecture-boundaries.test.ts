import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { ESLint } from 'eslint'

const root = new URL('../../', import.meta.url)
const eslint = new ESLint({
  cwd: fileURLToPath(root),
  overrideConfigFile: fileURLToPath(new URL('eslint.config.js', root)),
})

test('lint rejects imports against module ownership, including type exports and lazy imports', async () => {
  for (const [file, dependency] of [
    ['src/api/example.ts', '../../client/src/api'],
    ['src/services/example.ts', '../../client/src/theme'],
    ['src/services/example.ts', '../api/capture'],
    ['src/services/example.ts', '../index.ts'],
    ['src/domain.ts', './api/capture'],
    ['src/domain.ts', 'preact/hooks'],
    ['client/src/app/example.ts', '../../../src/domain'],
    ['client/src/features/example/View.tsx', '../../workspaces/LearnWorkspace'],
  ]) {
    for (const source of [
      `import '${dependency}'`,
      `export type { Example } from '${dependency}'`,
      `export const load = () => import('${dependency}')`,
    ]) {
      const [result] = await eslint.lintText(source, { filePath: fileURLToPath(new URL(file, root)) })
      assert.ok(
        result.messages.some((message) =>
          ['no-restricted-imports', 'no-restricted-syntax'].includes(message.ruleId || ''),
        ),
        `${file}: ${source}`,
      )
    }
  }
})

test('lint allows dependencies toward the owning domain and reusable client features', async () => {
  for (const [file, dependency] of [
    ['src/api/example.ts', '../services/capture'],
    ['src/services/example.ts', '../domain'],
    ['client/src/workspaces/Example.tsx', '../features/atlas/model'],
    ['client/src/features/example/View.tsx', '../../api'],
  ]) {
    const [result] = await eslint.lintText(`import '${dependency}'`, { filePath: fileURLToPath(new URL(file, root)) })
    assert.equal(result.errorCount, 0, JSON.stringify(result.messages))
  }
})
