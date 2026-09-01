import { useState } from 'preact/hooks'
import { api } from '../../api'
import { Icon } from '../../components/Icon'
import { PathStage } from './types'

export function ThreadAuthoring({
  threadId,
  stage,
  stageCount,
  onChanged,
}: {
  threadId: string
  stage?: PathStage
  stageCount: number
  onChanged: () => void
}) {
  const [stageTitle, setStageTitle] = useState('')
  const [stageObjective, setStageObjective] = useState('')
  const [lessonTitle, setLessonTitle] = useState('')
  const [lessonObjective, setLessonObjective] = useState('')
  const [working, setWorking] = useState('')
  const [message, setMessage] = useState('')

  const addStage = async (event: Event) => {
    event.preventDefault()
    if (!stageTitle.trim()) return
    setWorking('stage')
    setMessage('Adding level…')
    try {
      await api(`/learning/core/threads/${encodeURIComponent(threadId)}/stages`, {
        method: 'POST',
        body: JSON.stringify({
          title: stageTitle.trim(),
          objective: stageObjective.trim(),
          position: stageCount,
        }),
      })
      setStageTitle('')
      setStageObjective('')
      setMessage('Level added to curriculum.')
      onChanged()
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'The level could not be added.')
    } finally {
      setWorking('')
    }
  }

  const addLesson = async (event: Event) => {
    event.preventDefault()
    if (!stage || !lessonTitle.trim()) return
    setWorking('lesson')
    setMessage('Adding lesson…')
    try {
      await api(
        `/learning/core/threads/${encodeURIComponent(threadId)}/stages/${encodeURIComponent(stage.id)}/lessons`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: lessonTitle.trim(),
            objective: lessonObjective.trim(),
            position: stage.lessons.length,
          }),
        },
      )
      setLessonTitle('')
      setLessonObjective('')
      setMessage('Lesson added to level.')
      onChanged()
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'The lesson could not be added.')
    } finally {
      setWorking('')
    }
  }

  return (
    <details class="folio-authoring thread-authoring-container">
      <summary>
        <span class="thread-authoring-summary-content">
          <Icon name="spark" size={15} />
          <strong>Curriculum Authoring: Add Level or Lesson</strong>
        </span>
        <span class="thread-authoring-summary-hint">Expand to structure path</span>
      </summary>

      <div class="folio-authoring-body">
        <div class="thread-authoring-grid">
          {/* Add Level Form */}
          <form onSubmit={addStage} class="thread-authoring-card">
            <div class="thread-authoring-card-head">
              <p class="folio-object-kicker">New Curriculum Level</p>
              <h4>Add Level {stageCount + 1}</h4>
              <p>Each level establishes a coherent stage of understanding.</p>
            </div>
            <label>
              <span>Level Title</span>
              <input
                value={stageTitle}
                onInput={(event) => setStageTitle((event.target as HTMLInputElement).value)}
                placeholder="e.g. Core Protocols & Primitives"
                required
              />
            </label>
            <label>
              <span>Objective</span>
              <textarea
                value={stageObjective}
                onInput={(event) => setStageObjective((event.target as HTMLTextAreaElement).value)}
                placeholder="What will this level achieve?"
                rows={2}
              />
            </label>
            <button class="button secondary" type="submit" disabled={working === 'stage' || !stageTitle.trim()}>
              {working === 'stage' ? 'Adding Level…' : 'Add Level to Curriculum'}
            </button>
          </form>

          {/* Add Lesson Form */}
          <form onSubmit={addLesson} class={`thread-authoring-card ${!stage ? 'folio-form-disabled' : ''}`}>
            <div class="thread-authoring-card-head">
              <p class="folio-object-kicker">Sequential Lesson</p>
              <h4>{stage ? `Add Lesson to ${stage.title}` : 'Select an active Level first'}</h4>
              <p>Sequential units that build towards level mastery.</p>
            </div>
            <label>
              <span>Lesson Title</span>
              <input
                value={lessonTitle}
                onInput={(event) => setLessonTitle((event.target as HTMLInputElement).value)}
                disabled={!stage}
                placeholder="e.g. Raft State Transitions"
                required
              />
            </label>
            <label>
              <span>Objective</span>
              <textarea
                value={lessonObjective}
                onInput={(event) => setLessonObjective((event.target as HTMLTextAreaElement).value)}
                disabled={!stage}
                placeholder="Core takeaway of this lesson"
                rows={2}
              />
            </label>
            <button
              class="button secondary"
              type="submit"
              disabled={!stage || working === 'lesson' || !lessonTitle.trim()}
            >
              {working === 'lesson' ? 'Adding Lesson…' : 'Add Lesson to Level'}
            </button>
          </form>
        </div>

        {message && (
          <output class="folio-status" aria-live="polite">
            {message}
          </output>
        )}
      </div>
    </details>
  )
}
