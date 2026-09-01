import { useEffect, useState } from 'preact/hooks'
import { api } from '../../api'
import { uploadArtifact } from '../../app/upload'
import { Icon } from '../../components/Icon'
import { artifactHref, cardHref, lessonHref, lessonReadiness, noteHref, statusLabel } from './helpers'
import { domId, materialExcerpt, threadMaterialTotals, threadTabHref } from './threadViewModel'
import type { NoteRecord, PathArtifact, PathResponse, PathStage, RecallCard, RecallDraft } from './types'

export function LevelMaterials({
  stage,
  onChanged,
  lessonTools = false,
}: {
  stage: PathStage
  onChanged: () => void
  lessonTools?: boolean
}) {
  const total = stage.notes.length + stage.files.length + stage.cards.length + stage.recall_drafts.length
  return (
    <details class={`course-level-materials ${lessonTools ? 'is-lesson-tools' : ''}`}>
      <summary>
        <span>
          <span class="folio-object-kicker">{lessonTools ? 'Learning tools' : 'Level workspace'}</span>
          <strong>{lessonTools ? 'Capture while you study' : 'Notes, files, and recall'}</strong>
        </span>
        <small>{total} saved</small>
      </summary>
      <ScopedMaterials
        compact
        scope={{ kind: 'level', id: stage.id, title: stage.title }}
        notes={stage.notes}
        files={stage.files}
        cards={stage.cards}
        drafts={stage.recall_drafts}
        onChanged={onChanged}
      />
    </details>
  )
}

export function LevelList({
  threadId,
  stages,
  activeStage,
}: {
  threadId: string
  stages: PathStage[]
  activeStage?: PathStage
}) {
  return (
    <details class="course-level-list">
      <summary class="course-level-list-heading">
        <span class="folio-object-kicker">Curriculum Spine</span>
        <span>{stages.length} levels</span>
      </summary>
      <div class="course-level-list-grid">
        {stages.map((stage) => (
          <a
            href={threadTabHref(threadId, 'curriculum', stage.id)}
            class={`course-level-card status-${stage.status} ${stage.id === activeStage?.id ? 'is-current' : ''}`}
            aria-current={stage.id === activeStage?.id ? 'page' : undefined}
            key={stage.id}
            aria-label={`${stage.status === 'locked' ? 'Preview locked' : 'Open'} Level ${stage.position}: ${stage.title}`}
          >
            <span class="course-level-number">{String(stage.position).padStart(2, '0')}</span>
            <span>
              <strong>{stage.title.replace(/^Level \d+\s*[—-]\s*/, '')}</strong>
              <small>
                {stage.lessons.filter((lesson) => lesson.status === 'completed').length}/{stage.lessons.length} complete
                · {stage.lessons.filter((lesson) => lessonReadiness(lesson) !== 'needs_material').length} ready
              </small>
              <small class="course-level-readiness">
                {stage.lessons.filter((lesson) => lessonReadiness(lesson) === 'needs_material').length
                  ? `${stage.lessons.filter((lesson) => lessonReadiness(lesson) === 'needs_material').length} need material`
                  : statusLabel(stage.status)}
              </small>
            </span>
            <span class="course-level-mark" aria-hidden="true">
              {stage.status === 'completed' ? (
                <Icon name="check" size={14} />
              ) : stage.id === activeStage?.id ? (
                '●'
              ) : (
                '○'
              )}
            </span>
          </a>
        ))}
      </div>
    </details>
  )
}

type MaterialScope = { kind: 'thread' | 'level' | 'lesson'; id: string; title: string }

