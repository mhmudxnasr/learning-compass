import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const home = process.env.HOME || '/home/mahmud'
const hermesRoot = join(home, '.hermes')
const canonicalSkills = join(hermesRoot, 'skills')
const managerRoot = join(hermesRoot, 'hermes-agent')

const run = (label, command, args, cwd = repoRoot) => {
  console.log(`\n==> ${label}`)
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`)
}

const capture = (command, args, cwd = repoRoot) => {
  const result = spawnSync(command, args, { cwd, env: process.env, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`)
  return result.stdout
}

const relevantFiles = (root) => {
  if (!existsSync(root)) throw new Error(`Required release input is missing: ${root}`)
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (['__pycache__', '.usage', '.hub'].includes(entry.name)) return []
      const path = join(dir, entry.name)
      return entry.isDirectory() ? walk(path) : [path]
    })
  return walk(root)
    .filter((path) => !path.endsWith('.pyc'))
    .sort()
}

const assertNativeAdapter = () => {
  for (const file of ['plugin.yaml', '__init__.py', 'tools.py', 'pdf_worker.py']) {
    const source = readFileSync(join(repoRoot, 'integrations', 'hermes-compass', file))
    const installed = readFileSync(join(hermesRoot, 'plugins', 'compass-native', file))
    if (!source.equals(installed)) throw new Error(`Native Compass adapter drift: ${file}`)
  }
}

