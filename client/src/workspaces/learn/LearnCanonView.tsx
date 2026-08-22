import { useMemo, useState } from 'preact/hooks'
import { api } from '../../api'
import { useData } from '../../app/useData'
import { Empty, ErrorState, Loading } from '../../components/States'
import { Icon } from '../../components/Icon'

type CanonDomain = {
  id: string
  slug: string
  kind: 'family' | 'domain'
  parent_id?: string | null
  title: string
  boundary: string
  orientation?: string | null
  curation_status: 'unmapped' | 'curating' | 'complete'
  validation_state: 'untested' | 'exploring' | 'field_tested'
  branch_id: string
  branch_label?: string | null
  branch_status?: string | null
  branch_round?: string | null
  family_title?: string | null
  family_slug?: string | null
  entry_count?: number
  entry_titles?: string[]
}

type CanonAtlasResponse = {
  atlas: null | { id: string; title: string; guiding_question: string; orientation?: string | null; selection_rubric: string }
  families: CanonDomain[]
  domains: CanonDomain[]
  counts: { domains: number; unmapped: number; curating: number; complete: number; field_tested: number }
}

type CanonEntry = {
  id: string
  role: 'foundation' | 'representative' | 'boundary'
  title: string
  author: string
  canonical_url?: string | null
  isbn?: string | null
  why_slot: string
  beginner_case: string
  expert_case: string
  unique_contribution: string
  limitations: string
  difficulty: string
  rejected_alternative: string
  rejection_reason: string
  evidence: Array<string | { label?: string; claim?: string; url?: string }>
  recommendation_id?: string | null
  editorial_status: string
  validation_state: string
  recommendation_status?: string | null
  consumed?: boolean
  blacklisted?: boolean
}

type CanonDomainResponse = {
  domain: CanonDomain
  entries: CanonEntry[]
  revisions: Array<{ id: number; replacement_reason: string; replaced_at: string }>
}

const roleMeta = {
  foundation: {
    label: 'Foundation',
    number: '01',
    subtitle: 'Core Framework',
    description: 'Build foundational vocabulary, mental models, and primary questions.',
    blueprint: 'Core models and foundational vocabulary.',
  },
  representative: {
    label: 'Representative',
    number: '02',
    subtitle: 'Mastery in Practice',
    description: 'Experience the field operating at its peak real-world depth and synthesis.',
    blueprint: 'Peak real-world depth and master craft.',
  },
  boundary: {
    label: 'Boundary',
    number: '03',
    subtitle: 'Edge & Critique',
    description: 'Challenge orthodoxies, test limits, and stretch the perimeter.',
    blueprint: 'Edge perspective testing conventional limits.',
  },
} as const

const canonDomainHref = (domain: CanonDomain) => `#/learn/canon/${encodeURIComponent(domain.slug || domain.id)}`

const stateBadge = (status: string) => {
  switch (status) {
    case 'complete':
      return { label: '3 Books Curated', class: 'state-complete' }
    case 'curating':
      return { label: 'In Curation', class: 'state-curating' }
    case 'field_tested':
      return { label: 'Field-Tested', class: 'state-complete' }
    default:
      return { label: 'Mapped', class: 'state-mapped' }
  }
}

const isReady = (domain: CanonDomain) =>
  domain.curation_status === 'complete' && Number(domain.entry_count || domain.entry_titles?.length || 0) === 3

export function LearnCanonView({ domainId }: { domainId?: string }) {
  return domainId ? <CanonDomainDetail domainId={domainId} /> : <CanonAtlas />
}

