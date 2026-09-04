import { useMemo, useState } from 'preact/hooks'
import { api } from '../../api'
import { useData } from '../../app/useData'
import { Empty, ErrorState, Loading } from '../../components/States'
import { Icon } from '../../components/Icon'

type CanonRole = 'foundation' | 'representative' | 'boundary'

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
  family_title?: string | null
  family_slug?: string | null
  entry_count?: number
  entry_titles?: string[]
  entry_roles?: Record<CanonRole, string | null>
}

type CanonAtlasResponse = {
  atlas: null | {
    id: string
    title: string
    guiding_question: string
    orientation?: string | null
    selection_rubric: string
  }
  families: CanonDomain[]
  domains: CanonDomain[]
  counts: { domains: number; unmapped: number; curating: number; complete: number; field_tested: number }
}

const EMPTY_CANON_DOMAINS: CanonDomain[] = []

type CanonEntry = {
  id: string
  role: CanonRole
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
    roleClass: 'role-foundation',
  },
  representative: {
    label: 'Representative',
    number: '02',
    subtitle: 'Mastery in Practice',
    description: 'Experience the field operating at its peak real-world depth and synthesis.',
    blueprint: 'Peak real-world depth and master craft.',
    roleClass: 'role-representative',
  },
  boundary: {
    label: 'Boundary',
    number: '03',
    subtitle: 'Edge & Critique',
    description: 'Challenge orthodoxies, test limits, and stretch the perimeter.',
    blueprint: 'Edge perspective testing conventional limits.',
    roleClass: 'role-boundary',
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

export function LearnCanonView({
  domainId,
  integrated = false,
  searchQuery = '',
  onClearSearch,
}: {
  domainId?: string
  integrated?: boolean
  searchQuery?: string
  onClearSearch?: () => void
}) {
  return domainId ? (
    <CanonDomainDetail domainId={domainId} />
  ) : (
    <CanonAtlas integrated={integrated} searchQuery={searchQuery} onClearSearch={onClearSearch} />
  )
}

function CanonAtlas({
  integrated,
  searchQuery: sharedSearchQuery,
  onClearSearch,
}: {
  integrated: boolean
  searchQuery: string
  onClearSearch?: () => void
}) {
  const [localSearchQuery, setLocalSearchQuery] = useState('')
  const [familyId, setFamilyId] = useState('all')
  const searchQuery = integrated ? localSearchQuery || sharedSearchQuery : localSearchQuery
  const endpoint = `/learning/core/canon`
  const data = useData<CanonAtlasResponse>(endpoint)

  const allDomains = data.data?.domains || EMPTY_CANON_DOMAINS
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
  const comingDomains = filteredDomains.filter((d) => !isReady(d))

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

  const pickRandomField = () => {
    if (!readyDomains.length) return
    const random = readyDomains[Math.floor(Math.random() * readyDomains.length)]
    location.hash = canonDomainHref(random).slice(1)
  }

  const clearSearch = () => {
    setLocalSearchQuery('')
    if (integrated) onClearSearch?.()
  }

  const resetFilters = () => {
    clearSearch()
    setFamilyId('all')
  }

  return (
    <section
      id={integrated ? 'books-canon' : undefined}
      class={`learn-workspace folio-learn canon-atlas-workspace${integrated ? ' canon-atlas-integrated canon-room-panel' : ''}`}
      aria-labelledby="canon-title"
    >
      {/* Clean Folio Surface Head */}
      <header
        class={`learn-surface-head folio-surface-head canon-surface-head${integrated ? ' canon-room-header' : ''}`}
      >
        <div class="learn-header-content">
          {integrated && <p class="canon-room-kicker">Evergreen field guides</p>}
          {integrated ? <h2 id="canon-title">Canon fields</h2> : <h1 id="canon-title">Canon</h1>}
          {integrated && (
            <p class="canon-room-description">
              Enter each discipline through three deliberate perspectives: its foundation, representative craft, and
              strongest boundary.
            </p>
          )}
        </div>

        <div class="canon-head-actions">
          <button
            class="button secondary canon-surprise-btn"
            type="button"
            onClick={pickRandomField}
            disabled={!readyDomains.length}
            title="Explore a random discipline"
            aria-label="Surprise me with a ready field"
          >
            <Icon name="spark" size={15} />
            <span>Surprise me with a ready field</span>
          </button>
        </div>
      </header>

      {/* Filter and Search Bar */}
      <div class={`canon-toolbar${integrated ? ' canon-room-toolbar' : ''}`}>
        <div
          class="canon-filter-tabs"
          role="group"
          aria-label={integrated ? 'Filter Canon by family' : 'Filter by knowledge area'}
        >
          <button
            type="button"
            aria-pressed={familyId === 'all'}
            class={`canon-filter-tab${integrated ? ' canon-family-filter' : ''} ${familyId === 'all' ? 'is-active' : ''}`}
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
                class={`canon-filter-tab${integrated ? ' canon-family-filter' : ''} ${familyId === family.id ? 'is-active' : ''}`}
                onClick={() => setFamilyId(family.id)}
              >
                {family.title} <span class="canon-tab-count">{count}</span>
              </button>
            )
          })}
        </div>

        <div class={`canon-search-wrapper${integrated ? ' canon-room-search-wrap' : ''}`}>
          <Icon name="search" size={15} class="canon-search-icon" />
          <input
            class={integrated ? 'canon-room-search' : undefined}
            type="search"
            value={searchQuery}
            onInput={(e) => setLocalSearchQuery((e.currentTarget as HTMLInputElement).value)}
            placeholder="Search disciplines or books…"
            aria-label={integrated ? 'Search Canon fields' : 'Search Canon disciplines'}
          />
          {searchQuery && (
            <button class="canon-search-clear" type="button" onClick={clearSearch} aria-label="Clear search">
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
          <button class="button secondary" type="button" onClick={resetFilters}>
            Reset Filters
          </button>
        </div>
      ) : integrated ? (
        <div class="canon-room-content">
          <CanonRoomSection
            id="ready"
            title="Ready to explore"
            description="Disciplines with a complete, field-tested three-book trio."
            domains={readyDomains}
            families={families}
          />
          {comingDomains.length > 0 && (
            <CanonRoomSection
              id="coming"
              title="Coming next"
              description="Disciplines currently mapping their foundational reading trio."
              domains={comingDomains}
              families={families}
            />
          )}
        </div>
      ) : (
        <>
          <CanonLearnerSection title="Ready to explore" domains={readyDomains} families={families} integrated={false} />
          {comingDomains.length > 0 && (
            <details class="canon-coming-disclosure">
              <summary>
                <span>Coming next · {comingDomains.length} fields under review</span>
              </summary>
              <CanonLearnerSection title="Coming next" domains={comingDomains} families={families} integrated={false} />
            </details>
          )}
        </>
      )}
    </section>
  )
}

