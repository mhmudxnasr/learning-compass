import { useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { api } from '../../api'
import { Icon } from '../../components/Icon'
import { noteHref } from './helpers'
import { materialExcerpt, threadNextLesson, threadTabHref } from './threadViewModel'
import type { PathResponse } from './types'
import { SourceSection } from './LearnLessonView'

export function ThreadStudyOverview({
  path,
  onChanged,
  children,
}: {
  path: PathResponse
  onChanged: () => void
  children: ComponentChildren
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(path.thread.title)
  const [question, setQuestion] = useState(path.thread.guiding_question || '')
  const [outcome, setOutcome] = useState(path.thread.definition_of_done || '')
  const [synthesis, setSynthesis] = useState(path.thread.final_synthesis || '')
  const [working, setWorking] = useState('')
  const [message, setMessage] = useState('')
  const next = threadNextLesson(path)
  const completed = path.thread.status === 'completed'
  const sources = [
    ...new Map(
      [
        ...path.sources,
        ...path.stages.flatMap((stage) => [
          ...stage.sources,
          ...stage.lessons.flatMap((lesson) => lesson.sources || []),
        ]),
      ].map((source) => [source.recommendation_id, source]),
    ).values(),
  ]
  const notes = [
    ...new Map(
      [
        ...path.notes,
        ...path.stages.flatMap((stage) => [...stage.notes, ...stage.lessons.flatMap((lesson) => lesson.notes || [])]),
      ].map((note) => [note.id, note]),
    ).values(),
  ]
  const save = async (fields: Record<string, string>, kind: string) => {
    setWorking(kind)
    setMessage('')
    try {
      await api(`/learning/core/threads/${encodeURIComponent(path.thread.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(fields),
      })
      setMessage(`${kind} saved.`)
      setEditing(false)
      onChanged()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save changes.')
    } finally {
      setWorking('')
    }
  }
  return (
    <div class="thread-study-overview">
      <div class="thread-purpose-sheet">
        <div class="thread-purpose-heading">
          <span class="desk-eyebrow">{completed ? 'What you set out to do' : 'The purpose of this Thread'}</span>
          <button class="button secondary" onClick={() => setEditing(!editing)} aria-expanded={editing}>
            <Icon name="edit" size={14} />
            {editing ? 'Close editor' : 'Edit goal'}
          </button>
        </div>
        {editing ? (
          <form
            class="thread-goal-form"
            onSubmit={(event) => {
              event.preventDefault()
              void save(
                { title: title.trim(), guiding_question: question.trim(), definition_of_done: outcome.trim() },
                'Goal',
              )
            }}
          >
            <label>
              Title
              <input
                required
                maxLength={160}
                value={title}
                onInput={(event) => setTitle(event.currentTarget.value)}
                dir="auto"
              />
            </label>
            <label>
              Guiding question
              <textarea
                required
                maxLength={1000}
                value={question}
                onInput={(event) => setQuestion(event.currentTarget.value)}
                dir="auto"
              />
            </label>
            <label>
              Intended outcome
              <textarea
                required
                maxLength={2000}
                value={outcome}
                onInput={(event) => setOutcome(event.currentTarget.value)}
                dir="auto"
              />
            </label>
            <button class="button primary" disabled={!!working}>
              {working === 'Goal' ? 'Saving…' : 'Save goal'}
            </button>
          </form>
        ) : (
          <>
            <h2 dir="auto">{path.thread.definition_of_done || 'Give this Thread an intended outcome.'}</h2>
            {next && (
              <div class="thread-purpose-current">
                <span>Working toward this now</span>
                <p dir="auto">{next.stage.objective || next.stage.description || next.stage.title}</p>
                {(next.lesson.objective || next.lesson.why_learn) && (
                  <p dir="auto">{next.lesson.objective || next.lesson.why_learn}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <div class="thread-overview-columns">
        <div>{children}</div>
        <aside class="thread-study-notebook">
          <header>
            <Icon name="note" size={18} />
            <h2>Your learning notebook</h2>
          </header>
          <p>Keep the ideas you want to return to.</p>
          {notes.length ? (
            <ul>
              {notes.slice(0, 5).map((note) => (
                <li key={note.id}>
                  <a href={noteHref(note.id)} dir="auto">
                    {note.title}
                  </a>
                  <p dir="auto">{materialExcerpt(note.abstract || note.sections?.[0]?.content, 'Open note')}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p class="desk-empty-copy">Your saved notes will appear here. Add one from a lesson or Resources.</p>
          )}
          <a class="button secondary" href={threadTabHref(path.thread.id, 'materials')}>
            Open resources
            <Icon name="chevron" size={14} />
          </a>
          <details class="thread-synthesis" open={completed || undefined}>
            <summary>{completed ? 'Closing reflection' : 'Your developing understanding'}</summary>
            <p>
              What can you explain or do now? What is still unresolved? This is optional and stays in your own words.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void save({ final_synthesis: synthesis.trim() }, 'Reflection')
              }}
            >
              <label class="visually-hidden" for="thread-synthesis-text">
                Thread reflection
              </label>
              <textarea
                id="thread-synthesis-text"
                dir="auto"
                value={synthesis}
                maxLength={20000}
                rows={7}
                onInput={(event) => setSynthesis(event.currentTarget.value)}
                placeholder="Connect the ideas in your own words…"
              />
              <button class="button secondary" disabled={!!working}>
                {working === 'Reflection' ? 'Saving…' : 'Save reflection'}
              </button>
            </form>
          </details>
        </aside>
      </div>
      {completed && sources.length > 0 && <SourceSection sources={sources} title="Sources to revisit" />}
      {message && (
        <p class="desk-feedback" role="status">
          {message}
        </p>
      )}
    </div>
  )
}
