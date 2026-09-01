import { useState } from 'preact/hooks'
import { api } from '../../api'
import { routeHref } from '../../app/router'
import { Icon } from '../../components/Icon'
import { lessonHref, lessonReadiness, percent, statusLabel } from './helpers'
import { SourceSection } from './LearnLessonView'
import { LevelMaterials } from './LearnThreadMaterials'
import { threadTabHref } from './threadViewModel'
import type { PathStage } from './types'

export function StageView({
  stage,
  threadId,
  threadTitle,
  onChanged,
}: {
  stage: PathStage
  threadId: string
  threadTitle: string
  onChanged: () => void
}) {
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  const completedLessons = stage.lessons.filter((lesson) => lesson.status === 'completed').length
  const totalLessons = stage.lessons.length
  const lessonCompletion = percent(completedLessons, totalLessons)

  const nextAction = stage.next_action
  const proposedNextLesson =
    nextAction?.kind === 'lesson'
      ? stage.lessons.find((lesson) => lesson.id === nextAction.lesson_id)
      : stage.lessons.find((lesson) => lesson.status !== 'completed')
  const nextLesson =
    proposedNextLesson && lessonReadiness(proposedNextLesson) !== 'needs_material'
      ? proposedNextLesson
      : stage.lessons.find((lesson) => ['ready', 'in_progress'].includes(lessonReadiness(lesson)))
  const lessonsNeedingMaterial = stage.lessons.filter((lesson) => lessonReadiness(lesson) === 'needs_material').length

  const startLevel = async () => {
    setWorking(true)
    setError('')
    try {
      await api(`/learning/core/threads/${encodeURIComponent(threadId)}/stages/${encodeURIComponent(stage.id)}/start`, {
        method: 'POST',
      })
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Level start failed.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <header class="course-stage-header">
        <nav class="course-stage-context" aria-label="Breadcrumb">
          <a href={routeHref('learn', 'paths')}>Threads</a>
          <span aria-hidden="true">/</span>
          <a href={threadTabHref(threadId, 'overview')}>{threadTitle}</a>
          <span aria-hidden="true">/</span>
          <a href={threadTabHref(threadId, 'curriculum', stage.id)}>Lessons</a>
          <span aria-hidden="true">/</span>
          <span>Level {stage.position}</span>
        </nav>
        <div class="course-stage-heading-line">
          <p class="folio-object-kicker">Level {stage.position}</p>
          <span class={`course-stage-status status-${stage.status}`}>{statusLabel(stage.status)}</span>
        </div>
        <h1>{stage.title.replace(/^Level \d+\s*[—-]\s*/, '')}</h1>
        <p>{stage.objective || stage.description || 'Build the next layer of understanding.'}</p>
        <div class="course-stage-progress-grid" aria-label="Level progress">
          <ProgressTrack
            label="Study"
            completed={completedLessons}
            total={totalLessons}
            unit="lessons"
            value={lessonCompletion}
          />
        </div>
      </header>

      {stage.status === 'locked' && (
        <section class="course-next-action is-blocked">
          <div>
            <p class="folio-object-kicker">Locked Level</p>
            <h3>Finish the previous Level first</h3>
            <p>You can preview this curriculum, but study actions unlock only after the previous Level is completed.</p>
          </div>
          <span class="course-next-action-lock">
            <Icon name="lock" size={14} /> Locked
          </span>
        </section>
      )}

      {stage.status === 'available' && (
        <section class="course-next-action">
          <div>
            <p class="folio-object-kicker">Ready when you are</p>
            <h3>Start this Level</h3>
            <p>Starting makes its sequential lessons and project actionable.</p>
          </div>
          <button class="button primary folio-primary" disabled={working} onClick={startLevel}>
            {working ? 'Starting…' : 'Start Level'}
          </button>
        </section>
      )}

      {error && (
        <p class="folio-status" role="alert">
          {error}
        </p>
      )}

      {stage.status === 'in_progress' && nextLesson && (
        <section class="course-next-action" aria-labelledby="course-next-action-title">
          <div>
            <p class="folio-object-kicker">Next up</p>
            <h3 id="course-next-action-title">{nextLesson.title}</h3>
            <p>
              {nextLesson.status === 'in_progress'
                ? 'Pick up where you left off.'
                : 'Start the next lesson in this level.'}
            </p>
          </div>
          <a class="button primary folio-primary" href={lessonHref(threadId, nextLesson.id)}>
            {nextLesson.status === 'in_progress' ? 'Continue lesson' : 'Start lesson'} <Icon name="chevron" size={14} />
          </a>
        </section>
      )}

      {!nextLesson && lessonsNeedingMaterial > 0 && (
        <section class="course-next-action is-blocked" aria-labelledby="course-next-action-title">
          <div>
            <p class="folio-object-kicker">Next up</p>
            <h3 id="course-next-action-title">Prepare the next lesson</h3>
            <p>
              {lessonsNeedingMaterial} {lessonsNeedingMaterial === 1 ? 'lesson needs' : 'lessons need'} authored content
              or an attached source before study can continue.
            </p>
          </div>
          <span class="course-next-action-lock">
            <Icon name="source" size={14} /> Material needed
          </span>
        </section>
      )}

      <details class="course-section course-lessons" open>
        <summary>
          <span>
            <span class="folio-object-kicker">Curriculum</span>
            <strong>Sequential Lessons</strong>
          </span>
          <span class="course-section-count">
            {completedLessons}/{totalLessons} complete
          </span>
        </summary>
        <div class="course-section-body">
          {stage.lessons.length ? (
            stage.lessons.map((lesson, sequence) => {
              const readiness = lessonReadiness(lesson)
              const stateCopy =
                readiness === 'completed'
                  ? 'Completed'
                  : readiness === 'needs_material'
                    ? 'Needs material'
                    : readiness === 'in_progress'
                      ? 'In progress · Continue'
                      : lesson.id === nextLesson?.id
                        ? 'Ready · Your next lesson'
                        : 'Ready to study'
              return (
                <a
                  class={`course-lesson state-${readiness} ${readiness === 'completed' ? 'is-complete' : ''} ${lesson.id === nextLesson?.id ? 'is-next' : ''}`}
                  href={lessonHref(threadId, lesson.id)}
                  key={lesson.id}
                  aria-label={`Open lesson ${sequence + 1}: ${lesson.title}, ${stateCopy.toLowerCase()}`}
                >
                  <span class="course-lesson-number">
                    {readiness === 'completed' ? (
                      <Icon name="check" size={14} />
                    ) : (
                      String(sequence + 1).padStart(2, '0')
                    )}
                  </span>
                  <strong class="course-lesson-title">{lesson.title}</strong>
                  <small class="course-lesson-source-count">{stateCopy}</small>
                </a>
              )
            })
          ) : (
            <p class="folio-empty-line">No lessons in this level yet.</p>
          )}
        </div>
      </details>

      {stage.sources.length > 0 && <SourceSection sources={stage.sources} title="Level Study Material" />}

      <LevelMaterials stage={stage} onChanged={onChanged} />
    </>
  )
}

function ProgressTrack({
  label,
  completed,
  total,
  unit,
  value,
}: {
  label: string
  completed: number
  total: number
  unit: string
  value: number
}) {
  const summary = total ? `${completed} of ${total} ${unit}` : `No ${unit} set`
  return (
    <div class="course-stage-progress" aria-label={`${label}: ${summary}`}>
      <div class="course-stage-progress-label">
        <span class="folio-object-kicker">{label}</span>
        <strong>{summary}</strong>
        <span>{total ? `${value}%` : '—'}</span>
      </div>
      <div
        class="course-stage-progress-track"
        role="progressbar"
        aria-label={`${label} progress`}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}
