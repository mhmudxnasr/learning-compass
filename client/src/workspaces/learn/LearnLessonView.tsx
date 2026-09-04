import { useState } from 'preact/hooks'
import { api } from '../../api'
import { routeHref } from '../../app/router'
import { Icon } from '../../components/Icon'
import { SourceHealthControl } from '../../components/SourceHealthControl'
import { cleanTitle, lessonHref, lessonReadiness, roleLabel } from './helpers'
import { buildSourceMaterialLauncher, type SourceMaterialKind } from './sourceMaterials'
import { threadTabHref } from './threadViewModel'
import type { PathSource, PathStage, ThreadLesson } from './types'
import { ScopedMaterials } from './LearnThreadMaterials'
import { FindLessonMaterial } from './FindLessonMaterial'
import { verifiedCompanionHref } from './threadOfflinePacks'

export function LessonView({
  lesson,
  stage,
  threadId,
  threadTitle,
  followingLesson,
  onChanged,
}: {
  lesson: ThreadLesson
  stage: PathStage
  threadId: string
  threadTitle: string
  followingLesson: ThreadLesson | null
  onChanged: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isCompleted = lesson.status === 'completed'
  const readiness = lessonReadiness(lesson)
  const canStudy = ['available', 'in_progress'].includes(stage.status)
  const canComplete = isCompleted || (readiness !== 'needs_material' && canStudy)
  const displayState = stage.status === 'locked' ? 'locked' : readiness
  const canRequestMaterial =
    ['available', 'in_progress'].includes(stage.status) &&
    lesson.status !== 'completed' &&
    !String(lesson.content || '').trim() &&
    !lesson.sources?.length

  const currentIndex = stage.lessons.findIndex((l) => l.id === lesson.id)
  const prevLesson = currentIndex > 0 ? stage.lessons[currentIndex - 1] : null
  const nextLesson =
    currentIndex >= 0 && currentIndex < stage.lessons.length - 1 ? stage.lessons[currentIndex + 1] : null

  const toggleComplete = async () => {
    setSaving(true)
    setError('')
    try {
      const nextStatus = isCompleted ? 'in_progress' : 'completed'
      await api(`/learning/core/threads/${encodeURIComponent(threadId)}/lessons/${encodeURIComponent(lesson.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      })
      onChanged()
      if (nextStatus === 'completed' && followingLesson) {
        location.hash = lessonHref(threadId, followingLesson.id).slice(1)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Lesson update failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <article class="course-lesson-page">
      <header class="course-lesson-header">
        <nav class="course-stage-context" aria-label="Breadcrumb">
          <a href={routeHref('learn', 'paths')}>Threads</a>
          <span aria-hidden="true">/</span>
          <a href={threadTabHref(threadId, 'overview')}>{threadTitle}</a>
          <span aria-hidden="true">/</span>
          <a href={threadTabHref(threadId, 'curriculum', stage.id)}>Level {stage.position}</a>
        </nav>
        <div class="course-lesson-meta-bar">
          <div class="course-lesson-position">
            <span>
              Lesson {currentIndex + 1} of {stage.lessons.length}
            </span>
            {lesson.estimated_minutes && (
              <span class="lesson-duration-pill">
                <Icon name="clock" size={12} />
                <span>{lesson.estimated_minutes} min</span>
              </span>
            )}
          </div>
          <span class={`course-lesson-status-pill state-${displayState}`}>
            <Icon
              name={
                displayState === 'locked'
                  ? 'lock'
                  : isCompleted
                    ? 'check'
                    : displayState === 'needs_material'
                      ? 'source'
                      : 'clock'
              }
              size={12}
            />
            <span>
              {displayState === 'locked'
                ? 'Locked'
                : isCompleted
                  ? 'Completed'
                  : displayState === 'needs_material'
                    ? 'Needs material'
                    : displayState === 'in_progress'
                      ? 'In progress'
                      : 'Ready to study'}
            </span>
          </span>
        </div>
        <h1 dir="auto">{cleanTitle(lesson.title)}</h1>
        {(lesson.objective || lesson.description) && <p dir="auto">{lesson.objective || lesson.description}</p>}
      </header>

      {(prevLesson || nextLesson || canComplete) && (
        <div class="course-lesson-action-bar" aria-label="Lesson actions">
          <div class="course-lesson-nav">
            {prevLesson && (
              <a
                class="button secondary"
                href={lessonHref(threadId, prevLesson.id)}
                aria-label={`Previous lesson: ${prevLesson.title}`}
              >
                <Icon name="back" size={14} />
                <span>
                  <small>Previous</small>
                  <strong dir="auto">{cleanTitle(prevLesson.title)}</strong>
                </span>
              </a>
            )}
            {nextLesson && (
              <a
                class="button secondary"
                href={lessonHref(threadId, nextLesson.id)}
                aria-label={`Next lesson: ${nextLesson.title}`}
              >
                <span>
                  <small>Next</small>
                  <strong dir="auto">{cleanTitle(nextLesson.title)}</strong>
                </span>
                <Icon name="chevron" size={14} />
              </a>
            )}
          </div>
          {canComplete && (
            <div class="course-lesson-actions">
              <button
                class={`button ${isCompleted ? 'secondary course-lesson-completed-btn' : 'primary folio-primary'}`}
                type="button"
                onClick={toggleComplete}
                disabled={saving}
              >
                <Icon name="check" size={15} />
                <span>{saving ? 'Updating…' : isCompleted ? 'Completed · Reopen lesson' : 'Mark lesson complete'}</span>
              </button>
              {error && (
                <p class="learning-material-error" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {canRequestMaterial ? (
        <>
          <a
            class="button secondary"
            href={`${threadTabHref(threadId, 'materials')}&lesson=${encodeURIComponent(lesson.id)}`}
          >
            Choose saved material
            <Icon name="library" size={16} />
          </a>
          <FindLessonMaterial threadId={threadId} lesson={lesson} onChanged={onChanged} />
        </>
      ) : null}

      {lesson.sources?.length ? <SourceSection sources={lesson.sources} /> : null}

      {lesson.content?.trim() && (
        <section class="lesson-authored-text" aria-label="Lesson text">
          <span class="desk-eyebrow">Study text</span>
          <div>
            {lesson.content.split(/\n\s*\n/).map((paragraph, index) => (
              <p key={index} dir="auto">
                {paragraph}
              </p>
            ))}
          </div>
        </section>
      )}

      {isCompleted && !followingLesson && (
        <section class="lesson-finish-note">
          <Icon name="check" size={20} />
          <div>
            <h2>You have reached the end of this curriculum.</h2>
            <p>Return to the Thread to revisit your notes and save a closing reflection.</p>
            <a class="button secondary" href={threadTabHref(threadId, 'overview')}>
              Return to Thread
            </a>
          </div>
        </section>
      )}

      <details class="course-level-materials is-lesson-tools">
        <summary>
          <span>
            <strong>Notes, files & recall</strong>
          </span>
          <small>
            {(lesson.notes?.length || 0) +
              (lesson.files?.length || 0) +
              (lesson.cards?.length || 0) +
              (lesson.recall_drafts?.length || 0)}{' '}
            saved
          </small>
        </summary>
        <ScopedMaterials
          compact
          scope={{ kind: 'lesson', id: lesson.id, title: lesson.title }}
          notes={lesson.notes || []}
          files={lesson.files || []}
          cards={lesson.cards || []}
          drafts={lesson.recall_drafts || []}
          onChanged={onChanged}
        />
      </details>
    </article>
  )
}

export function SourceSection({ sources, title = 'Study materials' }: { sources: PathSource[]; title?: string }) {
  const preferredIndex = sources.findIndex((source) => source.role === 'primary')
  const startIndex = preferredIndex >= 0 ? preferredIndex : 0
  const startSource = sources[startIndex]
  const remainingSources = sources.filter((_, index) => index !== startIndex)

  return (
    <section class="course-sources" aria-labelledby="course-sources-title">
      <div class="folio-section-head">
        <div>
          <h3 id="course-sources-title">{title}</h3>
        </div>
      </div>
      {startSource ? (
        <>
          <div class="lesson-source-start">
            <ul class="course-sources-list is-primary">
              <SourceCard source={startSource} />
            </ul>
          </div>
          {remainingSources.length > 0 && (
            <details class="lesson-more-sources">
              <summary>
                <span>
                  <strong>More materials</strong>
                </span>
                <span>{remainingSources.length}</span>
              </summary>
              <ul class="course-sources-list">
                {remainingSources.map((source) => (
                  <SourceCard key={source.recommendation_id} source={source} />
                ))}
              </ul>
            </details>
          )}
        </>
      ) : (
        <p class="folio-empty-line">Hermes has not curated material for this lesson yet.</p>
      )}
    </section>
  )
}

function SourceCard({ source }: { source: PathSource }) {
  return (
    <li class="course-source-card">
      <div class="course-source-header">
        <div class="course-source-tags">
          <span class="course-source-role-tag">{roleLabel(source.role)}</span>
          {source.branch_id && (
            <a class="folio-badge folio-badge-branch" href={`#/map/branch/${encodeURIComponent(source.branch_id)}`}>
              <span class="badge-format">Branch</span>
              <span>{source.branch_label || source.branch_id}</span>
            </a>
          )}
        </div>
        <strong class="course-source-title" dir="auto">
          {cleanTitle(source.video_title) || 'Untitled source'}
        </strong>
        {source.expected_contribution && (
          <p class="course-source-rationale" dir="auto">
            {source.expected_contribution}
          </p>
        )}
      </div>
      <SourceMaterialLauncher source={source} />
      <SourceHealthControl
        sourceId={source.recommendation_id}
        sourceUrl={source.video_url}
        companionHref={verifiedCompanionHref(source)}
        compact
      />
    </li>
  )
}

const materialIcon = (kind: SourceMaterialKind) =>
  kind === 'original' ? 'external' : kind === 'html' ? 'source' : kind === 'pdf' ? 'file' : 'spark'

function SourceMaterialLauncher({ source }: { source: PathSource }) {
  const launcher = buildSourceMaterialLauncher(source)
  if (!launcher) return <p class="course-material-unavailable">No openable material</p>
  const materials = [launcher.primary, ...launcher.alternatives]

  return (
    <div
      class="course-material-launcher is-icon-only"
      aria-label={`Open formats for ${source.video_title || 'this source'}`}
    >
      {materials.map((material, index) => {
        const description = [material.label, material.purpose, ...material.details, material.availability]
          .filter(Boolean)
          .join('. ')
        return (
          <a
            class={`course-material-icon-action material-${material.kind} ${index === 0 ? 'is-primary' : ''}`}
            href={material.href}
            target="_blank"
            rel="noreferrer"
            aria-label={`${index === 0 && launcher.explicitlyRecommended ? 'Recommended. ' : ''}${description}. Opens in a new tab.`}
            title={`${material.format}: ${material.label}`}
            key={material.kind}
          >
            <Icon name={materialIcon(material.kind)} size={16} />
            <span class="visually-hidden">{material.format}</span>
          </a>
        )
      })}
    </div>
  )
}
