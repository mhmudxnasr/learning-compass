import { useData } from '../app/useData'
import { ErrorState, Loading } from '../components/States'

type OperationalHealth = {
  ok: boolean
  status: string
  blockers?: string[]
  integrity?: { active_orphans?: number; quarantined_unresolved?: number }
  jobs?: { status?: Record<string, number>; overdue_retries?: number; stale_running?: number; dead_letters?: number }
  maintenance?: { ok?: boolean; last_success?: string | null }
  recovery?: { ok?: boolean; latest?: { restore_rehearsed_at?: string; created_at?: string } | null }
}
type SystemPayload = { operational_health?: OperationalHealth }
type EngineHealth = { setting?: { mode?: string }; ready?: boolean; gates?: Record<string, { passed?: boolean }> }

export function OperationalHealthPanel() {
  const system = useData<SystemPayload>('/agent/system')
  const engine = useData<EngineHealth>('/analytics/hermes/engine')
  if (system.loading || engine.loading)
    return (
      <section class="operational-health">
        <Loading label="Checking operational health" />
      </section>
    )
  const error = system.error || engine.error
  if (error)
    return (
      <section class="operational-health">
        <ErrorState
          message={error}
          retry={() => {
            system.reload()
            engine.reload()
          }}
        />
      </section>
    )

  const health = system.data?.operational_health
  const statuses = health?.jobs?.status || {}
  const queuedJobs = Number(statuses.pending || 0) + Number(statuses.running || 0) + Number(statuses.retry || 0)
  const failedGates = Object.entries(engine.data?.gates || {})
    .filter(([, gate]) => gate.passed === false)
    .map(([name]) => name.replaceAll('_', ' '))
  const healthy = Boolean(health?.ok)
  const metric = (label: string, value: string | number, warning = false) => (
    <article class={warning ? 'is-warning' : ''}>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  )

  return (
    <section class="operational-health" aria-labelledby="operational-health-title">
      <div class="section-head">
        <div>
          <span class="eyebrow">Reliability / recovery</span>
          <h2 id="operational-health-title">Operational health</h2>
        </div>
        <span class={healthy ? 'status healthy' : 'status warning'}>{healthy ? 'Healthy' : 'Needs attention'}</span>
      </div>
      <div class="operational-health-metrics">
        {metric('Queued jobs', queuedJobs)}
        {metric('Overdue retries', health?.jobs?.overdue_retries || 0, Number(health?.jobs?.overdue_retries || 0) > 0)}
        {metric(
          'Integrity defects',
          Number(health?.integrity?.active_orphans || 0) + Number(health?.integrity?.quarantined_unresolved || 0),
          !health?.integrity ||
            (!health.ok &&
              Number(health?.integrity?.active_orphans || 0) + Number(health?.integrity?.quarantined_unresolved || 0) >
                0),
        )}
        {metric('Maintenance', health?.maintenance?.ok ? 'current' : 'stale', !health?.maintenance?.ok)}
        {metric('Recovery', health?.recovery?.ok ? 'verified' : 'stale', !health?.recovery?.ok)}
        {metric(
          'Engine mode',
          engine.data?.setting?.mode || 'unknown',
          engine.data?.setting?.mode === 'v2' && engine.data?.ready === false,
        )}
      </div>
      {((health?.blockers?.length || 0) > 0 || failedGates.length > 0) && (
        <div class="operational-health-notes">
          {(health?.blockers || []).map((blocker) => (
            <p key={blocker}>
              <strong>Operations:</strong> {blocker}
            </p>
          ))}
          {failedGates.length > 0 && (
            <p>
              <strong>Rollout:</strong> shadow remains required until {failedGates.join(', ')} pass.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
