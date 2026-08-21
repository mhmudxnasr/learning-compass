import { useData } from '../app/useData'
import { ErrorState, Loading } from '../components/States'

type HermesAnalytics = {
  jobs?: { statuses?: Record<string, number>; stale_running?: number; dead_letters?: number }
  quality?: { prediction_error?: number | null }
  compass_learning?: { calibration?: { mae?: number | null; coverage_percent?: number } }
}
type EngineHealth = { setting?: { mode?: string }; ready?: boolean; gates?: Record<string, { passed?: boolean }> }
type Briefing = { counts?: { due_recall?: number }; blockers?: { open_consolidation?: boolean } }
type ContextHealth = { health?: { status?: string; sections?: Record<string, { status?: string; error?: string }> } }

export function OperationalHealthPanel() {
  const analytics = useData<HermesAnalytics>('/analytics/hermes')
  const engine = useData<EngineHealth>('/analytics/hermes/engine')
  const briefing = useData<Briefing>('/agent/briefing')
  const context = useData<ContextHealth>('/agent/context')
  const sources = [analytics, engine, briefing, context]
  if (sources.some((source) => source.loading)) return <section class="operational-health"><Loading label="Checking operational health" /></section>
  const error = sources.find((source) => source.error)?.error
  if (error) return <section class="operational-health"><ErrorState message={error} retry={() => sources.forEach((source) => source.reload())} /></section>

  const statuses = analytics.data?.jobs?.statuses || {}
  const activeJobs = Number(statuses.pending || 0) + Number(statuses.retry || 0) + Number(statuses.running || 0)
  const failedGates = Object.entries(engine.data?.gates || {}).filter(([, gate]) => gate.passed === false).map(([name]) => name.replaceAll('_', ' '))
  const degraded = Object.entries(context.data?.health?.sections || {}).filter(([, section]) => section.status !== 'ok')
  const healthy = activeJobs === 0 && !analytics.data?.jobs?.stale_running && !analytics.data?.jobs?.dead_letters && degraded.length === 0

  const metric = (label: string, value: string | number, warning = false) => <article class={warning ? 'is-warning' : ''}><strong>{value}</strong><span>{label}</span></article>
  return <section class="operational-health" aria-labelledby="operational-health-title">
    <div class="section-head"><div><span class="eyebrow">Reliability / calibration</span><h2 id="operational-health-title">Operational health</h2></div><span class={healthy ? 'status healthy' : 'status warning'}>{healthy ? 'Healthy' : 'Needs attention'}</span></div>
    <div class="operational-health-metrics">
      {metric('Active jobs', activeJobs, activeJobs > 0)}
      {metric('Recall due', briefing.data?.counts?.due_recall || 0, Number(briefing.data?.counts?.due_recall || 0) > 0)}
      {metric('Engine mode', engine.data?.setting?.mode || 'unknown', engine.data?.setting?.mode === 'v2' && engine.data?.ready === false)}
      {metric('Calibration MAE', analytics.data?.compass_learning?.calibration?.mae ?? '—', Number(analytics.data?.compass_learning?.calibration?.mae || 0) > .2)}
      {metric('Context', context.data?.health?.status || 'unknown', degraded.length > 0)}
    </div>
    {(failedGates.length > 0 || degraded.length > 0 || briefing.data?.blockers?.open_consolidation) && <div class="operational-health-notes">
      {failedGates.length > 0 && <p><strong>Rollout:</strong> shadow remains required until {failedGates.join(', ')} pass.</p>}
      {degraded.map(([name, section]) => <p key={name}><strong>{name.replaceAll('_', ' ')}:</strong> {section.error || 'degraded'}</p>)}
      {briefing.data?.blockers?.open_consolidation && <p><strong>Learning loop:</strong> consolidation remains open.</p>}
    </div>}
  </section>
}
