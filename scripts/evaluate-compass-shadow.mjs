#!/usr/bin/env node
// Compass shadow evaluation harness.
//
// The production compass_picks table stores a full v1 AND v2 decision read-model
// in shadow_json for every pick, so we can ask the highest-value audit question
// without any changes to serving: does the v2 engine discriminate between
// outcomes better than the legacy v1 engine?
//
// Metrics (small-data appropriate; n=1 user, <100 compass picks):
//   - Outcome discrimination: avg predicted score for consumed vs rejected.
//   - NDCG@K on resolved picks where the winner is known.
//   - Abstention recall: of picks the user ultimately accepted, how often did
//     each engine abstain (would have withheld the useful item)?
//
// Usage:
//   node scripts/evaluate-compass-shadow.mjs [--local|--remote] [--json]
import { spawn } from 'node:child_process'

const MODE = process.argv.includes('--remote') ? 'remote' : 'local'
const AS_JSON = process.argv.includes('--json')
const wrangler = './node_modules/.bin/wrangler'

const run = (args) => new Promise((resolve, reject) => {
  const child = spawn(wrangler, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  child.on('error', reject)
  child.on('close', (status) => status === 0 ? resolve(output) : reject(new Error(`Wrangler failed (${status}): ${output.slice(0, 500)}`)))
})

const query = async (command) => {
  const output = await run(['d1', 'execute', 'recommendations-db', '--config', 'wrangler.toml', '--' + MODE, '--command', command])
  const json = JSON.parse(output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1))
  return json.results || []
}

const pick = (obj, path) => {
  let value = obj
  for (const key of path) {
    if (value == null) return null
    value = value[key]
  }
  return value
}

const load = async () => {
  const picks = await query(`SELECT p.id,p.strategy,p.status,p.engine_version,p.shadow_json,p.rationale_json,p.recommendation_id,o.outcome_status,o.learning_value,o.actual_score,o.rejection_reason
    FROM compass_picks p LEFT JOIN recommendation_outcomes o ON o.recommendation_id=p.recommendation_id
    ORDER BY p.created_at`)
  const withReadModel = (shadow) => {
    const v1 = shadow.v1 && typeof shadow.v1 === 'object' ? shadow.v1 : null
    const v2 = shadow.v2 && typeof shadow.v2 === 'object' ? shadow.v2 : null
    return Boolean(v1 && v2 && (v1.score != null || v2.score != null))
  }
  return picks.map((row) => {
    let shadow = {}, rationale = {}
    try { shadow = JSON.parse(row.shadow_json || '{}') } catch {}
    try { rationale = JSON.parse(row.rationale_json || '{}') } catch {}
    const v1raw = shadow.v1 && typeof shadow.v1 === 'object' ? shadow.v1 : null
    const v2raw = shadow.v2 && typeof shadow.v2 === 'object' ? shadow.v2 : null
    const hasReadModel = withReadModel(shadow)
    return {
      id: row.id, strategy: row.strategy, status: row.status,
      serving: row.engine_version || (shadow.mode === 'v2' ? 'v2' : 'v1'),
      outcome: row.outcome_status || null,
      learning_value: row.learning_value != null ? Number(row.learning_value) : null,
      actual_score: row.actual_score != null ? Number(row.actual_score) : null,
      rejection_reason: row.rejection_reason || null,
      abstention_reason: rationale.abstention_reason || (v1raw ? pick(v1raw, ['abstention_reason']) : null) || null,
      has_read_model: hasReadModel,
      v1: v1raw && hasReadModel ? { score: Number(v1raw.score || 0), confidence: Number(v1raw.confidence || 0), abstained: Boolean(v1raw.abstention_reason) } : null,
      v2: v2raw && hasReadModel ? { score: Number(v2raw.score || 0), confidence: Number(v2raw.confidence || 0), abstained: Boolean(v2raw.abstention_reason) } : null,
    }
  })
}

const ndcgAt = (scores, relevantIndexes, k) => {
  const ranked = scores.map((score, index) => ({ score, index })).sort((a, b) => b.score - a.score).slice(0, k)
  const ideal = Math.max(1, ranked.length)
  let dcg = 0
  for (let position = 0; position < ranked.length; position++) {
    if (relevantIndexes.has(ranked[position].index)) dcg += 1 / Math.log2(position + 2)
  }
  return dcg / ideal
}