function CanonAtlas() {
  const [searchQuery, setSearchQuery] = useState('')
  const [familyId, setFamilyId] = useState('all')
  const endpoint = `/learning/core/canon`
  const data = useData<CanonAtlasResponse>(endpoint)

  const allDomains = data.data?.domains || []
  const families = data.data?.families || []

  const filteredDomains = useMemo(() => {
    return allDomains.filter((domain) => {
      const matchesFamily = familyId === 'all' || domain.parent_id === familyId
      if (!matchesFamily) return false
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase().trim()
      const inTitle = domain.title.toLowerCase().includes(q)
      const inBoundary = domain.boundary.toLowerCase().includes(q)
      const inFamily = (domain.family_title || '').toLowerCase().includes(q)
      const inBranch = (domain.branch_label || '').toLowerCase().includes(q)
      const inBooks = (domain.entry_titles || []).some((t) => t.toLowerCase().includes(q))
      return inTitle || inBoundary || inFamily || inBranch || inBooks
    })
  }, [allDomains, familyId, searchQuery])

  const readyDomains = filteredDomains.filter(isReady)
  const comingDomains = filteredDomains.filter((domain) => !isReady(domain))

  if (data.loading && !data.data) return <Loading label="Opening the Canon Atlas" />
  if (data.error && !data.data) return <ErrorState message={data.error} retry={data.reload} />
  if (!data.data?.atlas) {
    return (
      <Empty
        title="Canon is not initialized"
        body="Apply the Canon database migration to explore foundational reading paths."
      />
    )
  }

  const { atlas } = data.data

  const pickRandomField = () => {
    if (!readyDomains.length) return
    const random = readyDomains[Math.floor(Math.random() * readyDomains.length)]
    location.hash = canonDomainHref(random).slice(1)
  }

  return (
    <section class="learn-workspace folio-learn canon-atlas-workspace" aria-labelledby="canon-title">
      {/* Clean Folio Surface Head */}
      <header class="learn-surface-head folio-surface-head canon-surface-head">
        <div class="learn-header-content">
          <p class="folio-object-kicker">Learning Compass · Foundational 3-Book Atlas</p>
          <h1 id="canon-title">Canon</h1>
          <p class="folio-lede">
            Three definitive books to enter, master, and challenge any discipline with confidence.
          </p>
        </div>

        <div class="canon-head-actions">
          <button
            class="button secondary canon-surprise-btn"
            type="button"
            onClick={pickRandomField}
            disabled={!readyDomains.length}
            title="Explore a random discipline"
          >
            <Icon name="spark" size={15} />
            <span>Surprise me with a ready field</span>
          </button>
        </div>
      </header>

      {/* 3-Role Mental Model Bar */}
      <div class="canon-trio-bar" aria-label="The 3-Book Architecture">
        <div class="canon-trio-item">
          <span class="canon-trio-badge">01</span>
          <div>
            <strong>Foundation</strong>
            <small>Core mental models, vocabulary, and primary questions</small>
          </div>
        </div>
        <div class="canon-trio-sep" aria-hidden="true">→</div>
        <div class="canon-trio-item">
          <span class="canon-trio-badge">02</span>
          <div>
            <strong>Representative</strong>
            <small>Peak depth and mastery of the craft in practice</small>
          </div>
        </div>
        <div class="canon-trio-sep" aria-hidden="true">→</div>
        <div class="canon-trio-item">
          <span class="canon-trio-badge">03</span>
          <div>
            <strong>Boundary</strong>
            <small>Challenging orthodoxies and exploring outer limits</small>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div class="canon-toolbar">
        <div class="canon-filter-tabs" role="group" aria-label="Filter by knowledge area">
          <button
            type="button"
            aria-pressed={familyId === 'all'}
            class={`canon-filter-tab ${familyId === 'all' ? 'is-active' : ''}`}
            onClick={() => setFamilyId('all')}
          >
            All Fields <span class="canon-tab-count">{allDomains.length}</span>
          </button>
          {families.map((family) => {
            const count = allDomains.filter((d) => d.parent_id === family.id).length
            return (
              <button
                key={family.id}
                type="button"
                aria-pressed={familyId === family.id}
                class={`canon-filter-tab ${familyId === family.id ? 'is-active' : ''}`}
                onClick={() => setFamilyId(family.id)}
              >
                {family.title} <span class="canon-tab-count">{count}</span>
              </button>
            )
          })}
        </div>

        <div class="canon-search-wrapper">
          <Icon name="search" size={15} class="canon-search-icon" />
          <input
            type="search"
            value={searchQuery}
            onInput={(e) => setSearchQuery((e.currentTarget as HTMLInputElement).value)}
            placeholder="Search disciplines or books…"
            aria-label="Search Canon disciplines"
          />
          {searchQuery && (
            <button
              class="canon-search-clear"
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <Icon name="close" size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Learner-first field split */}
      {filteredDomains.length === 0 ? (
        <div class="canon-empty-state">
          <Icon name="search" size={28} />
          <h3>No matching disciplines found</h3>
          <p>Try searching for another topic or clear filters to view all fields.</p>
          <button class="button secondary" type="button" onClick={() => { setSearchQuery(''); setFamilyId('all') }}>
            Reset Filters
          </button>
        </div>
      ) : (
        <>
          <CanonLearnerSection title="Ready to explore" domains={readyDomains} families={families} />
          <CanonLearnerSection title="Coming next" domains={comingDomains} families={families} />
        </>
      )}

      {/* Rubric Guide Footer */}
      <footer class="canon-footer-rubric">
        <details class="canon-rubric-details">
          <summary>
            <Icon name="balance" size={16} />
            <span>How Books Earn a Place in the Canon</span>
          </summary>
          <div class="canon-rubric-content">
            <div>
              <strong>Selection Rubric</strong>
              <p>{atlas.selection_rubric || 'Every book must serve a distinct role: establish foundational mental models, demonstrate master craft, or push the outer boundary.'}</p>
            </div>
            <div>
              <strong>Curatorial Standard</strong>
              <p>{atlas.guiding_question || 'Does this trio allow a curious mind to enter the field with confidence, grasp its essential debates, and avoid standard beginner traps?'}</p>
            </div>
          </div>
        </details>
      </footer>
    </section>
  )
}

function CanonLearnerSection({ title, domains, families }: { title: string; domains: CanonDomain[]; families: CanonDomain[] }) {
  return (
    <section class="canon-learner-section" aria-labelledby={`canon-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <header class="canon-learner-section-head">
        <div>
          <p class="folio-object-kicker">Canon field coverage</p>
          <h2 id={`canon-${title.toLowerCase().replace(/\s+/g, '-')}`}>{title}</h2>
        </div>
        <span class="canon-family-badge">{domains.length} {domains.length === 1 ? 'Field' : 'Fields'}</span>
      </header>
      {domains.length ? (
        <div class="canon-sections-flow">
          {families
            .filter((family) => domains.some((domain) => domain.parent_id === family.id))
            .map((family) => {
              const domainsInFamily = domains.filter((domain) => domain.parent_id === family.id)
              return (
                <section key={`${title}-${family.id}`} class="canon-family-block">
                  <header class="canon-family-header">
                    <div>
                      <h3 class="canon-family-name">{family.title}</h3>
                      <p class="canon-family-desc">{family.boundary}</p>
                    </div>
                    <span class="canon-family-badge">
                      {domainsInFamily.length} {domainsInFamily.length === 1 ? 'Field' : 'Fields'}
                    </span>
                  </header>
                  <div class="canon-cards-grid">
                    {domainsInFamily.map((domain) => <CanonFieldCard key={domain.id} domain={domain} />)}
                  </div>
                </section>
              )
            })}
        </div>
      ) : (
        <p class="canon-learner-empty">No fields in this view yet.</p>
      )}
    </section>
  )
}

function CanonFieldCard({ domain }: { domain: CanonDomain }) {
  const ready = isReady(domain)
  const status = stateBadge(domain.curation_status)
  const bookTitles = domain.entry_titles || []

  return (
    <article class="canon-entry-card" aria-labelledby={`domain-${domain.id}`}>
      <div class="canon-card-topbar">
        <div class="canon-card-title-group">
          <h3 id={`domain-${domain.id}`} class="canon-entry-title">
            {ready ? <a href={canonDomainHref(domain)}>{domain.title}</a> : domain.title}
          </h3>
          <span class={`canon-pill ${status.class}`}>{status.label}</span>
        </div>

        {domain.branch_label && (
          <div class="canon-branch-pill">
            <Icon name="branch" size={12} />
            <span>{domain.branch_label}</span>
            {domain.branch_round && <small>· {domain.branch_round}</small>}
          </div>
        )}
      </div>

      <p class="canon-entry-boundary">{domain.boundary}</p>

      {/* 3-Book Shelf Visualizer */}
      <div class="canon-entry-shelf">
        {ready && bookTitles.length === 3 ? (
          <ol class="canon-shelf-list">
            {bookTitles.map((title, idx) => {
              const roleKey = idx === 0 ? 'foundation' : idx === 1 ? 'representative' : 'boundary'
              const meta = roleMeta[roleKey]
              return (
                <li key={title} class="canon-shelf-item">
                  <span class="canon-shelf-num">{meta.number}</span>
                  <div class="canon-shelf-details">
                    <span class="canon-shelf-role">{meta.label}</span>
                    <strong class="canon-shelf-title">{title}</strong>
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <div class="canon-shelf-roadmap">
            <div class="canon-roadmap-slot">
              <span class="canon-slot-num">01</span>
              <span>Foundation</span>
            </div>
            <div class="canon-roadmap-slot">
              <span class="canon-slot-num">02</span>
              <span>Representative</span>
            </div>
            <div class="canon-roadmap-slot">
              <span class="canon-slot-num">03</span>
              <span>Boundary</span>
            </div>
          </div>
        )}
      </div>

      {ready && <div class="canon-card-action-bar">
          <a class="button secondary canon-view-btn" aria-label={`Explore Canon field ${domain.title}`} href={canonDomainHref(domain)}>
          <span>Explore 3-Book Path</span>
          <Icon name="chevron" size={14} />
        </a>
      </div>}
    </article>
  )
}

function CanonDomainDetail({ domainId }: { domainId: string }) {
  const data = useData<CanonDomainResponse>(`/learning/core/canon/domains/${encodeURIComponent(domainId)}`)
  const [working, setWorking] = useState('')
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  if (data.loading && !data.data) return <Loading label="Opening Canon Dossier" />
  if (data.error && !data.data) return <ErrorState message={data.error} retry={data.reload} />
  if (!data.data) {
    return (
      <Empty
        title="Discipline not found"
        body="This field may have been renamed or merged."
        action={
          <a class="button secondary" href="#/learn?mode=canon">
            Return to Canon Atlas
          </a>
        }
      />
    )
  }

  const { domain, entries } = data.data
  const entryByRole = new Map(entries.map((entry) => [entry.role, entry]))
  const orderedRoles: Array<keyof typeof roleMeta> = ['foundation', 'representative', 'boundary']
  const orderedEntries = orderedRoles.map((role) => entryByRole.get(role)).filter(Boolean) as CanonEntry[]
  const ready = domain.curation_status === 'complete' && orderedEntries.length === 3
  const capturedCount = orderedEntries.filter((entry) => entry.recommendation_id).length

  const capture = async (entry: CanonEntry) => {
    setWorking(`capture:${entry.id}`)
    setNotice(null)
    try {
      const result = await api<{ id: string; state: string }>(
        `/learning/core/canon/entries/${encodeURIComponent(entry.id)}/capture`,
        { method: 'POST' }
      )
      setNotice({
        kind: 'success',
        message: result.state === 'captured'
          ? `"${entry.title}" was saved to your Library under ${domain.branch_label || 'this branch'}.`
          : `"${entry.title}" is already in your Library.`
      })
      data.reload()
    } catch (error: any) {
      setNotice({ kind: 'error', message: error?.message || 'Could not save this book.' })
    } finally {
      setWorking('')
    }
  }

  const startThread = async () => {
    setWorking('thread')
    setNotice(null)
    try {
      const result = await api<{ id: string }>(
        `/learning/core/canon/domains/${encodeURIComponent(domain.id)}/thread`,
        { method: 'POST' }
      )
      location.hash = `#/learn/thread/${encodeURIComponent(result.id)}`
    } catch (error: any) {
      setNotice({ kind: 'error', message: error?.message || 'Could not create a Learning Thread from this discipline.' })
      setWorking('')
    }
  }

  return (
    <section class="learn-workspace folio-learn canon-detail-workspace canon-domain-detail" aria-labelledby="canon-domain-title">
      {/* Breadcrumb Navigation */}
      <nav class="canon-breadcrumb" aria-label="Breadcrumb">
        <a class="canon-back-link" href="#/learn?mode=canon">
          <Icon name="back" size={15} />
          <span>Canon</span>
        </a>
        <span class="canon-breadcrumb-sep">/</span>
        <span class="canon-breadcrumb-current">{domain.family_title || 'Disciplines'}</span>
      </nav>

      {/* Header */}
      <header class="learn-surface-head folio-surface-head canon-dossier-head">
        <div class="learn-header-content">
          <div class="canon-head-tags">
            {domain.branch_label && (
              <span class="canon-branch-pill">
                <Icon name="branch" size={12} />
                {domain.branch_label}
                {domain.branch_round ? ` · ${domain.branch_round}` : ''}
              </span>
            )}
            <span class={`canon-pill ${stateBadge(domain.curation_status).class}`}>
              {stateBadge(domain.curation_status).label}
            </span>
          </div>

          <h1 id="canon-domain-title">{domain.title}</h1>
          <p class="folio-lede">{domain.boundary}</p>
          {domain.orientation && (
            <p class="canon-orientation-tip">
              <Icon name="spark" size={14} />
              <span>{domain.orientation}</span>
            </p>
          )}
        </div>

      </header>

      {/* Notice Banner */}
      {notice && (
        <div class={`canon-notice-banner ${notice.kind === 'error' ? 'is-error' : ''}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          <Icon name={notice.kind === 'error' ? 'warning' : 'check'} size={15} />
          <span>{notice.message}</span>
        </div>
      )}

      {!ready && (
        <div class="canon-pending-panel">
          <p class="folio-object-kicker">Coming next</p>
          <h2>Field curation in progress</h2>
          <p>This field is being prepared. Its three-book path will appear after Foundation, Representative, and Boundary are each approved.</p>
        </div>
      )}

      {/* The 3-Book Path */}
      <div class="canon-path-section">
        <div class="folio-section-head">
          <div>
            <p class="folio-object-kicker">Curated Reading Path</p>
            <h2>The Three-Book Path</h2>
          </div>
          <span class="folio-measure">
            {orderedEntries.length} of 3 books curated
          </span>
        </div>

        <div class="canon-books-ledger">
          {orderedRoles.map((role) => {
            const meta = roleMeta[role]
            const entry = entryByRole.get(role)

            if (!entry) {
              return (
                <article key={role} class={`canon-book-row canon-book-empty-row role-${role}`}>
                  <div class="canon-row-role-tag">
                    <span class="canon-role-num">{meta.number}</span>
                    <div>
                      <strong>{meta.label}</strong>
                      <small>{meta.subtitle}</small>
                    </div>
                  </div>
                  <div class="canon-empty-blueprint">
                    <p>{meta.blueprint}</p>
                    <span class="canon-empty-status">Dossier in curation</span>
                  </div>
                </article>
              )
            }

            return (
              <article key={entry.id} class={`canon-book-row canon-book-section role-${entry.role}`}>
                <div class="canon-row-role-tag">
                  <span class="canon-role-num">{meta.number}</span>
                  <div>
                    <h2 class="canon-role-lbl">{meta.label}</h2>
                    <strong class="canon-role-sub">{meta.subtitle}</strong>
                  </div>
                </div>

                <div class="canon-row-main">
                  <div class="canon-row-identity">
                    <div>
                      <h3 class="canon-book-heading">{entry.title}</h3>
                      <p class="canon-book-byline">by {entry.author}</p>
                    </div>

                    <div class="canon-row-badges">
                      {entry.consumed && <span class="canon-pill state-complete">Consumed</span>}
                      {entry.blacklisted && <span class="canon-pill state-danger">Excluded</span>}
                      <span class="canon-pill">{entry.difficulty}</span>
                    </div>
                  </div>

                  <p class="canon-row-thesis">{entry.why_slot}</p>

                  <div class="canon-row-insights">
                    <div class="canon-insight-col">
                      <small>Best Entry For</small>
                      <p>{entry.beginner_case}</p>
                    </div>
                    <div class="canon-insight-col">
                      <small>Unique Contribution</small>
                      <p>{entry.unique_contribution}</p>
                    </div>
                  </div>

                  <div class="canon-row-actions">
                    {entry.recommendation_id ? (
                      <a
                        class="button secondary"
                        href={`#/learn/book/${encodeURIComponent(entry.recommendation_id)}?mode=canon&focus=shelf`}
                      >
                        <Icon name="library" size={15} />
                        <span>Open on Shelf</span>
                      </a>
                    ) : (
                      <button
                        class="button primary folio-primary"
                        type="button"
                        disabled={Boolean(entry.blacklisted || entry.consumed || working === `capture:${entry.id}`)}
                        onClick={() => capture(entry)}
                      >
                        <Icon name="capture" size={15} />
                        <span>
                          {working === `capture:${entry.id}`
                            ? 'Saving…'
                            : entry.role === 'foundation'
                            ? 'Save Starting Book'
                            : 'Save to Library'}
                        </span>
                      </button>
                    )}
                    {entry.canonical_url && (
                      <a
                        class="button quiet"
                        href={entry.canonical_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Icon name="external" size={13} />
                        <span>Book Page</span>
                      </a>
                    )}
                  </div>

                  {/* Accordion Notes */}
                  <details class="canon-row-deepdive">
                    <summary>
                      <Icon name="chevron" size={13} />
                      <span>Rationale, Limits & Alternatives</span>
                    </summary>
                    <div class="canon-deepdive-grid">
                      <div>
                        <small>Why Experts Respect It</small>
                        <p>{entry.expert_case}</p>
                      </div>
                      <div>
                        <small>Known Limitations</small>
                        <p>{entry.limitations}</p>
                      </div>
                      <div>
                        <small>Strongest rejected alternative</small>
                        <p>
                          <strong>{entry.rejected_alternative}</strong> — {entry.rejection_reason}
                        </p>
                      </div>
                    </div>
                  </details>
                </div>
              </article>
            )
          })}
        </div>
      </div>

      {/* Comparison Matrix */}
      {orderedEntries.length > 0 && (
        <div class="canon-matrix-wrap">
          <div class="folio-section-head">
            <div>
              <p class="folio-object-kicker">At a Glance</p>
              <h2>Trio Comparison</h2>
            </div>
          </div>

          <div class="canon-table-container">
            <table class="canon-table">
              <thead>
                <tr>
                  <th scope="col">Role</th>
                  <th scope="col">Book & Author</th>
                  <th scope="col">Best For</th>
                  <th scope="col">Difficulty</th>
                  <th scope="col">Main Limitation</th>
                </tr>
              </thead>
              <tbody>
                {orderedEntries.map((entry) => (
                  <tr key={entry.id}>
                    <th scope="row">
                      <span class="canon-matrix-pill">{roleMeta[entry.role].label}</span>
                    </th>
                    <td>
                      <strong>{entry.title}</strong>
                      <div class="canon-matrix-author">{entry.author}</div>
                    </td>
                    <td>{entry.beginner_case}</td>
                    <td><span class="canon-pill">{entry.difficulty}</span></td>
                    <td class="canon-matrix-limit">{entry.limitations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Thread Creation CTA */}
      {ready && <div class="canon-bottom-cta">
        <div>
          <h3>Ready to study {domain.title}?</h3>
          <p>
            {capturedCount
              ? `${capturedCount} of 3 books are saved to your Library. Launch a structured Learning Thread to track your reading and synthesis.`
              : 'Save at least one book to your Shelf before creating a structured Learning Thread.'}
          </p>
        </div>
        <button
          class="button primary folio-primary"
          type="button"
          disabled={working === 'thread' || capturedCount === 0}
          onClick={startThread}
        >
          <Icon name="path" size={16} />
          <span>{working === 'thread' ? 'Creating Thread…' : 'Create three-book Thread'}</span>
        </button>
      </div>}
    </section>
  )
}
