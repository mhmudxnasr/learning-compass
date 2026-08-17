import { formatDate } from '../api'
import { useData } from '../app/useData'
import { Empty, ErrorState, Loading } from '../components/States'

type ActivityReceipt = {
  id: string
  agent_name: string
  intent: string
  target: string
  status_code: number
  verified: boolean
  created_at: string
  receipt?: { before?: unknown; after?: unknown; blocker?: { message?: string }; mutation_or_job?: { mutation_committed?: boolean } }
}

type ActivityPayload = {
  receipts: ActivityReceipt[]
  audit_events: Array<{ id: number; ts: string; agent_name: string; action: string; status: string }>
  jobs: Array<{ id: string; job_type: string; status: string; error?: string }>
  proposals: Array<{ id: string; proposal_type?: string; status: string; updated_at: string }>
  health: { active_jobs: number; failed_jobs: number; pending_proposals: number }
}

const shortJson = (value: unknown) => {
  try { return JSON.stringify(value, null, 2) } catch { return String(value || '') }
}

export function HermesActivityPanel() {
  const activity = useData<ActivityPayload>('/agent/activity?limit=12')
  if (activity.loading) return <section class="hermes-activity-panel"><Loading label="Loading Hermes activity" /></section>
  if (activity.error) return <section class="hermes-activity-panel"><ErrorState message={activity.error} retry={activity.reload} /></section>
  const data = activity.data || { receipts: [], audit_events: [], jobs: [], proposals: [], health: { active_jobs: 0, failed_jobs: 0, pending_proposals: 0 } }
  return <section class="hermes-activity-panel" aria-labelledby="hermes-activity-title">
    <div class="section-head">
      <div><span class="eyebrow">Hermes / verified operations</span><h2 id="hermes-activity-title">Activity and receipts</h2></div>
      <button class="button secondary" type="button" onClick={activity.reload}>Refresh</button>
    </div>
    <div class="hermes-activity-health" aria-label="Hermes activity summary">
      <span><strong>{data.health.active_jobs}</strong> active jobs</span>
      <span><strong>{data.health.pending_proposals}</strong> proposals waiting</span>
      <span class={data.health.failed_jobs ? 'is-warning' : ''}><strong>{data.health.failed_jobs}</strong> failed jobs</span>
    </div>
    {data.receipts.length ? <div class="hermes-receipt-list">{data.receipts.map((item) => <details class={`hermes-receipt ${item.verified ? 'is-verified' : 'is-blocked'}`} key={item.id}>
      <summary><span class="hermes-receipt-status">{item.verified ? 'Verified' : 'Needs attention'}</span><span class="hermes-receipt-title">{item.intent} · {item.target}</span><time>{formatDate(item.created_at)}</time></summary>
      <div class="hermes-receipt-body">
        <p>{item.receipt?.blocker?.message || (item.receipt?.mutation_or_job?.mutation_committed ? 'Mutation committed; verification details are available below.' : 'Read-only operation or no additional blocker reported.')}</p>
        <div class="hermes-receipt-columns">
          <div><span>Before</span><pre>{shortJson(item.receipt?.before || null)}</pre></div>
          <div><span>After</span><pre>{shortJson(item.receipt?.after || null)}</pre></div>
        </div>
      </div>
    </details>)}</div> : <Empty title="No Hermes receipts yet" body="Verified operations will appear here after Hermes reads or changes the site." />}
    {(data.jobs.length || data.proposals.length) ? <div class="hermes-activity-secondary">
      {data.jobs.length > 0 && <div><h3>Recent jobs</h3>{data.jobs.slice(0, 6).map((job) => <p key={job.id}><strong>{job.job_type}</strong> · {job.status}{job.error ? ` · ${job.error}` : ''}</p>)}</div>}
      {data.proposals.length > 0 && <div><h3>Recent proposals</h3>{data.proposals.slice(0, 6).map((proposal) => <p key={proposal.id}><strong>{proposal.proposal_type || 'Change'}</strong> · {proposal.status}</p>)}</div>}
    </div> : null}
  </section>
}
