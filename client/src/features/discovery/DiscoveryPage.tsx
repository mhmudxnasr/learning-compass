import { useEffect, useState } from 'preact/hooks'
import { api } from '../../api'

export default function DiscoveryPage() {
  const [state, setState] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(false)

  // Interview state
  const [feedbackText, setFeedbackText] = useState('')
  const [openedFrontier, setOpenedFrontier] = useState(false)
  const [realLifeImpact, setRealLifeImpact] = useState(false)
  const [sourceLove, setSourceLove] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const loadState = async () => {
    try {
      setLoading(true)
      const data = await api<any>('/discovery/state')
      setState(data)
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Failed to load discovery state')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadState()
  }, [])

  const startDiscovery = async () => {
    try {
      setSubmitting(true)
      await api('/discovery/runs', { method: 'POST', body: JSON.stringify({ mission: 'Adaptive frontier discovery wave' }) })
      await loadState()
    } catch (err: any) {
      alert(`Could not start discovery: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const activateRun = async (runId: string) => {
    try {
      setSubmitting(true)
      const res = await api<any>(`/discovery/runs/${runId}/activate`, { method: 'POST' })
      if (res.activated) {
        alert('Discovery activated into Queue and session started!')
      } else {
        alert(res.message || 'Winner retained waiting for capacity.')
      }
      await loadState()
    } catch (err: any) {
      alert(`Activation failed: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const submitInterview = async (runId: string) => {
    if (!feedbackText.trim()) return
    try {
      setSubmitting(true)
      await api(`/discovery/runs/${runId}/interview`, {
        method: 'POST',
        body: JSON.stringify({ raw_feedback: feedbackText, answers: { response: feedbackText } }),
      })
      setFeedbackText('')
      await loadState()
    } catch (err: any) {
      alert(`Interview submission failed: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const resolveDiscovery = async (runId: string) => {
    try {
      setSubmitting(true)
      await api(`/discovery/runs/${runId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          structured_resolution: {
            opened_frontier: openedFrontier,
            real_life_impact: realLifeImpact,
            source_love: sourceLove,
          },
          learning_receipt: {
            evidence: [openedFrontier ? 'Opened new personal frontier' : 'Explored branch feedback'],
            confidence: 0.9,
            affected_branches: [state?.active_run?.selected_branch_id || 'general'],
          },
        }),
      })
      alert('Discovery resolved and learning receipt applied!')
      await loadState()
    } catch (err: any) {
      alert(`Resolution failed: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const reopenBranch = async (branchId: string) => {
    if (!state?.active_run?.id) return
    try {
      await api(`/discovery/runs/${state.active_run.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          branch_mutations: [{ branch_id: branchId, action: 'reopen', reason: 'User reopened branch' }],
        }),
      })
      await loadState()
    } catch (err: any) {
      alert(`Reopen branch failed: ${err.message}`)
    }
  }

  const cancelRun = async (runId: string) => {
    try {
      setSubmitting(true)
      await api(`/discovery/runs/${runId}/cancel`, { method: 'POST' })
      await loadState()
    } catch (err: any) {
      alert(`Could not cancel discovery run: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div class="page-content discovery-page">
        <div class="skeleton-stack">
          <i />
          <i />
          <i />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div class="page-content discovery-page">
        <div class="error-state">
          <strong>Discovery Error:</strong> <span>{error}</span>
        </div>
      </div>
    )
  }

  return (
    <div class="page-content discovery-page">
      <section class="discovery-card">
        <span class="meta">LEGACY DISCOVERY ARCHIVE</span>
        <h2 style={{ font: '600 24px/1.2 var(--font-reading)', margin: '4px 0 0' }}>Recommendation research now lives behind one Compass Pick.</h2>
        <p>New recommendations start from Today. The system searches adaptively, stops when confidence is sufficient, and can abstain instead of filling the queue with candidates.</p>
        <a class="primary-action" href="#/today/briefing">Open Today</a>
      </section>
    </div>
  )

  const gate = state?.gate_state
  const activeRun = state?.active_run
  const candidate = state?.selected_candidate
  const interview = state?.active_interview
  const receipt = activeRun?.decision_receipt
  const frontier = state?.frontier || []
  const pruned = state?.pruned_branches || []

  return (
    <div class="page-content discovery-page">
      {/* Top Metric Summary Strip */}
      <div class="discovery-summary-strip">
        <div>
          <strong>{gate?.can_start_discovery ? 'GATE OPEN' : 'BLOCKED'}</strong>
          <span>Discovery Status</span>
        </div>
        <div>
          <strong>{activeRun ? `WAVE ${activeRun.wave}` : 'IDLE'}</strong>
          <span>Active Exploration</span>
        </div>
        <div>
          <strong>{frontier.length}</strong>
          <span>Frontier Branches</span>
        </div>
        <div>
          <strong>{pruned.length}</strong>
          <span>Pruned Branches</span>
        </div>
      </div>

      {/* Main Section Header */}
      <div class="section-head">
        <div>
          <div class="workspace-label">CURATE // DISCOVERY ENGINE V2</div>
          <h2 style={{ font: '600 24px/1.2 var(--font-reading)', margin: '4px 0 0' }}>Recommendation Discovery</h2>
        </div>
        <div class="row-actions">
          <button onClick={() => setShowGuide(!showGuide)} style={{ minHeight: '38px', padding: '0 12px', background: 'transparent', border: '1px solid var(--line-strong)', borderRadius: '9px', font: '500 12px var(--font-mono)' }}>
            {showGuide ? 'Hide How It Works' : 'How Discovery Works'}
          </button>
          {gate?.can_start_discovery ? (
            <button class="primary-action" onClick={startDiscovery} disabled={submitting}>
              {submitting ? 'Starting…' : 'Start New Discovery Wave'}
            </button>
          ) : (
            <button class="primary-action" disabled style={{ opacity: 0.65 }}>
              Gate Blocked
            </button>
          )}
        </div>
      </div>

      {/* How Discovery Works Guide Box */}
      {showGuide && (
        <div class="discovery-guide">
          <h3>Understanding Recommendation Discovery Engine V2</h3>
          <p>
            Discovery is your self-improving exploration engine designed to break confirmation bias and probe unexpected frontiers across your knowledge topology.
          </p>
          <ol>
            <li>
              <strong>Wave Exploration:</strong> Clicking "Start New Discovery Wave" gathers candidates across papers, essays, talks, podcasts, and articles using mathematical Dialectic Divergence Optimization (target orthogonal angle = 0.25).
            </li>
            <li>
              <strong>Verified Decision Receipts:</strong> The winning candidate generates a receipt detailing why it was chosen, its surprise factor, and its target feedback goal.
            </li>
            <li>
              <strong>Single-Active Gate & Hermes Interviews:</strong> Only one discovery run can be active at a time. After consuming or rejecting, Hermes initiates an adaptive interview loop to update your engine weights and evolve your knowledge tree.
            </li>
          </ol>
        </div>
      )}

      {/* Gate Warning Notification */}
      {gate?.is_gate_blocked && gate?.blocked_reason && (
        <div class="queue-warning">
          <span>{gate.blocked_reason}</span>
          <span class="meta">gate locked</span>
        </div>
      )}

      {/* Active Research Mission */}
      {activeRun && (
        <section class="discovery-card active-mission">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span class="meta">ACTIVE RESEARCH MISSION (WAVE {activeRun.wave})</span>
            <div class="row-actions" style={{ gap: '10px' }}>
              <span class={`job-badge state-${activeRun.lifecycle}`}>
                <i class="job-pulse-dot" data-state={activeRun.lifecycle} />
                {activeRun.lifecycle.replace(/_/g, ' ')}
              </span>
              <button class="danger-button" onClick={() => cancelRun(activeRun.id)} disabled={submitting}>
                {submitting ? 'Cancelling…' : 'Cancel Run'}
              </button>
            </div>
          </div>

          <h2 style={{ font: '600 22px/1.3 var(--font-reading)', margin: '4px 0' }}>{activeRun.mission}</h2>
          <div class="record-state">
            Model: <code>{activeRun.model_version}</code> | Skill Version: <code>{activeRun.skill_version}</code>
          </div>

          {/* Decision Receipt Grid */}
          {receipt && (
            <div class="receipt-grid">
              <div>
                <strong>Why This:</strong> {receipt.why_this}
              </div>
              <div>
                <strong>Why Now:</strong> {receipt.why_now}
              </div>
              <div>
                <strong>Explored Branch:</strong> <code>{receipt.explored_branch}</code>
              </div>
              <div>
                <strong>Surprise Factor:</strong> {receipt.surprise}
              </div>
              <div>
                <strong>Confidence:</strong> {Math.round((receipt.confidence || 0) * 100)}%
              </div>
              <div>
                <strong>Feedback Target:</strong> {receipt.what_feedback_will_teach}
              </div>
            </div>
          )}

          {/* Winner Candidate Card */}
          {candidate && (
            <div class="suggestion-card" style={{ margin: '8px 0 0' }}>
              <div class="suggestion-body">
                <span class="meta">
                  VERIFIED CANDIDATE WINNER • {candidate.source_class} ({candidate.format})
                </span>
                <h3>
                  <a href={candidate.canonical_url} target="_blank" rel="noopener noreferrer">
                    {candidate.title}
                  </a>
                </h3>
                {candidate.creator && <span class="suggestion-creator">by {candidate.creator}</span>}
              </div>
              <div class="suggestion-actions" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                <strong style={{ font: '500 20px var(--font-mono)', color: 'var(--success)' }}>
                  {Math.round(candidate.total_score * 100)} <small style={{ fontSize: '11px', color: 'var(--ink-3)' }}>pts</small>
                </strong>
                {candidate.is_verified && <span class="state state-healthy">Verified Source</span>}

                {(activeRun.lifecycle === 'selected' || activeRun.lifecycle === 'waiting_for_capacity') && (
                  <div class="row-actions" style={{ marginTop: '4px' }}>
                    <button class="primary-action" onClick={() => activateRun(activeRun.id)} disabled={submitting}>
                      {submitting ? 'Activating…' : 'Accept & Start Session'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Hermes Adaptive Feedback Interview Section */}
          {(activeRun.lifecycle === 'active' || activeRun.lifecycle === 'interviewing' || activeRun.lifecycle === 'awaiting_feedback') && (
            <div class="interview-box">
              <div class="module-head">
                <h3>Hermes Adaptive Feedback Interview</h3>
                <span>Interview Loop</span>
              </div>

              {/* Active Hermes Question */}
              {interview?.questions?.length > 0 ? (
                <div class="interview-question">
                  <span>Hermes Question {interview.questions.length}:</span>
                  <p>{interview.questions[interview.questions.length - 1]}</p>
                </div>
              ) : (
                <div class="ambiguity-box">
                  <span class="meta">Awaiting initial feedback or Hermes interview questions…</span>
                </div>
              )}

              {/* Unresolved Ambiguities */}
              {interview?.unresolved_ambiguities?.length > 0 && (
                <div class="ambiguity-box">
                  <strong>Unresolved Ambiguities ({interview.unresolved_ambiguities.length}):</strong>
                  <ul>
                    {interview.unresolved_ambiguities.map((amb: string, idx: number) => (
                      <li key={idx}>{amb}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Feedback Input */}
              <div style={{ display: 'grid', gap: '10px' }}>
                <textarea
                  value={feedbackText}
                  onInput={(e: any) => setFeedbackText(e.target.value)}
                  placeholder="Answer Hermes's question or provide explicit feedback rationale…"
                  rows={3}
                  class="note-editor"
                  style={{ minHeight: '80px' }}
                />
                <div class="row-actions">
                  <button class="primary-action" onClick={() => submitInterview(activeRun.id)} disabled={submitting || !feedbackText.trim()}>
                    {submitting ? 'Submitting…' : 'Submit Answer'}
                  </button>
                </div>
              </div>

              {/* Resolution Action */}
              {interview?.questions?.length > 0 && (!interview?.unresolved_ambiguities || interview.unresolved_ambiguities.length === 0) ? (
                <div class="interview-question" style={{ background: 'color-mix(in oklch, var(--success) 12%, var(--surface))', border: '1px solid color-mix(in oklch, var(--success) 30%, transparent)' }}>
                  <span>Interview Complete: Ready to resolve discovery run</span>
                  <div class="row-actions" style={{ marginTop: '8px' }}>
                    <button class="primary-action success-action" onClick={() => resolveDiscovery(activeRun.id)} disabled={submitting}>
                      {submitting ? 'Resolving…' : 'Resolve Discovery & Apply Learning Receipt'}
                    </button>
                  </div>
                </div>
              ) : (
                <span class="meta" style={{ fontStyle: 'italic' }}>
                  Resolution unlocked after answering Hermes adaptive interview questions.
                </span>
              )}
            </div>
          )}
        </section>
      )}

      {/* Interactive Exploration Frontier */}
      <section class="discovery-card">
        <div class="section-head" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <h2 style={{ font: '600 20px var(--font-reading)', margin: 0 }}>Interactive Exploration Frontier</h2>
          <span class="meta">topology branches</span>
        </div>

        <div class="two-column-data" style={{ marginTop: '16px' }}>
          {/* Expanding Frontier Nodes */}
          <div>
            <div class="module-head" style={{ marginBottom: '12px' }}>
              <h3>Expanding Frontier Branches</h3>
              <span>{frontier.length} nodes</span>
            </div>
            <div class="discovery-branch-list">
              {frontier.length === 0 ? (
                <span class="meta">No active frontier nodes.</span>
              ) : (
                frontier.map((b: any) => (
                  <div key={b.id} class="discovery-branch-item">
                    <div class="discovery-branch-info">
                      <span class="discovery-branch-name">{b.name}</span>
                      <span class="discovery-branch-conf">Conf: {Math.round((b.confidence_score || 0) * 100)}%</span>
                    </div>
                    <span class={`state ${b.lifecycle_state === 'frontier' ? 'state-active' : 'state-healthy'}`}>
                      {b.lifecycle_state}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Pruned Branches */}
          <div>
            <div class="module-head" style={{ marginBottom: '12px' }}>
              <h3>Pruned Branches</h3>
              <span>{pruned.length} nodes</span>
            </div>
            <div class="discovery-branch-list">
              {pruned.length === 0 ? (
                <span class="meta">No pruned branches.</span>
              ) : (
                pruned.map((b: any) => (
                  <div key={b.id} class="discovery-branch-item">
                    <div class="discovery-branch-info">
                      <span class="discovery-branch-name">{b.name}</span>
                      {b.pruning_reason && <span class="danger-action" style={{ font: '500 11px var(--font-mono)' }}>{b.pruning_reason}</span>}
                    </div>
                    <div class="row-actions">
                      <button onClick={() => reopenBranch(b.id)}>Reopen</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