export function ThreadMaterialLedger({
  path,
  onChanged,
  open = false,
}: {
  path: PathResponse
  onChanged: () => void
  open?: boolean
}) {
  if (open) return <ThreadMaterialsJourney path={path} onChanged={onChanged} />

  const levelMaterials = path.stages.filter(
    (stage) => stage.notes.length || stage.files.length || stage.cards.length || stage.recall_drafts.length,
  )
  const lessonMaterials = path.stages
    .flatMap((stage) => stage.lessons.map((lesson) => ({ stage, lesson })))
    .filter(
      ({ lesson }) =>
        (lesson.notes?.length || 0) +
          (lesson.files?.length || 0) +
          (lesson.cards?.length || 0) +
          (lesson.recall_drafts?.length || 0) >
        0,
    )

  return (
    <details class="learning-material-ledger" open={open}>
      <summary>
        <span>
          <span class="folio-object-kicker">Thread Knowledge Hub</span>
          <strong>Notes, Files, and Recall</strong>
        </span>
        <small>
          {path.notes.length + path.files.length + path.cards.length + path.recall_drafts.length} Direct Thread ·{' '}
          {levelMaterials.length} Levels · {lessonMaterials.length} Lessons
        </small>
      </summary>
      <div class="learning-material-ledger-body">
        <ScopedMaterials
          compact
          scope={{ kind: 'thread', id: path.thread.id, title: path.thread.title }}
          notes={path.notes}
          files={path.files}
          cards={path.cards}
          drafts={path.recall_drafts}
          onChanged={onChanged}
        />
        {levelMaterials.length > 0 && (
          <section class="learning-owned-index" aria-label="Materials owned by Levels">
            <div class="learning-material-heading">
              <div>
                <span class="folio-object-kicker">All Levels</span>
                <h3>Thread material index</h3>
              </div>
              <small>Artifacts scoped to each Level.</small>
            </div>
            {levelMaterials.map((stage) => (
              <div class="learning-owned-level" key={stage.id}>
                <a href={threadTabHref(path.thread.id, 'curriculum', stage.id)}>
                  <strong>{stage.title}</strong>
                </a>
                <span>
                  {stage.notes.length} notes · {stage.files.length} files · {stage.cards.length} cards ·{' '}
                  {stage.recall_drafts.length} drafts
                </span>
              </div>
            ))}
          </section>
        )}
        {lessonMaterials.length > 0 && (
          <section class="learning-owned-index" aria-label="Materials owned by Lessons">
            <div class="learning-material-heading">
              <div>
                <span class="folio-object-kicker">All Lessons</span>
                <h3>Lesson Capture Index</h3>
              </div>
              <small>Capture scoped to specific Lessons.</small>
            </div>
            {lessonMaterials.map(({ stage, lesson }) => (
              <div class="learning-owned-level" key={lesson.id}>
                <a href={lessonHref(path.thread.id, lesson.id)}>
                  <strong>{lesson.title}</strong>
                </a>
                <span>
                  Level {stage.position} · {lesson.notes?.length || 0} notes · {lesson.files?.length || 0} files ·{' '}
                  {lesson.cards?.length || 0} cards
                </span>
              </div>
            ))}
          </section>
        )}
      </div>
    </details>
  )
}

type ThreadMaterialKind = 'note' | 'file' | 'recall'

interface ThreadMaterialOwner {
  key: string
  marker: string
  scope: MaterialScope
  subtitle: string
  notes: NoteRecord[]
  files: PathArtifact[]
  cards: RecallCard[]
  drafts: RecallDraft[]
}

interface ThreadMaterialIndexItem {
  id: string
  kind: ThreadMaterialKind
  title: string
  detail: string
  status: string
  href?: string
  rtl?: boolean
  owner: ThreadMaterialOwner
}