const assertNoRetiredClientAuth = () => {
  const executableChecks = [
    [
      'workflow/learning-compass-site-operator/scripts/site_request.py',
      [
        /TASTE_MAP_API_TOKEN/,
        /learning-compass-api-token/,
        /headers\s*\[\s*["']x-api-token["']\s*\]\s*=/i,
        /add_header\(\s*["']x-api-token["']/i,
        /^\s*token:\s*str\s*$/m,
        /config\.token\b/,
      ],
    ],
    [
      'lite-visual/scripts/upload_pair.py',
      [/TASTE_MAP_API_TOKEN/, /learning-compass-api-token/, /add_header\(\s*["']x-api-token["']/i],
    ],
    [
      'lite-visual/scripts/run_workflow.py',
      [/TASTE_MAP_API_TOKEN/, /learning-compass-api-token/, /headers\s*\[\s*["']x-api-token["']\s*\]\s*=/i],
    ],
  ]
  for (const [relativePath, patterns] of executableChecks) {
    for (const root of [canonicalSkills]) {
      const file = join(root, relativePath)
      const source = readFileSync(file, 'utf8')
      for (const pattern of patterns) {
        if (pattern.test(source))
          throw new Error(`Retired Learning Compass auth plumbing remains in ${file}: ${pattern}`)
      }
    }
  }

  for (const [relativePath, required] of [
    [
      'workflow/learning-compass-site-operator/references/write-operations.md',
      'ordinary reads and writes are public at the transport layer',
    ],
    [
      'workflow/recommendations-worker-ops/references/api-and-learning-contracts.md',
      'Ordinary Learning Compass reads and writes are public at the transport layer',
    ],
  ]) {
    for (const root of [canonicalSkills]) {
      const source = readFileSync(join(root, relativePath), 'utf8')
      if (!source.includes(required))
        throw new Error(`Public Learning Compass API contract is missing from ${join(root, relativePath)}`)
    }
  }
}

const assertNoRetiredReleaseDocsAuth = () => {
  const topLevel = readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:html|json|md|txt|ya?ml)$/.test(entry.name))
    .map((entry) => join(repoRoot, entry.name))
  const documentation = [
    ...topLevel,
    ...relevantFiles(join(repoRoot, 'docs')),
    join(repoRoot, 'browser-extension', 'README.md'),
  ].filter((file) => /\.(?:html|json|md|txt|ya?ml)$/.test(file))
  for (const file of documentation) {
    const source = readFileSync(file, 'utf8')
    for (const retired of ['REQUIRE_API_AUTH', 'LEARNING_COMPASS_API_TOKEN', 'TASTE_MAP_API_TOKEN', 'x-api-token']) {
      if (source.includes(retired))
        throw new Error(
          `Retired Learning Compass auth credential remains in release documentation: ${relative(repoRoot, file)} (${retired})`,
        )
    }
  }
}

const changedFiles = () => {
  const base = capture('git', ['merge-base', 'HEAD', 'origin/main']).trim()
  const committed = capture('git', ['diff', base, 'HEAD', '--name-only', '--diff-filter=ACMRTUXB']).split('\n')
  const tracked = capture('git', ['diff', 'HEAD', '--name-only', '--diff-filter=ACMRTUXB']).split('\n')
  const untracked = capture('git', ['ls-files', '--others', '--exclude-standard']).split('\n')
  return [...new Set([...committed, ...tracked, ...untracked].filter(Boolean))]
}

const textExtensions = new Set([
  '',
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.py',
  '.sh',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
])
const credentialPatterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['OpenAI-style secret', /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Telegram bot token', /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/],
]

const inspectChangedFiles = () => {
  for (const name of changedFiles()) {
    const path = join(repoRoot, name)
    if (!existsSync(path) || !lstatSync(path).isFile()) continue
    if (!textExtensions.has(extname(path).toLowerCase()) || lstatSync(path).size > 2_000_000) continue
    const source = readFileSync(path, 'utf8')
    if (source.split('\n').some((line) => /[ \t]+$/.test(line)))
      throw new Error(`Trailing whitespace in changed file: ${name}`)
    for (const [label, pattern] of credentialPatterns) {
      if (pattern.test(source)) throw new Error(`Potential ${label} in changed file: ${name}`)
    }
  }
}

const pythonRoots = [
  join(canonicalSkills, 'workflow', 'learning-compass-site-operator'),
  join(canonicalSkills, 'lite-visual'),
]
for (const root of pythonRoots) if (!existsSync(root)) throw new Error(`Required installed client is missing: ${root}`)
if (!existsSync(join(managerRoot, 'scripts', 'run_tests.sh')))
  throw new Error('Deterministic Hermes manager harness is missing')

inspectChangedFiles()
assertNativeAdapter()
assertNoRetiredClientAuth()
assertNoRetiredReleaseDocsAuth()

run('Code style and static analysis', 'npm', ['run', 'quality'])
run('Free-tier budget policy', 'npm', ['run', 'verify:budget'])
run('Unit tests and TypeScript', 'npm', ['test'])
run('Production build', 'npm', ['run', 'build'])
run('Standalone Worker and D1 integration scenarios', 'npm', ['run', 'test:integration'])
run('Worker-backed responsive, PWA, offline, and public-boundary E2E', 'npm', ['run', 'test:e2e'])
run('Hermes contracts and Telegram prompt budgets', 'npm', ['run', 'verify:hermes'])
run('Fresh and idempotent migration rehearsal', 'npm', ['run', 'verify:migrations'])
run('Agent control contract', 'npm', ['run', 'verify:agent-contract'])
run('Deterministic Hermes manager harness', 'npm', ['run', 'verify:manager'])

for (const root of [join(canonicalSkills, 'workflow', 'learning-compass-site-operator')]) {
  run(`Installed site-client tests: ${root}`, 'python3', [
    '-m',
    'unittest',
    'discover',
    '-s',
    join(root, 'tests'),
    '-p',
    'test_*.py',
  ])
}

run('Installed Python client syntax', 'python3', [
  '-c',
  "from pathlib import Path; import sys; [compile(p.read_text(), str(p), 'exec') for root in sys.argv[1:] for p in Path(root).rglob('*.py') if '__pycache__' not in p.parts]",
  ...pythonRoots,
])
for (const root of [join(canonicalSkills, 'lite-visual')]) {
  for (const file of relevantFiles(root).filter((path) => ['.js', '.mjs', '.cjs'].includes(extname(path)))) {
    run(`Installed Node client syntax: ${file}`, process.execPath, ['--check', file])
  }
}

run('Native Compass adapter tests', 'python3', ['integrations/hermes-compass/test_native.py', '-v'])

run('Final tracked diff check', 'git', ['diff', 'HEAD', '--check'])
inspectChangedFiles()
console.log('\nRelease candidate verification passed without production mutation.')
