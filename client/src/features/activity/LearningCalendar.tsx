import { useState } from 'preact/hooks'
import { useData } from '../../app/useData'
import { itemHref } from '../../app/router'
import { ErrorState } from '../../components/States'

type ActivityEvent = {
  id: string
  kind: string
  title: string
  occurred_at: string
  target_type: 'lesson' | 'book' | 'source' | 'note' | 'card'
  target_id: string
  thread_id: string | null
  branch_label: string | null
}
type Activity = {
  month: string
  days: Array<{ date: string; total: number; counts: Record<string, number> }>
  events: ActivityEvent[]
  total: number
  next_offset: number | null
}
const labels: Record<string, string> = {
  lesson_completed: 'Lesson completed',
  lesson_reopened: 'Lesson reopened',
  chapter_completed: 'Chapter completed',
  chapter_reopened: 'Chapter reopened',
  source_completed: 'Source completed',
  note_saved: 'Note saved',
  recall_reviewed: 'Card reviewed',
}
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { dateStyle: 'long', timeZone: 'UTC' })
const eventHref = (event: ActivityEvent) =>
  event.target_type === 'lesson' && event.thread_id
    ? `#/learn/t/${encodeURIComponent(event.thread_id)}/l/${encodeURIComponent(event.target_id)}`
    : event.target_type === 'note'
      ? `#/learn/note/${encodeURIComponent(event.target_id)}`
      : event.target_type === 'card'
        ? `#/learn/card/${encodeURIComponent(event.target_id)}`
        : itemHref({ id: event.target_id, content_type: event.target_type === 'book' ? 'book' : null })

export function LearningCalendar({ revision }: { revision?: string }) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const [selected, setSelected] = useState(today)
  const [offset, setOffset] = useState(0)
  const month = selected.slice(0, 7)
  const activity = useData<Activity>(
    `/home/activity?month=${month}&day=${selected}&offset=${offset}&revision=${encodeURIComponent(revision || '')}`,
  )
  const first = new Date(`${month}-01T12:00:00Z`)
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  const padding = first.getUTCDay()
  const byDate = new Map(activity.data?.days.map((day) => [day.date, day]) || [])
  const select = (date: string) => {
    setSelected(date)
    setOffset(0)
  }
  const moveMonth = (amount: number) => {
    const date = new Date(first)
    date.setUTCMonth(date.getUTCMonth() + amount)
    select(date.toISOString().slice(0, 10))
  }

  return (
    <section class="learning-calendar" aria-labelledby="learning-calendar-title">
      <header class="learning-calendar-heading">
        <div>
          <h2 id="learning-calendar-title">Your learning days</h2>
          <p>Recorded activity · Cairo time</p>
        </div>
        <button type="button" class="button secondary" onClick={() => select(today)}>
          Today
        </button>
      </header>
      <div class="learning-calendar-layout">
        <div>
          <div class="learning-calendar-month">
            <button
              type="button"
              class="button secondary"
              aria-label="Previous month"
              disabled={month === '2000-01'}
              onClick={() => moveMonth(-1)}
            >
              ←
            </button>
            <strong aria-live="polite">
              {first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
            </strong>
            <button
              type="button"
              class="button secondary"
              aria-label="Next month"
              disabled={month >= today.slice(0, 7)}
              onClick={() => moveMonth(1)}
            >
              →
            </button>
          </div>
          <div class="learning-calendar-weekdays" aria-hidden="true">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div class="learning-calendar-grid" aria-label="Choose a day">
            {Array.from({ length: padding }, (_, index) => (
              <span key={`blank-${index}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const date = `${month}-${String(index + 1).padStart(2, '0')}`
              const count = byDate.get(date)?.total || 0
              return (
                <button
                  key={date}
                  type="button"
                  disabled={date > today}
                  class={`learning-calendar-day intensity-${count === 0 ? 0 : count < 5 ? 1 : count < 15 ? 2 : 3}`}
                  aria-pressed={date === selected}
                  aria-current={date === today ? 'date' : undefined}
                  aria-label={`${dayLabel(date)}${activity.loading ? ', loading activity' : activity.error ? ', activity unavailable' : `, ${count} recorded actions`}`}
                  onClick={() => select(date)}
                >
                  <span>{index + 1}</span>
                  <small>{activity.loading || activity.error ? '—' : count || '·'}</small>
                </button>
              )
            })}
          </div>
          <p class="learning-calendar-help">
            Counts include saved notes and repeated reviews. Reading in another app appears when you record it in
            Compass.
          </p>
        </div>
        <div class="learning-calendar-detail" aria-busy={activity.loading}>
          <h3>{dayLabel(selected)}</h3>
          {activity.loading ? (
            <p role="status">Loading activity…</p>
          ) : activity.error ? (
            <ErrorState message={activity.error} retry={activity.reload} />
          ) : (
            <>
              <p role="status">{activity.data?.total || 0} recorded actions</p>
              {!activity.data?.total && <p>No learning activity recorded for this day.</p>}
              <ol class="learning-calendar-events">
                {activity.data?.events.map((event) => (
                  <li key={event.id}>
                    <span>{labels[event.kind] || event.kind}</span>
                    <a href={eventHref(event)} dir="auto">
                      {event.title}
                    </a>
                    {event.branch_label && <small class="folio-badge folio-badge-branch">{event.branch_label}</small>}
                  </li>
                ))}
              </ol>
              {(offset > 0 || activity.data?.next_offset != null) && (
                <div class="learning-calendar-pagination">
                  <button
                    type="button"
                    class="button secondary"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - 50))}
                  >
                    Previous actions
                  </button>
                  <button
                    type="button"
                    class="button secondary"
                    disabled={activity.data?.next_offset == null}
                    onClick={() => setOffset(activity.data?.next_offset || 0)}
                  >
                    More actions
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
