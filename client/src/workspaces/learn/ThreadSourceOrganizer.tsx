import { levelNumber } from './threadViewModel'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { api } from '../../api'
import { Icon } from '../../components/Icon'
import { offlinePairResources } from '../../offlinePacks'
import { cleanTitle, roleLabel, statusLabel } from './helpers'
import { levelTitle } from './threadViewModel'
import type { MaterialSourceSearchItem, MaterialSourceSearchResponse, PathResponse, PathSource } from './types'

type OrganizerScope = 'thread' | 'level' | 'lesson'

interface OrganizerPlacement {
  key: string
  scope: OrganizerScope
  scopeId: string
  scopeTitle: string
  source: PathSource
}

const lessonSourceRoles = ['primary', 'case', 'challenge', 'reference', 'optional'] as const
const threadSourceRoles = ['primary', 'supporting', 'counterevidence', 'reference'] as const

function organizerPlacements(path: PathResponse): OrganizerPlacement[] {
  return [
    ...path.sources.map((source) => ({
      key: `thread:${path.thread.id}:${source.recommendation_id}`,
      scope: 'thread' as const,
      scopeId: path.thread.id,
      scopeTitle: path.thread.title,
      source,
    })),
    ...path.stages.flatMap((stage) => [
      ...stage.sources.map((source) => ({
        key: `level:${stage.id}:${source.recommendation_id}`,
        scope: 'level' as const,
        scopeId: stage.id,
        scopeTitle: stage.title,
        source,
      })),
      ...stage.lessons.flatMap((lesson) =>
        (lesson.sources || []).map((source) => ({
          key: `lesson:${lesson.id}:${source.recommendation_id}`,
          scope: 'lesson' as const,
          scopeId: lesson.id,
          scopeTitle: lesson.title,
          source,
        })),
      ),
    ]),
  ]
}

function placementEndpoint(threadId: string, placement: OrganizerPlacement) {
  const base = `/learning/core/threads/${encodeURIComponent(threadId)}`
  if (placement.scope === 'thread') return `${base}/sources/${encodeURIComponent(placement.source.recommendation_id)}`
  if (placement.scope === 'level')
    return `${base}/stages/${encodeURIComponent(placement.scopeId)}/sources/${encodeURIComponent(placement.source.recommendation_id)}`
  return `${base}/lessons/${encodeURIComponent(placement.scopeId)}/sources/${encodeURIComponent(placement.source.recommendation_id)}`
}

function placementCollectionEndpoint(threadId: string, scope: OrganizerScope, scopeId: string) {
  const base = `/learning/core/threads/${encodeURIComponent(threadId)}`
  if (scope === 'thread') return `${base}/sources`
  if (scope === 'level') return `${base}/stages/${encodeURIComponent(scopeId)}/sources`
  return `${base}/lessons/${encodeURIComponent(scopeId)}/sources`
}

