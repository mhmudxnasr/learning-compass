import { useEffect, useState } from 'preact/hooks'
import { api } from '../../api'

export type DiscoveryState = {
  gate_state?: {
    can_start_discovery?: boolean
    is_gate_blocked?: boolean
    blocked_reason?: string
  }
  active_run?: {
    id: string
    wave: number
    lifecycle: string
    mission: string
    model_version?: string
    skill_version?: string
    selected_branch_id?: string
    decision_receipt?: {
      why_this?: string
      why_now?: string
      explored_branch?: string
      surprise?: string
      confidence?: number
      what_feedback_will_teach?: string
    }
  }
  selected_candidate?: {
    title: string
    creator?: string
    canonical_url: string
    source_class: string
    format: string
    total_score: number
    is_verified?: boolean
  }
  active_interview?: {
    questions?: string[]
    unresolved_ambiguities?: string[]
  }
  frontier?: Array<{
    id: string
    name: string
    confidence_score?: number
    lifecycle_state?: string
  }>
  pruned_branches?: Array<{
    id: string
    name: string
    pruning_reason?: string
  }>
}

export default function DiscoveryPage() {
  const [state, setState] = useState<DiscoveryState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(false)

  // Interview state
  const [feedbackText, setFeedbackText] = useState('')
  const [openedFrontier] = useState(false)
  const [realLifeImpact] = useState(false)
  const [sourceLove] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 5000)
  }

  const loadState = async () => {
    try {
      setLoading(true)
      const data = await api<DiscoveryState>('/discovery/state')
      setState(data)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load discovery state')
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
      flash('Discovery wave started.')
      await loadState()
    } catch (err: unknown) {
      flash(`Could not start discovery: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  const activateRun = async (runId: string) => {
    try {
      setSubmitting(true)
      const res = await api<{ activated?: boolean; message?: string }>(`/discovery/runs/${runId}/activate`, { method: 'POST' })
      if (res?.activated) {
        flash('Discovery activated into Queue and session started!')
      } else {
        flash(res?.message || 'Winner retained waiting for capacity.')
      }
      await loadState()
    } catch (err: unknown) {
      flash(`Activation failed: ${err instanceof Error ? err.message : String(err)}`)
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
      flash('Interview answer submitted.')
      await loadState()
    } catch (err: unknown) {
      flash(`Interview submission failed: ${err instanceof Error ? err.message : String(err)}`)
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
      flash('Discovery resolved and learning receipt applied!')
      await loadState()
    } catch (err: unknown) {
      flash(`Resolution failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  const reopenBranch = async (branchId: string) => {
    if (!state?.active_run?.id) return
    try {
      setSubmitting(true)
      await api(`/discovery/runs/${state.active_run.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          branch_mutations: [{ branch_id: branchId, action: 'reopen', reason: 'User reopened branch' }],
        }),
      })
      flash('Branch reopened.')
      await loadState()
    } catch (err: unknown) {
      flash(`Reopen branch failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  const cancelRun = async (runId: string) => {
    try {
      setSubmitting(true)
      await api(`/discovery/runs/${runId}/cancel`, { method: 'POST' })
      flash('Discovery run cancelled.')
      await loadState()
    } catch (err: unknown) {
      flash(`Could not cancel discovery run: ${err instanceof Error ? err.message : String(err)}`)
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

  const gate = state?.gate_state
  const activeRun = state?.active_run
  const candidate = state?.selected_candidate
  const interview = state?.active_interview
  const receipt = activeRun?.decision_receipt
  const frontier = state?.frontier || []
  const pruned = state?.pruned_branches || []

  return (
    <div class="page-content discovery-page">
      {notice && (
        <div class="desk-notice" role="status" aria-live="polite">
          {notice}
        </div>
      )}

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
          <h2 class="discovery-headline">Recommendation Discovery</h2>
        </div>
        <div class="row-actions">
          <button type="button" class="button secondary" onClick={() => setShowGuide(!showGuide)}>
            {showGuide ? 'Hide How It Works' : 'How Discovery Works'}
          </button>
          {gate?.can_start_discovery ? (
            <button type="button" class="primary-action" onClick={startDiscovery} disabled={submitting}>
              {submitting ? 'Starting…' : 'Start New Discovery Wave'}
            </button>
          ) : (
            <button type="button" class="primary-action" disabled>
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
        <div class="queue-warning" role="alert">
          <span>{gate.blocked_reason}</span>
          <span class="meta">gate locked</span>
        </div>
      )}

      {/* Active Research Mission */}
      {activeRun && (
        <section class="discovery-card active-mission">
          <div class="mission-header">
            <span class="meta">ACTIVE RESEARCH MISSION (WAVE {activeRun.wave})</span>
            <div class="row-actions">
              <span class={`job-badge state-${activeRun.lifecycle}`}>
                <i class="job-pulse-dot" data-state={activeRun.lifecycle} />
                {activeRun.lifecycle.replace(/_/g, ' ')}
              </span>
              <button type="button" class="danger-button" onClick={() => cancelRun(activeRun.id)} disabled={submitting}>
                {submitting ? 'Cancelling…' : 'Cancel Run'}
              </button>
            </div>
          </div>

          <h2 class="mission-title">{activeRun.mission}</h2>
          <div class="record-state">
            Model: <code>{activeRun.model_version || 'standard'}</code> | Skill Version: <code>{activeRun.skill_version || 'v2'}</code>
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
            <div class="suggestion-card">
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
              <div class="suggestion-actions">
                <strong class="candidate-score">
                  {Math.round(candidate.total_score * 100)} <small>pts</small>
                </strong>
                {candidate.is_verified && <span class="state state-healthy">Verified Source</span>}

                {(activeRun.lifecycle === 'selected' || activeRun.lifecycle === 'waiting_for_capacity') && (
                  <div class="row-actions">
                    <button type="button" class="primary-action" onClick={() => activateRun(activeRun.id)} disabled={submitting}>
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
              {interview?.questions && interview.questions.length > 0 ? (
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
              {interview?.unresolved_ambiguities && interview.unresolved_ambiguities.length > 0 && (
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
              <div class="interview-input-area">
                <textarea
                  value={feedbackText}
                  onInput={(e) => setFeedbackText((e.target as HTMLTextAreaElement).value)}
                  placeholder="Answer Hermes's question or provide explicit feedback rationale…"
                  rows={3}
                  class="note-editor"
                />
                <div class="row-actions">
                  <button type="button" class="primary-action" onClick={() => submitInterview(activeRun.id)} disabled={submitting || !feedbackText.trim()}>
                    {submitting ? 'Submitting…' : 'Submit Answer'}
                  </button>
                </div>
              </div>

              {/* Resolution Action */}
              {interview?.questions && interview.questions.length > 0 && (!interview?.unresolved_ambiguities || interview.unresolved_ambiguities.length === 0) ? (
                <div class="interview-question interview-complete">
                  <span>Interview Complete: Ready to resolve discovery run</span>
                  <div class="row-actions">
                    <button type="button" class="primary-action success-action" onClick={() => resolveDiscovery(activeRun.id)} disabled={submitting}>
                      {submitting ? 'Resolving…' : 'Resolve Discovery & Apply Learning Receipt'}
                    </button>
                  </div>
                </div>
              ) : (
                <span class="meta interview-pending-note">
                  Resolution unlocked after answering Hermes adaptive interview questions.
                </span>
              )}
            </div>
          )}
        </section>
      )}

      {/* Interactive Exploration Frontier */}
      <section class="discovery-card">
        <div class="section-head borderless">
          <h2 class="frontier-title">Interactive Exploration Frontier</h2>
          <span class="meta">topology branches</span>
        </div>

        <div class="two-column-data">
          {/* Expanding Frontier Nodes */}
          <div>
            <div class="module-head">
              <h3>Expanding Frontier Branches</h3>
              <span>{frontier.length} nodes</span>
            </div>
            <div class="discovery-branch-list">
              {frontier.length === 0 ? (
                <span class="meta">No active frontier nodes.</span>
              ) : (
                frontier.map((b) => (
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
            <div class="module-head">
              <h3>Pruned Branches</h3>
              <span>{pruned.length} nodes</span>
            </div>
            <div class="discovery-branch-list">
              {pruned.length === 0 ? (
                <span class="meta">No pruned branches.</span>
              ) : (
                pruned.map((b) => (
                  <div key={b.id} class="discovery-branch-item">
                    <div class="discovery-branch-info">
                      <span class="discovery-branch-name">{b.name}</span>
                      {b.pruning_reason && <span class="danger-action">{b.pruning_reason}</span>}
                    </div>
                    <div class="row-actions">
                      <button type="button" class="button secondary" onClick={() => reopenBranch(b.id)} disabled={submitting}>
                        Reopen
                      </button>
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
