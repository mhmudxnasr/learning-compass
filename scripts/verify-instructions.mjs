// npm run verify:instructions: check repository guidance without an installed Hermes runtime.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { auditInstructions, formatInstructionIssues } from './hermes-instruction-audit.mjs'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const paths = [
  'AGENTS.md',
  'README.md',
  'PROJECT_CONTEXT.md',
  '.hermes.md',
  'docs/architecture.md',
  'docs/release-checklist.md',
  '.opencode/skills/learning-compass/SKILL.md',
  '.opencode/skills/learning-thread-authoring/SKILL.md',
]
const issues = auditInstructions({
  repoRoot,
  skillsRoot: join(homedir(), '.hermes', 'skills'),
  packageScripts: JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).scripts,
  documents: paths.map((name) => ({ path: join(repoRoot, name), text: readFileSync(join(repoRoot, name), 'utf8') })),
  // Installed skill paths are checked by verify:hermes on the operator's machine.
  exists: (path) => !path.startsWith(`${repoRoot}${sep}`) || existsSync(path),
})
if (issues.length) {
  console.error(formatInstructionIssues(issues, repoRoot))
  process.exitCode = 1
} else console.log(`Repository instructions passed (${paths.length} documents).`)