function ThreadMaterialsJourney({ path, onChanged }: { path: PathResponse; onChanged: () => void }) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | ThreadMaterialKind>('all')
  const [ownerFilter, setOwnerFilter] = useState<'all' | MaterialScope['kind']>('all')
  const [expandedOwnerKey, setExpandedOwnerKey] = useState('')
  const [visibleOwnerCount, setVisibleOwnerCount] = useState(24)
  const [ownerItemLimit, setOwnerItemLimit] = useState(24)

  const owners: ThreadMaterialOwner[] = [
    {
      key: `thread:${path.thread.id}`,
      marker: 'T',
      scope: { kind: 'thread', id: path.thread.id, title: path.thread.title },
      subtitle: 'Direct Thread material',
      notes: path.notes,
      files: path.files,
      cards: path.cards,
      drafts: path.recall_drafts,
    },
    ...path.stages
      .filter((stage) => stage.notes.length + stage.files.length + stage.cards.length + stage.recall_drafts.length > 0)
      .map((stage) => ({
        key: `level:${stage.id}`,
        marker: String(stage.position),
        scope: { kind: 'level' as const, id: stage.id, title: stage.title },
        subtitle: `Level ${stage.position} owner`,
        notes: stage.notes,
        files: stage.files,
        cards: stage.cards,
        drafts: stage.recall_drafts,
      })),
    ...path.stages.flatMap((stage) =>
      stage.lessons
        .filter(
          (lesson) =>
            (lesson.notes?.length || 0) +
              (lesson.files?.length || 0) +
              (lesson.cards?.length || 0) +
              (lesson.recall_drafts?.length || 0) >
            0,
        )
        .map((lesson, lessonIndex) => ({
          key: `lesson:${lesson.id}`,
          marker: `${stage.position}.${lessonIndex + 1}`,
          scope: { kind: 'lesson' as const, id: lesson.id, title: lesson.title },
          subtitle: `Level ${stage.position} · Lesson owner`,
          notes: lesson.notes || [],
          files: lesson.files || [],
          cards: lesson.cards || [],
          drafts: lesson.recall_drafts || [],
        })),
    ),
  ]

  const items: ThreadMaterialIndexItem[] = owners.flatMap((owner) => [
    ...owner.notes.map((note) => ({
      id: note.id,
      kind: 'note' as const,
      title: note.title,
      detail: materialExcerpt(note.abstract || note.sections?.[0]?.content, 'Study note'),
      status: note.status || 'active',
      href: noteHref(note.id),
      owner,
    })),
    ...owner.files.map((file) => ({
      id: file.id,
      kind: 'file' as const,
      title: file.filename,
      detail: file.media_type || 'Stored file',
      status: 'stored',
      href: artifactHref(file.id),
      owner,
    })),
    ...owner.cards.map((card) => ({
      id: card.id,
      kind: 'recall' as const,
      title: card.question,
      detail: `Approved card · due ${card.due_at || 'now'}`,
      status: 'approved',
      href: cardHref(card.id),
      rtl: true,
      owner,
    })),
    ...owner.drafts.map((draft) => ({
      id: draft.id,
      kind: 'recall' as const,
      title: draft.question,
      detail: `${draft.status === 'rejected' ? 'Rejected' : draft.status === 'approved' ? 'Approved' : 'Draft'} recall item${
        draft.source_title ? ` · ${draft.source_title}` : ''
      }`,
      status: draft.status,
      rtl: true,
      owner,
    })),
  ])
  const normalizedQuery = query.trim().toLowerCase()
  const filteredItems = items.filter((item) => {
    const queryMatch =
      !normalizedQuery ||
      `${item.title} ${item.detail} ${item.owner.scope.title} ${item.owner.subtitle}`
        .toLowerCase()
        .includes(normalizedQuery)
    const typeMatch = typeFilter === 'all' || item.kind === typeFilter
    const ownerMatch = ownerFilter === 'all' || item.owner.scope.kind === ownerFilter
    return queryMatch && typeMatch && ownerMatch
  })
  const filteredOwners = owners
    .map((owner) => ({
      owner,
      items: filteredItems.filter((item) => item.owner.key === owner.key),
    }))
    .filter((group) => group.items.length > 0)
  const filteredOwnerKeys = filteredOwners.map(({ owner }) => owner.key).join('\n')
  const firstFilteredOwnerKey = filteredOwners[0]?.owner.key || ''

  useEffect(() => {
    setExpandedOwnerKey((current) =>
      filteredOwnerKeys.split('\n').includes(current) ? current : firstFilteredOwnerKey,
    )
  }, [filteredOwnerKeys, firstFilteredOwnerKey, path.thread.id])

  useEffect(() => {
    setVisibleOwnerCount(24)
    setOwnerItemLimit(24)
  }, [path.thread.id, query, typeFilter, ownerFilter])

  const totals = threadMaterialTotals(path)
  const totalRecall = totals.cards + totals.drafts
  const materialOwnerCount = new Set(items.map((item) => item.owner.key)).size
  const visibleFilteredOwners = filteredOwners.slice(0, visibleOwnerCount)

  return (
    <section class="vertical-materials">
      <header class="vertical-view-head">
        <div>
          <h2>Materials journey</h2>
          <p>One owner-aware index follows saved material from the Thread to exact Levels and Lessons.</p>
        </div>
        <span>
          {items.length} items across {materialOwnerCount} owners
        </span>
      </header>

      <div class="vertical-materials-summary" aria-label="Material counts across every owner scope">
        <div>
          <strong>{totals.notes}</strong>
          <span>Notes</span>
        </div>
        <div>
          <strong>{totals.files}</strong>
          <span>Files</span>
        </div>
        <div>
          <strong>{totals.cards}</strong>
          <span>Approved cards</span>
        </div>
        <div>
          <strong>{totals.drafts}</strong>
          <span>Recall drafts</span>
        </div>
      </div>

      <div class="vertical-materials-controls">
        <label>
          <span>Search title, source, or owner</span>
          <span class="vertical-materials-search-field">
            <Icon name="search" size={15} />
            <input
              type="search"
              value={query}
              onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
              placeholder="Search all material"
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear material search">
                <Icon name="close" size={13} />
              </button>
            ) : null}
          </span>
        </label>

        <div>
          <span>Type</span>
          <div class="vertical-materials-filters" role="group" aria-label="Material type">
            {[
              { key: 'all', label: `All ${items.length}` },
              { key: 'note', label: `Notes ${totals.notes}` },
              { key: 'file', label: `Files ${totals.files}` },
              { key: 'recall', label: `Recall ${totalRecall}` },
            ].map((item) => (
              <button
                type="button"
                class={typeFilter === item.key ? 'is-active' : ''}
                aria-pressed={typeFilter === item.key}
                onClick={() => setTypeFilter(item.key as typeof typeFilter)}
                key={item.key}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span>Owner</span>
          <div class="vertical-materials-filters" role="group" aria-label="Material owner">
            {[
              { key: 'all', label: 'All owners' },
              { key: 'thread', label: 'Thread' },
              { key: 'level', label: 'Level' },
              { key: 'lesson', label: 'Lesson' },
            ].map((item) => (
              <button
                type="button"
                class={ownerFilter === item.key ? 'is-active' : ''}
                aria-pressed={ownerFilter === item.key}
                onClick={() => setOwnerFilter(item.key as typeof ownerFilter)}
                key={item.key}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p class="visually-hidden" aria-live="polite">
        {filteredItems.length} matching items across {filteredOwners.length} owners.
      </p>

      {filteredOwners.length ? (
        <>
          <ol class="vertical-material-owner-journey">
            {visibleFilteredOwners.map(({ owner, items: ownerItems }) => {
              const expanded = owner.key === expandedOwnerKey
              const panelId = domId('material-owner-panel', owner.key)
              return (
                <li class={expanded ? 'is-expanded' : ''} key={owner.key}>
                  <span class="vertical-material-owner-marker" aria-hidden="true">
                    {owner.marker}
                  </span>
                  <section class="vertical-material-owner" aria-label={`${owner.scope.kind}: ${owner.scope.title}`}>
                    <button
                      class="vertical-material-owner-trigger"
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() => {
                        setExpandedOwnerKey(owner.key)
                        setOwnerItemLimit(24)
                      }}
                    >
                      <span>
                        <strong>{owner.scope.title}</strong>
                        <small>{owner.subtitle}</small>
                      </span>
                      <span class="learning-owner-pill">
                        {ownerItems.length} owned by {owner.scope.kind}
                      </span>
                      <Icon name="chevron" size={14} />
                    </button>
                    {expanded ? (
                      <div class="vertical-material-owner-panel" id={panelId}>
                        <div class="vertical-material-owner-items">
                          {ownerItems.slice(0, ownerItemLimit).map((item) => {
                            const content = (
                              <>
                                <Icon
                                  name={item.kind === 'note' ? 'note' : item.kind === 'file' ? 'file' : 'spark'}
                                  size={14}
                                />
                                <span>
                                  <strong lang={item.rtl ? 'ar' : undefined} dir={item.rtl ? 'rtl' : undefined}>
                                    {item.title}
                                  </strong>
                                  <small>{item.detail}</small>
                                </span>
                                <span class={`folio-status-tag status-${item.status}`}>{statusLabel(item.status)}</span>
                              </>
                            )
                            return item.href ? (
                              <a
                                class="vertical-material-item"
                                href={item.href}
                                target={item.kind === 'file' ? '_blank' : undefined}
                                rel={item.kind === 'file' ? 'noreferrer' : undefined}
                                key={item.id}
                              >
                                {content}
                              </a>
                            ) : (
                              <div class="vertical-material-item is-draft" key={item.id}>
                                {content}
                              </div>
                            )
                          })}
                        </div>
                        {ownerItemLimit < ownerItems.length ? (
                          <button
                            class="vertical-journey-more"
                            type="button"
                            onClick={() => setOwnerItemLimit((count) => count + 24)}
                          >
                            Show 24 more items
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                </li>
              )
            })}
          </ol>
          {visibleOwnerCount < filteredOwners.length ? (
            <button
              class="vertical-journey-more"
              type="button"
              onClick={() => setVisibleOwnerCount((count) => count + 24)}
            >
              Show 24 more owners
            </button>
          ) : null}
        </>
      ) : (
        <p class="vertical-thread-empty">
          No materials match this search, type, and owner combination. Clear one filter to recover the index.
        </p>
      )}

      <details class="vertical-materials-create">
        <summary>
          <span>
            <strong>Manage direct Thread material</strong>
            <small>Browse existing Thread-owned items and add an explicit note, file, or learner-authored card.</small>
          </span>
          <Icon name="chevron" size={14} />
        </summary>
        <ScopedMaterials
          compact
          scope={{ kind: 'thread', id: path.thread.id, title: path.thread.title }}
          notes={path.notes}
          files={path.files}
          cards={path.cards}
          drafts={path.recall_drafts}
          onChanged={onChanged}
        />
      </details>
    </section>
  )
}

export function ScopedMaterials({
  scope,
  notes,
  files,
  cards,
  drafts,
  onChanged,
  compact = false,
}: {
  scope: MaterialScope
  notes: NoteRecord[]
  files: PathArtifact[]
  cards: RecallCard[]
  drafts: RecallDraft[]
  onChanged: () => void
  compact?: boolean
}) {
  const [saving, setSaving] = useState<'note' | 'file' | 'card' | null>(null)
  const [error, setError] = useState('')
  const scopeBody =
    scope.kind === 'lesson'
      ? { lesson_id: scope.id }
      : scope.kind === 'level'
        ? { stage_id: scope.id }
        : { thread_id: scope.id }

  const createNote = async (event: Event) => {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const values = new FormData(form)
    const title = String(values.get('title') || '').trim()
    const content = String(values.get('content') || '').trim()
    if (!title || !content) return
    setSaving('note')
    setError('')
    try {
      await api('/notes', {
        method: 'POST',
        body: JSON.stringify({
          ...scopeBody,
          title,
          status: 'active',
          sections: [{ section_key: 'body', label: 'Notes', content, direction: 'auto' }],
        }),
      })
      form.reset()
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Note creation failed.')
    } finally {
      setSaving(null)
    }
  }

  const uploadFile = async (event: Event) => {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const input = form.elements.namedItem('file') as HTMLInputElement | null
    const file = input?.files?.[0]
    if (!file) return
    setSaving('file')
    setError('')
    try {
      await uploadArtifact(file, { ...scopeBody, scope: scope.kind, scope_title: scope.title })
      form.reset()
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'File upload failed.')
    } finally {
      setSaving(null)
    }
  }

  const createCard = async (event: Event) => {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const values = new FormData(form)
    const question = String(values.get('question') || '').trim()
    const answer = String(values.get('answer') || '').trim()
    if (!question || !answer) return
    setSaving('card')
    setError('')
    try {
      await api('/learning/srs/create', {
        method: 'POST',
        body: JSON.stringify({ ...scopeBody, question, answer, topic: scope.title }),
      })
      form.reset()
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Recall card creation failed.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <section class={`learning-scope-workspace ${compact ? 'is-compact' : ''}`} aria-label={`${scope.title} materials`}>
      <div class="learning-material-heading">
        <div>
          <span class="folio-object-kicker">
            {scope.kind === 'lesson'
              ? 'Lesson workspace'
              : scope.kind === 'level'
                ? 'Level workspace'
                : 'Direct Thread material'}
          </span>
          <h3>{scope.title}</h3>
        </div>
        <span class="learning-owner-pill">
          Owned by {scope.kind === 'lesson' ? 'Lesson' : scope.kind === 'level' ? 'Level' : 'Thread'}
        </span>
      </div>
      <div class="learning-material-columns">
        <MaterialColumn title="Notes" count={notes.length} empty="No notes in this scope yet.">
          {notes.map((note) => (
            <a class="learning-material-row" href={noteHref(note.id)} key={note.id}>
              <Icon name="note" size={14} />
              <span>
                <strong>{note.title}</strong>
                <small>{note.sections?.[0]?.content || 'Open note'}</small>
              </span>
            </a>
          ))}
          <details class="learning-add-material">
            <summary>Add note</summary>
            <form onSubmit={createNote}>
              <input name="title" aria-label="Note title" placeholder="Note title" required />
              <textarea
                name="content"
                aria-label="Note body"
                placeholder="What should this scope remember?"
                rows={3}
                required
              />
              <button class="button secondary" disabled={saving !== null}>
                {saving === 'note' ? 'Saving…' : 'Save note'}
              </button>
            </form>
          </details>
        </MaterialColumn>

        <MaterialColumn title="Files" count={files.length} empty="No files in this scope yet.">
          {files.map((file) => (
            <a
              class="learning-material-row"
              href={artifactHref(file.id)}
              target="_blank"
              rel="noreferrer"
              key={file.id}
            >
              <Icon name="file" size={14} />
              <span>
                <strong>{file.filename}</strong>
                <small>{file.media_type || 'Stored file'}</small>
              </span>
            </a>
          ))}
          <details class="learning-add-material">
            <summary>Add file</summary>
            <form onSubmit={uploadFile}>
              <input type="file" name="file" aria-label="Choose file" required />
              <button class="button secondary" disabled={saving !== null}>
                {saving === 'file' ? 'Uploading…' : 'Upload file'}
              </button>
            </form>
          </details>
        </MaterialColumn>

        <MaterialColumn
          title="Recall Cards"
          count={cards.length + drafts.length}
          empty="No recall cards in this scope yet."
        >
          {cards.map((card) => (
            <a class="learning-material-row" href={cardHref(card.id)} key={card.id}>
              <Icon name="spark" size={14} />
              <span>
                <strong lang="ar" dir="rtl">
                  {card.question}
                </strong>
                <small>Approved card · due {card.due_at || 'now'}</small>
              </span>
            </a>
          ))}
          {drafts.map((draft) => (
            <div class="learning-material-row is-draft" key={draft.id}>
              <Icon name="clock" size={14} />
              <span>
                <strong lang="ar" dir="rtl">
                  {draft.question}
                </strong>
                <small>Draft · approve in Recall</small>
              </span>
            </div>
          ))}
          <details class="learning-add-material">
            <summary>Add card</summary>
            <form onSubmit={createCard}>
              <input
                name="question"
                lang="ar"
                dir="rtl"
                aria-label="Recall question in Arabic"
                placeholder="السؤال بالعربية"
                required
              />
              <textarea
                name="answer"
                lang="ar"
                dir="rtl"
                aria-label="Recall answer in Arabic"
                placeholder="الإجابة بالعربية"
                rows={2}
                required
              />
              <button class="button secondary" disabled={saving !== null}>
                {saving === 'card' ? 'Saving…' : 'Create card'}
              </button>
            </form>
          </details>
        </MaterialColumn>
      </div>
      {error && (
        <p class="learning-material-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function MaterialColumn({
  title,
  count,
  empty,
  children,
}: {
  title: string
  count: number
  empty: string
  children: any
}) {
  return (
    <section class="learning-material-column">
      <header>
        <h4>{title}</h4>
        <span>{count}</span>
      </header>
      {count === 0 && <p class="folio-empty-line">{empty}</p>}
      {children}
    </section>
  )
}
