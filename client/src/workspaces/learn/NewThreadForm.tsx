import { useEffect, useRef, useState } from 'preact/hooks'
import { api } from '../../api'
import { threadTabHref } from './threadViewModel'

export function NewThreadForm({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [title, setTitle] = useState('')
  const [question, setQuestion] = useState('')
  const [outcome, setOutcome] = useState('')
  const [type, setType] = useState('understand')
  const [context, setContext] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  const create = async (event: Event) => {
    event.preventDefault()
    setWorking(true)
    setError('')
    try {
      const result = await api<{ id: string }>('/learning/core/threads', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          guiding_question: question.trim(),
          definition_of_done: outcome.trim(),
          thread_type: type,
          why_now: context.trim(),
          activate: false,
        }),
      })
      onClose()
      location.hash = `${threadTabHref(result.id, 'curriculum')}&setup=1`
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create Thread.')
      setWorking(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      class="thread-compose-dialog"
      aria-labelledby="new-thread-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!working) onClose()
      }}
    >
      <form class="thread-compose-form" onSubmit={create}>
        <span class="desk-eyebrow">A new direction</span>
        <h2 id="new-thread-title">What do you want to learn?</h2>
        <p>Save the idea first. Then shape its Levels, lessons, and study materials.</p>
        <label>
          Thread title
          <input
            autoFocus
            required
            maxLength={160}
            value={title}
            onInput={(event) => setTitle(event.currentTarget.value)}
            placeholder="e.g. Understanding systems"
            dir="auto"
          />
        </label>
        <label>
          The question you want to answer
          <textarea
            required
            maxLength={1000}
            rows={2}
            value={question}
            onInput={(event) => setQuestion(event.currentTarget.value)}
            placeholder="What do you want to understand, build, or decide?"
            dir="auto"
          />
        </label>
        <label>
          Your intended outcome
          <textarea
            required
            maxLength={2000}
            rows={2}
            value={outcome}
            onInput={(event) => setOutcome(event.currentTarget.value)}
            placeholder="By the end, I want to be able to…"
            dir="auto"
          />
        </label>
        <label>
          Kind of learning
          <select value={type} onChange={(event) => setType(event.currentTarget.value)}>
            <option value="understand">Understand a subject</option>
            <option value="build">Build something</option>
            <option value="decide">Make a decision</option>
            <option value="practice">Practice a skill</option>
          </select>
        </label>
        <details>
          <summary>
            Background and preferences <span>Optional</span>
          </summary>
          <label>
            What you already know, desired depth, time, or source preferences
            <textarea
              maxLength={2000}
              rows={3}
              value={context}
              onInput={(event) => setContext(event.currentTarget.value)}
              dir="auto"
            />
          </label>
        </details>
        {error && <p role="alert">{error}</p>}
        <footer>
          <button class="button secondary" type="button" disabled={working} onClick={onClose}>
            Cancel
          </button>
          <button class="button primary" disabled={working}>
            {working ? 'Creating…' : 'Create & plan lessons'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