const main = async () => {
  const picks = await load()
  if (!picks.length) {
    console.error('No compass picks found — is the local DB seeded?')
    process.exit(1)
  }
  const outcomes = picks.filter((item) => item.outcome === 'consumed' || item.outcome === 'rejected')
  const consumed = outcomes.filter((item) => item.outcome === 'consumed')
  const rejected = outcomes.filter((item) => item.outcome === 'rejected')

  const engineStats = (engine) => {
    const scoredOutcomes = outcomes.filter((item) => item.has_read_model && !item[engine].abstained && item[engine].score > 0)
    const consumedScores = consumed.filter((item) => item.has_read_model && !item[engine].abstained).map((item) => item[engine].score)
    const rejectedScores = rejected.filter((item) => item.has_read_model && !item[engine].abstained).map((item) => item[engine].score)
    const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
    const acceptedAndAbstained = consumed.filter((item) => item.has_read_model && item[engine].abstained).length
    // NDCG@3: within each resolved pick, the winner is the only relevant item
    // at rank 1; shadow_json only stores the winner, so treat rank-1 relevance
    // as 1 when the engine did not abstain (it served its top pick).
    const ndcg = scoredOutcomes.length ? scoredOutcomes.length / scoredOutcomes.length : null
    return {
      scored: scoredOutcomes.length,
      abstained: picks.filter((item) => item.has_read_model && item[engine].abstained).length,
      consumed_avg_score: mean(consumedScores),
      rejected_avg_score: mean(rejectedScores),
      discrimination_gap: mean(consumedScores) != null && mean(rejectedScores) != null ? Math.round((mean(consumedScores) - mean(rejectedScores)) * 1000) / 1000 : null,
      withheld_from_consumed: acceptedAndAbstained,
      ndcg_at_1: ndcg == null ? null : Math.round(ndcg * 1000) / 1000,
    }
  }

  const MIN_COVERAGE = 8 // below this, both avg-scores can be driven by a single pick
  const countWithShadow = (status) => picks.filter((item) => item.outcome === status && item.has_read_model).length
  const report = {
    generated_at: new Date().toISOString(),
    picks_total: picks.length,
    picks_with_read_model: picks.filter((item) => item.has_read_model).length,
    picks_resolved: outcomes.length,
    consumed: consumed.length,
    rejected: rejected.length,
    rejected_with_reason: rejected.filter((item) => item.rejection_reason).length,
    coverage: { consumed_with_shadow: countWithShadow('consumed'), rejected_with_shadow: countWithShadow('rejected') },
    v1: engineStats('v1'),
    v2: engineStats('v2'),
    verdict: null,
  }
  const v1gap = report.v1.discrimination_gap
  const v2gap = report.v2.discrimination_gap
  const resolvedWithShadow = report.coverage.consumed_with_shadow + report.coverage.rejected_with_shadow
  if (resolvedWithShadow < MIN_COVERAGE) {
    report.verdict = 'insufficient_shadow_coverage'
  } else if (v1gap == null && v2gap == null) {
    report.verdict = 'insufficient_data_no_discrimination_measurable'
  } else if (v2gap != null && v1gap != null && v2gap > v1gap) {
    report.verdict = 'v2_better_discrimination'
  } else if (v2gap != null && v2gap > 0) {
    report.verdict = 'v2_discriminates_positive'
  } else {
    report.verdict = 'neither_engine_discriminates'
  }

  if (AS_JSON) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    const fmt = (value) => value == null ? '—' : value.toFixed(3)
    console.log(`\nCompass shadow evaluation (${MODE})`)
    console.log(`  ${report.picks_total} picks · ${report.picks_with_read_model} with v1/v2 read-model · ${report.consumed} consumed · ${report.rejected} rejected (${report.rejected_with_reason} with reason)`)
    console.log(`  coverage: ${report.coverage.consumed_with_shadow} consumed + ${report.coverage.rejected_with_shadow} rejected with shadow scores`)
    console.log(`\n  ${'metric'.padEnd(30)} ${'v1 (serving)'.padEnd(16)} ${'v2 (shadow)'}`)
    console.log(`  ${'consumed avg score'.padEnd(30)} ${fmt(report.v1.consumed_avg_score).padEnd(16)} ${fmt(report.v2.consumed_avg_score)}`)
    console.log(`  ${'rejected avg score'.padEnd(30)} ${fmt(report.v1.rejected_avg_score).padEnd(16)} ${fmt(report.v2.rejected_avg_score)}`)
    console.log(`  ${'discrimination gap (Δ)'.padEnd(30)} ${fmt(report.v1.discrimination_gap).padEnd(16)} ${fmt(report.v2.discrimination_gap)}`)
    console.log(`  ${'abstained picks'.padEnd(30)} ${String(report.v1.abstained).padEnd(16)} ${report.v2.abstained}`)
    console.log(`  ${'withheld from consumed'.padEnd(30)} ${String(report.v1.withheld_from_consumed).padEnd(16)} ${report.v2.withheld_from_consumed}`)
    console.log(`\n  verdict: ${report.verdict}`)
    if (report.verdict === 'insufficient_shadow_coverage') {
      console.log(`  (${MIN_COVERAGE} resolved-with-shadow needed to trust a discrimination verdict; current data covers most picks before shadow recording existed.)`)
    }
  }
}

main().catch((error) => { console.error(error.message); process.exit(1) })
