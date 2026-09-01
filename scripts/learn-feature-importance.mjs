#!/usr/bin/env node
// Regularized logistic-regression feature audit (Phase 3, item 10).
//
// Fits "did the learner engage" (consumed vs rejected) against the 8 Compass
// features persisted in recommendation_outcomes.predicted_components_json, with
// L2 regularization and the hand-tuned DEFAULT_FEATURE_WEIGHTS as the reference
// prior. The point is NOT to serve from these coefficients — it is to reveal
// which of the 8 features actually predict consumption before we trust the
// hand-tuned prior, and to catch features that are net-zero or wrong-signed.
//
// Usage: node scripts/learn-feature-importance.mjs [--local|--remote] [--json]
import { spawn } from 'node:child_process'

const MODE = process.argv.includes('--remote') ? 'remote' : 'local'
const AS_JSON = process.argv.includes('--json')
const wrangler = './node_modules/.bin/wrangler'

const FEATURES = [
  'topic_value',
  'personal_relevance',
  'source_quality',
  'information_gain',
  'novelty',
  'format_fit',
  'evidence_quality',
  'thread_contribution',
]
// The v2 hand-tuned prior (fit lane), as the comparison baseline.
const HAND_TUNED = {
  topic_value: 0.16,
  personal_relevance: 0.17,
  source_quality: 0.14,
  information_gain: 0.1,
  novelty: 0.06,
  format_fit: 0.06,
  evidence_quality: 0.11,
  thread_contribution: 0.2,
}

const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(wrangler, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    child.on('error', reject)
    child.on('close', (status) =>
      status === 0 ? resolve(output) : reject(new Error(`Wrangler failed (${status}): ${output.slice(0, 500)}`)),
    )
  })

const query = async (command) => {
  const output = await run([
    'd1',
    'execute',
    'recommendations-db',
    '--config',
    'wrangler.toml',
    '--' + MODE,
    '--command',
    command,
  ])
  const json = JSON.parse(output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1))
  return json.results || []
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z))

// Batch gradient descent, L2-regularized logistic regression. Features are all
// in [0,1] by construction, so no standardization is required for stability.
function fitLogistic(X, y, { lambda = 0.1, iterations = 3000, lr = 0.05 } = {}) {
  const n = X.length
  const d = FEATURES.length
  const w = new Array(d + 1).fill(0) // w[0] = bias
  for (let iter = 0; iter < iterations; iter++) {
    const grad = new Array(d + 1).fill(0)
    for (let i = 0; i < n; i++) {
      let z = w[0]
      for (let j = 0; j < d; j++) z += w[j + 1] * X[i][j]
      const err = sigmoid(z) - y[i]
      grad[0] += err
      for (let j = 0; j < d; j++) grad[j + 1] += err * X[i][j]
    }
    grad[0] /= n
    for (let j = 0; j < d; j++) grad[j + 1] = grad[j + 1] / n + (lambda / n) * w[j + 1]
    w[0] -= lr * grad[0]
    for (let j = 0; j < d; j++) w[j + 1] -= lr * grad[j + 1]
  }
  return w
}

const load = async () => {
  const rows = await query(
    `SELECT outcome_status,actual_score,learning_value,predicted_components_json FROM recommendation_outcomes WHERE training_eligible=1 OR outcome_status IN ('consumed','rejected','abandoned')`,
  )
  const samples = []
  for (const row of rows) {
    let features = {}
    try {
      features = JSON.parse(row.predicted_components_json || '{}')
    } catch {}
    const x = FEATURES.map((key) => {
      const value = Number(features[key])
      return Number.isFinite(value) ? value : NaN
    })
    if (x.some((value) => Number.isNaN(value))) continue
    const status = row.outcome_status
    if (status === 'consumed')
      samples.push({ x, y: 1, highValue: Number(row.learning_value || 0) >= 0.6 || Number(row.actual_score || 0) >= 6 })
    else if (status === 'rejected' || status === 'abandoned') samples.push({ x, y: 0, highValue: false })
  }
  return samples
}

const main = async () => {
  const samples = await load()
  const engaged = samples.filter((sample) => sample.y === 1)
  const rejected = samples.filter((sample) => sample.y === 0)
  const MIN_SAMPLES = 8 // below this, coefficients are dominated by a single outcome
  const report = {
    generated_at: new Date().toISOString(),
    samples: samples.length,
    engaged: engaged.length,
    rejected: rejected.length,
    features: FEATURES,
    hand_tuned_fit: HAND_TUNED,
    verdict: null,
    coefficients: null,
    importances: null,
  }
  if (samples.length < MIN_SAMPLES || engaged.length < 2 || rejected.length < 2) {
    report.verdict = 'insufficient_outcomes'
  } else {
    const X = samples.map((sample) => sample.x)
    const y = samples.map((sample) => sample.y)
    const w = fitLogistic(X, y)
    const coefficients = Object.fromEntries(FEATURES.map((key, index) => [key, Math.round(w[index + 1] * 1000) / 1000]))
    // Relative importance: |coef| normalized so the strongest feature = 1.0.
    const magnitude = FEATURES.map((key) => Math.abs(coefficients[key]))
    const maxMagnitude = Math.max(...magnitude, 1e-9)
    const importances = Object.fromEntries(
      FEATURES.map((key) => [key, Math.round((Math.abs(coefficients[key]) / maxMagnitude) * 1000) / 1000]),
    )
    const handTunedNormalized = (() => {
      const max = Math.max(...FEATURES.map((key) => HAND_TUNED[key]))
      return Object.fromEntries(FEATURES.map((key) => [key, Math.round((HAND_TUNED[key] / max) * 1000) / 1000]))
    })()
    report.verdict = 'fit_complete'
    report.bias = Math.round(w[0] * 1000) / 1000
    report.coefficients = coefficients
    report.importances = importances
    report.hand_tuned_normalized = handTunedNormalized
    report.sign_mismatches = FEATURES.filter(
      (key) =>
        coefficients[key] !== 0 && HAND_TUNED[key] !== 0 && Math.sign(coefficients[key]) !== Math.sign(HAND_TUNED[key]),
    )
  }

  if (AS_JSON) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(`\nCompass feature-importance audit (${MODE})`)
    console.log(`  ${report.samples} outcomes · ${report.engaged} engaged · ${report.rejected} rejected`)
    if (report.verdict === 'insufficient_outcomes') {
      console.log(
        `  verdict: ${report.verdict} (need ≥${MIN_SAMPLES} outcomes with ≥2 engaged and ≥2 rejected to trust coefficients)`,
      )
      return
    }
    console.log(`  verdict: ${report.verdict} · bias ${report.bias}`)
    console.log(
      `\n  ${'feature'.padEnd(20)} ${'coef'.padEnd(10)} ${'importance'.padEnd(12)} ${'hand-tuned'.padEnd(12)} ${'hand-tuned (norm)'}`,
    )
    for (const key of FEATURES) {
      const flag = report.sign_mismatches.includes(key) ? '  ⚠ sign mismatch' : ''
      console.log(
        `  ${key.padEnd(20)} ${String(report.coefficients[key]).padEnd(10)} ${String(report.importances[key]).padEnd(12)} ${String(report.hand_tuned_fit[key]).padEnd(12)} ${String(report.hand_tuned_normalized[key])}${flag}`,
      )
    }
    if (report.sign_mismatches.length) {
      console.log(
        `\n  ⚠ ${report.sign_mismatches.join(', ')} predict consumption in the opposite direction of the hand-tuned prior.`,
      )
    }
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
