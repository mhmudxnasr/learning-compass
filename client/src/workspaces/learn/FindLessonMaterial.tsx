import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { api } from '../../api'
import { statusLabel } from './helpers'
import type {
  MaterialRequest,
  MaterialRequestResponse,
  MaterialSourceSearchItem,
  MaterialSourceSearchResponse,
  ThreadLesson,
} from './types'

export function FindLessonMaterial({
  threadId,
  lesson,
  onChanged,
}: {
  threadId: string
  lesson: ThreadLesson
  onChanged: () => void
}) {
  const [request, setRequest] = useState<MaterialRequest | null>(null)
  const [persistedMatch, setPersistedMatch] = useState<MaterialSourceSearchItem | null>(null)
  const [working, setWorking] = useState<'load' | 'request' | 'attach' | null>('load')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const requestSequence = useRef(0)

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current
    setWorking('load')
    setError('')
    try {
      const response = await api<MaterialRequestResponse>(
        `/learning/core/threads/${encodeURIComponent(threadId)}/lessons/${encodeURIComponent(lesson.id)}/material-request`,
      )
      if (sequence === requestSequence.current) setRequest(response.request)
    } catch (reason) {
      if (sequence === requestSequence.current)
        setError(reason instanceof Error ? reason.message : 'Material request status could not be loaded.')
    } finally {
      if (sequence === requestSequence.current) setWorking(null)
    }
  }, [threadId, lesson.id])

  useEffect(() => {
    setRequest(null)
    setPersistedMatch(null)
    setMessage('')
    void load()
    return () => {
      requestSequence.current += 1
    }
  }, [load])

  useEffect(() => {
    const result = request?.status === 'completed' && request.outcome === 'ready' ? request.result : null
    if (!result?.recommendation_id) {
      setPersistedMatch(null)
      return
    }
    let cancelled = false
    void api<MaterialSourceSearchResponse>(
      `/learning/core/threads/${encodeURIComponent(threadId)}/material-sources?recommendation_id=${encodeURIComponent(result.recommendation_id)}&expected_source_url=${encodeURIComponent(result.source_url || '')}&limit=1`,
    )
      .then((response) => {
        if (cancelled) return
        setPersistedMatch(response.sources.find((source) => source.id === result.recommendation_id) || null)
      })
      .catch(() => {
        if (!cancelled) setPersistedMatch(null)
      })
    return () => {
      cancelled = true
    }
  }, [threadId, request?.job_id, request?.status, request?.outcome, request?.result])

  const createRequest = async () => {
    setWorking('request')
    setError('')
    setMessage('')
    try {
      const response = await api<MaterialRequestResponse>(
        `/learning/core/threads/${encodeURIComponent(threadId)}/lessons/${encodeURIComponent(lesson.id)}/material-request`,
        {
          method: 'POST',
          body: JSON.stringify({ idempotency_key: `learner-${lesson.id}-${Date.now()}` }),
        },
      )
      setRequest(response.request)
      setMessage(
        response.reused
          ? 'The existing request is still the canonical request for this lesson.'
          : 'Research request created. It cannot attach or start anything.',
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Material request could not be created.')
    } finally {
      setWorking(null)
    }
  }

  const attachPersistedMatch = async () => {
    if (!persistedMatch || request?.result?.outcome !== 'ready') return
    setWorking('attach')
    setError('')
    setMessage('')
    try {
      await api(
        `/learning/core/threads/${encodeURIComponent(threadId)}/lessons/${encodeURIComponent(lesson.id)}/sources`,
        {
          method: 'POST',
          body: JSON.stringify({
            recommendation_id: persistedMatch.id,
            branch_id: persistedMatch.branch.id,
            role: 'primary',
            expected_contribution: request.result.expected_contribution,
            expected_source_url: request.result.source_url,
          }),
        },
      )
      setMessage('Saved Library source attached. The lesson remains unstarted.')
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The saved source could not be attached.')
    } finally {
      setWorking(null)
    }
  }

  const active = request && ['pending', 'running', 'retry'].includes(request.status)
  const ready = request?.status === 'completed' && request.outcome === 'ready' && request.result
  const abstained = request?.status === 'completed' && request.outcome === 'abstained' && request.result

  return (
    <section class="lesson-material-request" aria-labelledby={`lesson-material-request-${lesson.id}`}>
      <div>
        <span class="folio-object-kicker">Material gap</span>
        <h3 id={`lesson-material-request-${lesson.id}`}>Find material for this lesson</h3>
        <p>
          This explicit request researches one source for this exact lesson. It never attaches, queues, starts, or
          advances learning.
        </p>
      </div>
      {!request ? (
        <button
          class="folio-button folio-button-primary"
          type="button"
          onClick={createRequest}
          disabled={working !== null}
        >
          {working === 'request' ? 'Requesting…' : 'Find material for this lesson'}
        </button>
      ) : (
        <div class="lesson-material-request-state">
          <span class={`folio-status-tag status-${request.status}`}>{statusLabel(request.status)}</span>
          {request.updated_at ? <small>Updated {new Date(request.updated_at).toLocaleString()}</small> : null}
          {active ? (
            <button class="folio-button" type="button" onClick={load} disabled={working !== null}>
              {working === 'load' ? 'Refreshing…' : 'Refresh status'}
            </button>
          ) : null}
        </div>
      )}
      {ready ? (
        <article class="lesson-material-ready">
          <span class="folio-status-tag status-ready">Ready for review</span>
          <h4 dir="auto">{ready.title}</h4>
          {ready.creator ? <p>{ready.creator}</p> : null}
          {ready.expected_contribution ? <p dir="auto">{ready.expected_contribution}</p> : null}
          <div>
            {ready.source_url ? (
              <a class="folio-button" href={ready.source_url} target="_blank" rel="noreferrer">
                Review source · online only
              </a>
            ) : null}
            {persistedMatch ? (
              <button
                class="folio-button folio-button-primary"
                type="button"
                onClick={attachPersistedMatch}
                disabled={working !== null}
              >
                {working === 'attach' ? 'Attaching…' : 'Attach saved Library source'}
              </button>
            ) : null}
          </div>
          <small>
            {persistedMatch
              ? 'This exact URL already exists in the Library. Attaching it is a separate explicit action.'
              : 'Review only. Attach is unavailable unless this exact reviewed URL still belongs to the saved Library source; request material again if its URL changed.'}
          </small>
        </article>
      ) : null}
      {abstained ? (
        <p class="lesson-material-abstention">
          <strong>No responsible pick.</strong> {abstained.reason}
        </p>
      ) : null}
      {request?.status === 'completed' && request.result_valid === false ? (
        <p class="learning-material-error" role="alert">
          The research output did not satisfy the ready-or-abstain contract. Nothing was attached.
        </p>
      ) : null}
      {request?.status === 'failed' || request?.error ? (
        <p class="learning-material-error" role="alert">
          {request.error || 'Material research failed.'}
        </p>
      ) : null}
      {message && (
        <p class="folio-status" role="status">
          {message}
        </p>
      )}
      {error && (
        <p class="learning-material-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