export function ThreadSourceOrganizer({ path, onChanged }: { path: PathResponse; onChanged: () => void }) {
  const requestedLessonId = new URLSearchParams(location.hash.split('?')[1]).get('lesson')
  const requestedTarget =
    requestedLessonId && path.stages.some((stage) => stage.lessons.some((lesson) => lesson.id === requestedLessonId))
      ? `lesson:${requestedLessonId}`
      : ''
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MaterialSourceSearchItem[]>([])
  const [selectedSourceId, setSelectedSourceId] = useState('')
  const [target, setTarget] = useState(requestedTarget)
  const [role, setRole] = useState<(typeof lessonSourceRoles)[number]>('primary')
  const [contribution, setContribution] = useState('')
  const [position, setPosition] = useState('')
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const searchSequence = useRef(0)
  const placements = organizerPlacements(path)
  const selectedSource = results.find((source) => source.id === selectedSourceId) || null
  const targets = path.stages.flatMap((stage) => [
    {
      value: `level:${stage.id}`,
      scope: 'level' as const,
      id: stage.id,
      label: `Level ${levelNumber(stage)} — ${levelTitle(stage)}`,
    },
    ...stage.lessons.map((lesson, index) => ({
      value: `lesson:${lesson.id}`,
      scope: 'lesson' as const,
      id: lesson.id,
      label: `Lesson ${levelNumber(stage)}.${index + 1} — ${lesson.title}`,
    })),
  ])

  const searchLibrary = useCallback(
    async (searchQuery: string) => {
      const request = ++searchSequence.current
      setSearching(true)
      setError('')
      try {
        const response = await api<MaterialSourceSearchResponse>(
          `/learning/core/threads/${encodeURIComponent(path.thread.id)}/material-sources?q=${encodeURIComponent(searchQuery.trim())}&limit=30`,
        )
        if (request !== searchSequence.current) return
        setResults(response.sources || [])
        setSelectedSourceId((current) => (response.sources?.some((source) => source.id === current) ? current : ''))
      } catch (reason) {
        if (request !== searchSequence.current) return
        setError(reason instanceof Error ? reason.message : 'Library sources could not be loaded.')
      } finally {
        if (request === searchSequence.current) setSearching(false)
      }
    },
    [path.thread.id],
  )

  useEffect(() => {
    setQuery('')
    setSelectedSourceId('')
    setTarget(requestedTarget)
    void searchLibrary('')
    return () => {
      searchSequence.current += 1
    }
  }, [path.thread.id, searchLibrary, requestedTarget])

  const submitSearch = (event: Event) => {
    event.preventDefault()
    void searchLibrary(query)
  }

  const attach = async (event: Event) => {
    event.preventDefault()
    const chosenTarget = targets.find((candidate) => candidate.value === target)
    if (!selectedSource || !chosenTarget || !contribution.trim()) return
    const collision =
      role === 'optional'
        ? null
        : placements.find(
            (placement) =>
              placement.scope === chosenTarget.scope &&
              placement.scopeId === chosenTarget.id &&
              placement.source.role === role &&
              placement.source.recommendation_id !== selectedSource.id,
          )
    if (
      collision &&
      !window.confirm(
        `Replace ${cleanTitle(collision.source.video_title) || 'the current source'} in the ${role} role for ${chosenTarget.label}?`,
      )
    )
      return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await api<{ replaced_recommendation_ids?: string[] }>(
        placementCollectionEndpoint(path.thread.id, chosenTarget.scope, chosenTarget.id),
        {
          method: 'POST',
          body: JSON.stringify({
            recommendation_id: selectedSource.id,
            branch_id: selectedSource.branch.id,
            role,
            expected_contribution: contribution.trim(),
            ...(position.trim() ? { position: Math.max(0, Number(position) || 0) } : {}),
          }),
        },
      )
      const replaced = response.replaced_recommendation_ids?.length || 0
      setMessage(
        replaced
          ? `Source attached. ${replaced} previous ${role} placement replaced.`
          : 'Source attached to the exact owner.',
      )
      onChanged()
      await searchLibrary(query)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Source could not be attached.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section class="thread-source-organizer" aria-labelledby="thread-source-organizer-title">
      <header>
        <div>
          <span class="folio-object-kicker">Source organizer</span>
          <h3 id="thread-source-organizer-title">Place saved sources exactly</h3>
          <p>Search the Library first, then attach one source to one Level or Lesson. Nothing is queued or started.</p>
        </div>
        <span>{placements.length} direct placements</span>
      </header>

      <div class="thread-source-organizer-grid">
        <section class="thread-source-search" aria-label="Search saved Library sources">
          <form onSubmit={submitSearch}>
            <label>
              <span>Search the Library</span>
              <span class="vertical-materials-search-field">
                <Icon name="search" size={15} />
                <input
                  type="search"
                  value={query}
                  onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
                  placeholder="Title, creator, reason, branch, or domain"
                />
              </span>
            </label>
            <button class="folio-button" disabled={searching}>
              {searching ? 'Searching…' : 'Search Library'}
            </button>
          </form>

          <div class="thread-source-search-results" aria-live="polite">
            {results.length ? (
              results.map((source) => {
                const selected = source.id === selectedSourceId
                const pairReady =
                  offlinePairResources(source.artifacts?.html, source.artifacts?.pdf, source.id).length === 2
                return (
                  <button
                    type="button"
                    class={selected ? 'is-selected' : ''}
                    aria-pressed={selected}
                    onClick={() => {
                      setSelectedSourceId(source.id)
                      setContribution(source.why_this || '')
                    }}
                    key={source.id}
                  >
                    <span>
                      <strong dir="auto">{cleanTitle(source.title) || 'Untitled source'}</strong>
                      <small>{source.creator || source.content_type || 'Saved Library source'}</small>
                    </span>
                    <span class="thread-source-result-meta">
                      <span>{source.branch.label || source.branch.id}</span>
                      <span>{source.branch.domain_label || source.branch.super_category}</span>
                      {pairReady ? <span>Verified companion</span> : null}
                      {source.health?.status ? <span>Original: {statusLabel(source.health.status)}</span> : null}
                    </span>
                    {source.placements.length ? (
                      <small>
                        {source.placements.length} existing placement{source.placements.length === 1 ? '' : 's'}
                      </small>
                    ) : null}
                  </button>
                )
              })
            ) : (
              <p>{searching ? 'Searching saved sources…' : 'No saved Library sources match this search.'}</p>
            )}
          </div>
        </section>

        <form class="thread-source-attach" onSubmit={attach}>
          <h4>Attach selected source</h4>
          <p>{selectedSource ? cleanTitle(selectedSource.title) : 'Select a saved source from the Library results.'}</p>
          <label>
            <span>Exact owner</span>
            <select
              value={target}
              onChange={(event) => setTarget((event.currentTarget as HTMLSelectElement).value)}
              required
            >
              <option value="">Choose a Level or Lesson</option>
              {targets.map((candidate) => (
                <option value={candidate.value} key={candidate.value}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </label>
          <div class="thread-source-attach-row">
            <label>
              <span>Role</span>
              <select
                value={role}
                onChange={(event) => setRole((event.currentTarget as HTMLSelectElement).value as typeof role)}
              >
                {lessonSourceRoles.map((value) => (
                  <option value={value} key={value}>
                    {roleLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Position</span>
              <input
                type="number"
                min="0"
                step="1"
                value={position}
                placeholder="End"
                onInput={(event) => setPosition((event.currentTarget as HTMLInputElement).value)}
              />
            </label>
          </div>
          <label>
            <span>Expected contribution</span>
            <textarea
              value={contribution}
              onInput={(event) => setContribution((event.currentTarget as HTMLTextAreaElement).value)}
              placeholder="What should this source contribute to this exact Level or Lesson?"
              required
            />
          </label>
          <button
            class="folio-button folio-button-primary"
            disabled={saving || !selectedSource || !target || !contribution.trim()}
          >
            {saving ? 'Attaching…' : 'Attach to this owner'}
          </button>
          <small>Primary, case, challenge, and reference are single slots. Optional sources can coexist.</small>
        </form>
      </div>

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

      <details class="thread-source-placements" open>
        <summary>
          <span>
            <strong>Direct source placements</strong>
            <small>Thread, Level, and Lesson ownership</small>
          </span>
          <span>{placements.length}</span>
        </summary>
        {placements.length ? (
          <div>
            {placements.map((placement) => (
              <SourcePlacementEditor
                key={placement.key}
                threadId={path.thread.id}
                placement={placement}
                placements={placements}
                onChanged={() => {
                  onChanged()
                  void searchLibrary(query)
                }}
              />
            ))}
          </div>
        ) : (
          <p class="folio-empty-line">No sources are directly placed in this Thread yet.</p>
        )}
      </details>
    </section>
  )
}

function SourcePlacementEditor({
  threadId,
  placement,
  placements,
  onChanged,
}: {
  threadId: string
  placement: OrganizerPlacement
  placements: OrganizerPlacement[]
  onChanged: () => void
}) {
  const availableRoles = placement.scope === 'thread' ? threadSourceRoles : lessonSourceRoles
  const initialRole = availableRoles.includes((placement.source.role || '') as never)
    ? String(placement.source.role)
    : availableRoles[0]
  const [role, setRole] = useState(initialRole)
  const [contribution, setContribution] = useState(placement.source.expected_contribution || '')
  const [position, setPosition] = useState(String(placement.source.position || 0))
  const [working, setWorking] = useState<'save' | 'remove' | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setRole(
      availableRoles.includes((placement.source.role || '') as never)
        ? String(placement.source.role)
        : availableRoles[0],
    )
    setContribution(placement.source.expected_contribution || '')
    setPosition(String(placement.source.position || 0))
  }, [availableRoles, placement.source.role, placement.source.expected_contribution, placement.source.position])

  const save = async (event: Event) => {
    event.preventDefault()
    const expectedContribution = contribution.trim()
    if (!expectedContribution) {
      setError('Explain the expected contribution before saving this placement.')
      return
    }
    const collision =
      role === 'optional'
        ? null
        : placements.find(
            (candidate) =>
              candidate.key !== placement.key &&
              candidate.scope === placement.scope &&
              candidate.scopeId === placement.scopeId &&
              candidate.source.role === role,
          )
    if (
      collision &&
      !window.confirm(
        `Replace ${cleanTitle(collision.source.video_title) || 'the current source'} in the ${role} role?`,
      )
    )
      return
    setWorking('save')
    setError('')
    setMessage('')
    try {
      const endpoint = placementEndpoint(threadId, placement)
      const response = await api<{ replaced_recommendation_ids?: string[] }>(endpoint, {
        method: 'PATCH',
        body: JSON.stringify({
          role,
          expected_contribution: expectedContribution,
          position: Math.max(0, Number(position) || 0),
        }),
      })
      setMessage(
        response.replaced_recommendation_ids?.length
          ? 'Placement saved; the previous role holder was replaced.'
          : 'Placement saved.',
      )
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Placement could not be saved.')
    } finally {
      setWorking(null)
    }
  }

  const remove = async () => {
    if (
      !window.confirm(
        `Remove ${cleanTitle(placement.source.video_title) || 'this source'} from ${placement.scopeTitle}? The Library source will be kept.`,
      )
    )
      return
    setWorking('remove')
    setError('')
    setMessage('')
    try {
      await api(placementEndpoint(threadId, placement), { method: 'DELETE' })
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Placement could not be removed.')
    } finally {
      setWorking(null)
    }
  }

  return (
    <form class="thread-source-placement" onSubmit={save}>
      <div class="thread-source-placement-heading">
        <span class={`learning-owner-pill owner-${placement.scope}`}>{placement.scope}</span>
        <span>
          <strong dir="auto">{cleanTitle(placement.source.video_title) || 'Untitled source'}</strong>
          <small>{placement.scopeTitle}</small>
        </span>
        {placement.source.video_url ? (
          <a href={placement.source.video_url} target="_blank" rel="noreferrer">
            Original · online only
          </a>
        ) : null}
      </div>
      <div class="thread-source-placement-fields">
        <label>
          <span>Role</span>
          <select value={role} onChange={(event) => setRole((event.currentTarget as HTMLSelectElement).value)}>
            {availableRoles.map((value) => (
              <option value={value} key={value}>
                {roleLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Position</span>
          <input
            type="number"
            min="0"
            step="1"
            value={position}
            onInput={(event) => setPosition((event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <label class="thread-source-placement-contribution">
          <span>Expected contribution</span>
          <input
            value={contribution}
            onInput={(event) => setContribution((event.currentTarget as HTMLInputElement).value)}
            placeholder="Why it belongs here"
            required
          />
        </label>
      </div>
      <div class="thread-source-placement-actions">
        <button class="folio-button" disabled={working !== null || !contribution.trim()}>
          {working === 'save' ? 'Saving…' : 'Save placement'}
        </button>
        <button class="folio-button is-danger" type="button" onClick={remove} disabled={working !== null}>
          {working === 'remove' ? 'Removing…' : 'Remove placement'}
        </button>
        {message && <small role="status">{message}</small>}
        {error && (
          <small class="learning-material-error" role="alert">
            {error}
          </small>
        )}
      </div>
    </form>
  )
}