function CanonRoomSection({
  id,
  title,
  description,
  domains,
  families,
}: {
  id: 'ready' | 'coming'
  title: string
  description: string
  domains: CanonDomain[]
  families: CanonDomain[]
}) {
  const familyIds = new Set(families.map((family) => family.id))
  const groups: Array<{ id: string; title: string; description: string; domains: CanonDomain[] }> = families
    .map((family) => ({
      id: family.id,
      title: family.title,
      description: family.boundary,
      domains: domains.filter((domain) => domain.parent_id === family.id),
    }))
    .filter((group) => group.domains.length > 0)
  const otherDomains = domains.filter((domain) => !domain.parent_id || !familyIds.has(domain.parent_id))

  if (otherDomains.length > 0) {
    groups.push({
      id: 'other',
      title: 'Other fields',
      description: 'Canon fields awaiting a permanent knowledge-family home.',
      domains: otherDomains,
    })
  }

  return (
    <section class={`canon-room-section canon-room-section-${id}`} aria-labelledby={`canon-room-${id}-title`}>
      <header class="canon-room-section-head">
        <div>
          <h3 id={`canon-room-${id}-title`}>{title}</h3>
          <p>{description}</p>
        </div>
        <span class="canon-room-section-count">
          {domains.length} {domains.length === 1 ? 'field' : 'fields'}
        </span>
      </header>

      {groups.length > 0 ? (
        <div class="canon-room-families">
          {groups.map((group) => (
            <section
              key={`${id}-${group.id}`}
              class="canon-room-family"
              aria-labelledby={`canon-room-${id}-family-${group.id}`}
            >
              <header class="canon-room-family-head">
                <div>
                  <h4 id={`canon-room-${id}-family-${group.id}`}>{group.title}</h4>
                  {group.description && <p>{group.description}</p>}
                </div>
                <span>
                  {group.domains.length} {group.domains.length === 1 ? 'field' : 'fields'}
                </span>
              </header>
              <div class="canon-field-map-grid">
                {group.domains.map((domain) => (
                  <CanonRoomFieldCard key={domain.id} domain={domain} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p class="canon-room-section-empty">No ready fields match this view yet.</p>
      )}
    </section>
  )
}

function CanonRoomFieldCard({ domain }: { domain: CanonDomain }) {
  const ready = isReady(domain)
  const status = stateBadge(domain.curation_status)
  const bookTitles = (domain.entry_titles || []).slice(0, 3)
  const orderedRoles: CanonRole[] = ['foundation', 'representative', 'boundary']

  return (
    <article
      class={`canon-field-map-card ${ready ? 'is-ready' : 'is-coming'}`}
      aria-labelledby={`canon-room-domain-${domain.id}`}
    >
      <header class="canon-field-map-head">
        <div>
          <p class="canon-field-map-kicker">{ready ? 'Ready trio' : 'Coming next'}</p>
          <h5 id={`canon-room-domain-${domain.id}`}>
            {ready ? <a href={canonDomainHref(domain)}>{domain.title}</a> : domain.title}
          </h5>
        </div>
        <span class={`canon-field-map-state ${ready ? 'is-ready' : 'is-coming'}`}>
          {ready ? '3 books curated' : status.label}
        </span>
      </header>

      <p class="canon-field-map-boundary">{domain.boundary}</p>

      {domain.branch_label && (
        <div class="canon-branch-pill canon-field-map-branch">
          <Icon name="branch" size={12} />
          <span>{domain.branch_label}</span>
        </div>
      )}

      <ol class="canon-field-roles" aria-label={`Three-book structure for ${domain.title}`}>
        {orderedRoles.map((role, index) => {
          const meta = roleMeta[role]
          const bookTitle = domain.entry_roles?.[role] || bookTitles[index]
          return (
            <li key={role} class={`canon-field-role ${meta.roleClass} ${bookTitle ? 'has-book' : 'is-open'}`}>
              <span class="canon-field-role-number" aria-hidden="true">
                {meta.number}
              </span>
              <div class="canon-field-role-copy">
                <span class="canon-field-role-label">{meta.label}</span>
                {bookTitle ? (
                  <strong class="canon-field-role-title" title={bookTitle}>
                    {bookTitle}
                  </strong>
                ) : (
                  <span class="canon-field-role-placeholder">
                    {ready ? 'Curated selection' : 'Selection in progress'}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      <footer class="canon-field-map-footer">
        {ready ? (
          <a
            class="button secondary canon-field-map-open"
            href={canonDomainHref(domain)}
            aria-label={`Open ${domain.title} field guide`}
          >
            <span>Open field guide</span>
            <Icon name="chevron" size={14} />
          </a>
        ) : (
          <p>Coming next · the three roles stay visible while curation is in progress.</p>
        )}
      </footer>
    </article>
  )
}

function CanonLearnerSection({
  title,
  domains,
  families,
  integrated,
}: {
  title: string
  domains: CanonDomain[]
  families: CanonDomain[]
  integrated: boolean
}) {
  return (
    <details class="canon-learner-section" open>
      <summary class="canon-learner-section-head">
        <div>
          <h2 id={`canon-${title.toLowerCase().replace(/\s+/g, '-')}`}>{title}</h2>
        </div>
        <span class="canon-family-badge">
          {domains.length} {domains.length === 1 ? 'Field' : 'Fields'}
        </span>
      </summary>
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
                    {domainsInFamily.map((domain) => (
                      <CanonFieldCard key={domain.id} domain={domain} integrated={integrated} />
                    ))}
                  </div>
                </section>
              )
            })}
        </div>
      ) : (
        <p class="canon-learner-empty">No fields in this view yet.</p>
      )}
    </details>
  )
}

function CanonFieldCard({ domain, integrated }: { domain: CanonDomain; integrated: boolean }) {
  const ready = isReady(domain)
  const status = stateBadge(domain.curation_status)
  const bookTitles = domain.entry_titles || []

  if (integrated) {
    const content = (
      <>
        <div class="canon-minimal-field-copy">
          <h4>{domain.title}</h4>
          <span>{domain.branch_label || domain.family_title || 'Unmapped'}</span>
        </div>
        <span class="canon-minimal-field-count">{ready ? '3 books' : status.label}</span>
        {ready && <Icon name="chevron" size={14} />}
      </>
    )
    return (
      <article class={`canon-minimal-field ${ready ? 'is-ready' : 'is-pending'}`}>
        {ready ? (
          <a href={canonDomainHref(domain)} aria-label={`Open ${domain.title} field guide`}>
            {content}
          </a>
        ) : (
          <div>{content}</div>
        )}
      </article>
    )
  }

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
          </div>
        )}
      </div>

      {/* 3-Book Shelf Visualizer */}
      <div class="canon-entry-shelf">
        {bookTitles.length > 0 ? (
          <ol class="canon-shelf-list">
            {bookTitles.map((title, idx) => {
              const roleKey = idx === 0 ? 'foundation' : idx === 1 ? 'representative' : 'boundary'
              const meta = roleMeta[roleKey]
              return (
                <li key={title} class={`canon-shelf-item ${meta.roleClass}`}>
                  <span class={`canon-shelf-num ${meta.roleClass}`}>{meta.number}</span>
                  <div class="canon-shelf-details">
                    <span class="canon-shelf-role">{meta.label}</span>
                    <strong class="canon-shelf-title" title={title}>
                      {title}
                    </strong>
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <div class="canon-shelf-roadmap">
            <div class="canon-roadmap-slot slot-foundation">
              <span class="canon-slot-num">01</span>
              <span>Foundation</span>
            </div>
            <div class="canon-roadmap-slot slot-representative">
              <span class="canon-slot-num">02</span>
              <span>Representative</span>
            </div>
            <div class="canon-roadmap-slot slot-boundary">
              <span class="canon-slot-num">03</span>
              <span>Boundary</span>
            </div>
          </div>
        )}
      </div>

      {ready && (
        <div class="canon-card-action-bar">
          <a
            class="button secondary canon-view-btn"
            aria-label={`Explore Canon field ${domain.title}`}
            href={canonDomainHref(domain)}
          >
            <span>Open field guide</span>
            <Icon name="chevron" size={14} />
          </a>
        </div>
      )}
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
          <a class="button secondary" href="#/library">
            Return to Books
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
        { method: 'POST' },
      )
      setNotice({
        kind: 'success',
        message:
          result.state === 'captured'
            ? `"${entry.title}" was added to My books under ${domain.branch_label || 'this branch'}.`
            : `"${entry.title}" is already in My books.`,
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
      const result = await api<{ id: string }>(`/learning/core/canon/domains/${encodeURIComponent(domain.id)}/thread`, {
        method: 'POST',
      })
      location.hash = `#/learn/thread/${encodeURIComponent(result.id)}`
    } catch (error: any) {
      setNotice({
        kind: 'error',
        message: error?.message || 'Could not create a Learning Thread from this discipline.',
      })
      setWorking('')
    }
  }

  return (
    <section
      class="learn-workspace folio-learn canon-detail-workspace canon-domain-detail"
      aria-labelledby="canon-domain-title"
    >
      {/* Breadcrumb Navigation */}
      <nav class="canon-breadcrumb" aria-label="Breadcrumb">
        <a class="canon-back-link" href="#/library">
          <Icon name="back" size={15} />
          <span>Books</span>
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
        <div
          class={`canon-notice-banner ${notice.kind === 'error' ? 'is-error' : ''}`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          <Icon name={notice.kind === 'error' ? 'warning' : 'check'} size={15} />
          <span>{notice.message}</span>
        </div>
      )}

      {!ready && (
        <div class="canon-pending-panel">
          <p class="folio-object-kicker">Coming next</p>
          <h2>Field curation in progress</h2>
          <p>
            This field is being prepared. Its three-book path will appear after Foundation, Representative, and Boundary
            are each approved.
          </p>
        </div>
      )}

      {/* The 3-Book Path */}
      <div class="canon-path-section">
        <div class="folio-section-head">
          <div>
            <p class="folio-object-kicker">Curated Reading Path</p>
            <h2>The Three-Book Path</h2>
          </div>
          <span class="folio-measure">{orderedEntries.length} of 3 books curated</span>
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
                      <h3 class="canon-book-heading">
                        {entry.recommendation_id ? (
                          <a
                            class="item-title-link"
                            href={`#/library/book/${encodeURIComponent(entry.recommendation_id)}`}
                          >
                            {entry.title}
                          </a>
                        ) : (
                          entry.title
                        )}
                      </h3>
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
                        href={`#/library/book/${encodeURIComponent(entry.recommendation_id)}`}
                      >
                        <Icon name="library" size={15} />
                        <span>Open book dossier</span>
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
                        aria-label={`Open external book page for ${entry.title} (opens in a new tab)`}
                      >
                        <Icon name="external" size={13} />
                        <span>Book Page</span>
                      </a>
                    )}
                  </div>

                  {/* Accordion Notes */}
                  <details class="canon-row-deepdive">
                    <summary aria-label={`Show rationale, limitations, and alternatives for ${entry.title}`}>
                      <Icon name="chevron" size={13} />
                      <span>Rationale, limits & alternatives</span>
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
                  <tr key={entry.id} class={`matrix-row-${entry.role}`}>
                    <th scope="row">
                      <span class={`canon-matrix-pill role-${entry.role}`}>
                        {roleMeta[entry.role].number} {roleMeta[entry.role].label}
                      </span>
                    </th>
                    <td>
                      <strong class="canon-matrix-title">{entry.title}</strong>
                      <div class="canon-matrix-author">by {entry.author}</div>
                    </td>
                    <td class="canon-matrix-best">{entry.beginner_case}</td>
                    <td>
                      <span class="canon-pill difficulty-pill">{entry.difficulty}</span>
                    </td>
                    <td class="canon-matrix-limit">{entry.limitations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Thread Creation CTA */}
      {ready && (
        <div class="canon-bottom-cta">
          <div>
            <h3>Ready to study {domain.title}?</h3>
            <p>
              {capturedCount
                ? `${capturedCount} of 3 books are saved to your Library. Launch a structured Learning Thread to track your reading and synthesis.`
                : 'Add at least one selection to My books before creating a structured Learning Thread.'}
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
        </div>
      )}
    </section>
  )
}
