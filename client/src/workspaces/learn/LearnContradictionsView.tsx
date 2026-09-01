import { useState } from 'preact/hooks'
import { api } from '../../api'
import { useData } from '../../app/useData'
import { objectHref } from '../../app/router'
import { Empty, ErrorState, Loading } from '../../components/States'
import { SemanticRelation } from './types'

type ContradictionsResponse = { contradictions: SemanticRelation[] }

export function LearnContradictionsView() {
  const data = useData<ContradictionsResponse>('/learning/core/contradictions?review_state=pending')
  const [resolution, setResolution] = useState<Record<string, string>>({})
  const [working, setWorking] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const review = async (id: string, reviewState: 'accepted' | 'resolved' | 'dismissed') => {
    setWorking(id)
    setMessage('')
    try {
      await api(`/learning/core/contradictions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ review_state: reviewState, resolution: resolution[id] || undefined }),
      })
      await data.reload()
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'The contradiction could not be reviewed.')
    } finally {
      setWorking(null)
    }
  }

  if (data.loading && !data.data) return <Loading label="Loading contradictions" />
  if (data.error && !data.data) return <ErrorState message={data.error} retry={data.reload} />
  const contradictions = data.data?.contradictions || []
  return (
    <section class="relation-review-workspace" aria-labelledby="contradictions-title">
      <header class="notes-index-head">
        <div>
          <p class="folio-object-kicker">Learn / Practice</p>
          <h1 id="contradictions-title">Contradiction review</h1>
          <p class="folio-lede">Resolve grounded tensions between retained ideas without changing lesson progress.</p>
        </div>
        <span class="folio-measure">{contradictions.length} pending</span>
      </header>
      {message && (
        <output class="folio-status" aria-live="polite">
          {message}
        </output>
      )}
      {contradictions.length ? (
        <div class="relation-review-list">
          {contradictions.map((relation) => (
            <article class="relation-review-card" key={relation.id}>
              <div class="relation-review-pair">
                {[relation.source, relation.target].map((endpoint) => (
                  <div key={endpoint.unit_id}>
                    <span class="folio-branch-pill">
                      {endpoint.branch.label} · {endpoint.branch.domain}
                    </span>
                    <a href={objectHref('learn', 'unit', endpoint.unit_id)}>{endpoint.statement}</a>
                    {endpoint.anchor && <small>{endpoint.anchor.locator}</small>}
                  </div>
                ))}
              </div>
              <p class="relation-explanation">
                <strong>Why these conflict</strong>
                {relation.why}
              </p>
              <label>
                Resolution
                <textarea
                  rows={2}
                  value={resolution[relation.id] || ''}
                  onInput={(event) =>
                    setResolution({ ...resolution, [relation.id]: (event.target as HTMLTextAreaElement).value })
                  }
                  placeholder="Required to resolve or dismiss"
                />
              </label>
              <div class="relation-review-actions">
                <button
                  class="button secondary"
                  disabled={working === relation.id}
                  onClick={() => review(relation.id, 'accepted')}
                >
                  Keep open
                </button>
                <button
                  class="button secondary"
                  disabled={working === relation.id || !resolution[relation.id]?.trim()}
                  onClick={() => review(relation.id, 'dismissed')}
                >
                  Dismiss
                </button>
                <button
                  class="button primary"
                  disabled={working === relation.id || !resolution[relation.id]?.trim()}
                  onClick={() => review(relation.id, 'resolved')}
                >
                  Resolve
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="No contradictions need review"
          body="New grounded contradictions will appear here before they become part of the accepted knowledge graph."
        />
      )}
    </section>
  )
}
