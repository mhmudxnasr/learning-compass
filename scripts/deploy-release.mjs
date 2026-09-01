import { spawnSync } from 'node:child_process'

const repoRoot = new URL('..', import.meta.url).pathname
const productionOrigin = 'https://recommendations-worker.mhmudnasr30.workers.dev'

const run = (label, command, args) => {
  console.log(`\n==> ${label}`)
  const result = spawnSync(command, args, { cwd: repoRoot, env: process.env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`)
}

const requireReadiness = async (phase) => {
  const response = await fetch(`${productionOrigin}/health/ready`, {
    headers: { 'user-agent': 'LearningCompassRelease/1.0' },
    signal: AbortSignal.timeout(20_000),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body.ok !== true) {
    throw new Error(
      `${phase} production readiness failed (${response.status}): ${JSON.stringify(body.blockers || body)}`,
    )
  }
  console.log(`${phase} production readiness passed`)
}

run('Deterministic aggregate release gate', 'npm', ['run', 'verify:release'])
await requireReadiness('Pre-deploy')
run('Cloudflare Worker and assets deployment', 'npx', ['wrangler', 'deploy', '--config', 'wrangler.toml'])
await requireReadiness('Post-deploy')
run('Live deployment smoke verification', 'bash', [
  '/home/mahmud/.hermes/skills/workflow/recommendations-worker-ops/scripts/verify-deploy.sh',
  productionOrigin,
])

console.log('\nApplication release deployed and verified.')
