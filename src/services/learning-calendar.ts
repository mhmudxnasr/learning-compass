const cairo = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function cairoDate(value: Date | string) {
  const date = typeof value === 'string' ? new Date(`${value.replace(' ', 'T').replace(/Z$/, '')}Z`) : value
  return cairo.format(date)
}

export function validCalendarDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number(value.slice(0, 4)) >= 2000 &&
    Number(value.slice(0, 4)) <= 2100 &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  )
}

// Find the first UTC minute of a Cairo date, including midnight DST changes.
function dayStart(date: string) {
  const midnight = Date.parse(date) / 60000
  let low = midnight - 1440
  let high = midnight + 1440
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (cairoDate(new Date(middle * 60000)) < date) low = middle + 1
    else high = middle
  }
  return new Date(low * 60000).toISOString()
}

export type CalendarEvent = {
  id: string
  kind: string
  occurred_at: string
  title: string
  target_type: 'lesson' | 'book' | 'source' | 'note' | 'card'
  target_id: string
  thread_id: string | null
  branch_label: string | null
}

// Use existing event history; opening material, capture, and automated progression
// are not study actions. Corrections remain visible beside the original action.
const eventsSql = `
  SELECT e.event_key id,
    CASE WHEN e.event_type IN ('note_created','note_edited') THEN 'note_saved'
      WHEN e.event_type='recall_reviewed' THEN 'recall_reviewed' ELSE 'source_completed' END kind,
    datetime(e.occurred_at) occurred_at,
    COALESCE(n.title,c.question,r.video_title,'Unavailable item') title,
    CASE WHEN e.note_id IS NOT NULL THEN 'note' WHEN e.card_id IS NOT NULL THEN 'card' ELSE 'source' END target_type,
    COALESCE(e.note_id,e.card_id,e.recommendation_id) target_id,NULL thread_id,b.label branch_label
  FROM learning_activity_ledger e
  LEFT JOIN recommendations r ON r.id=e.recommendation_id
  LEFT JOIN notes n ON n.id=e.note_id
  LEFT JOIN srs_cards c ON c.id=e.card_id
  LEFT JOIN recommendation_meta m ON m.recommendation_id=e.recommendation_id
  LEFT JOIN tree_nodes b ON b.id=COALESCE(n.branch_id,m.branch_id) AND b.status!='pruned'
  WHERE e.event_type IN ('note_created','note_edited','recall_reviewed','completion')
    AND (e.recommendation_id IS NULL OR (r.id IS NOT NULL AND r.deleted_at IS NULL AND lower(r.status)!='deleted'))
    AND (e.note_id IS NULL OR n.id IS NOT NULL) AND (e.card_id IS NULL OR c.id IS NOT NULL)
  UNION ALL
  SELECT e.id,CASE json_extract(e.payload_json,'$.to') WHEN 'completed' THEN 'lesson_completed' ELSE 'lesson_reopened' END,
    datetime(e.occurred_at),l.title,'lesson',l.id,l.thread_id,NULL
  FROM learning_events e JOIN thread_lessons l ON l.id=json_extract(e.payload_json,'$.lesson_id') AND l.thread_id=e.thread_id
  JOIN learning_threads t ON t.id=l.thread_id AND t.superseded_at IS NULL
  WHERE e.event_type='lesson_status_changed' AND e.is_explicit=1
    AND (json_extract(e.payload_json,'$.to')='completed' OR json_extract(e.payload_json,'$.from')='completed')
  UNION ALL
  SELECT e.id,CASE json_extract(e.payload_json,'$.completed') WHEN 1 THEN 'chapter_completed' ELSE 'chapter_reopened' END,
    datetime(e.occurred_at),r.video_title || ' — ' || ch.chapter_title,'book',r.id,NULL,b.label
  FROM learning_events e JOIN recommendations r ON r.id=e.recommendation_id AND r.deleted_at IS NULL AND lower(r.status)!='deleted'
  JOIN book_visual_chapters ch ON ch.recommendation_id=r.id AND ch.chapter_key=json_extract(e.payload_json,'$.chapter_key')
  LEFT JOIN recommendation_meta m ON m.recommendation_id=r.id
  LEFT JOIN tree_nodes b ON b.id=m.branch_id AND b.status!='pruned'
  WHERE e.event_type='personal_library_updated' AND json_extract(e.payload_json,'$.source')='books_chapter_progress'
`

export async function loadLearningCalendar(db: D1Database, month: string, day?: string, offset = 0) {
  const firstDay = `${month}-01`
  const nextMonth = new Date(`${firstDay}T00:00:00Z`)
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1)
  const from = dayStart(firstDay)
  const until = dayStart(nextMonth.toISOString().slice(0, 10))
  const rows = await db
    .prepare(
      `WITH events AS (${eventsSql})
    SELECT strftime('%Y-%m-%dT%H:00:00Z',occurred_at) hour,kind,COUNT(*) count FROM events
    WHERE occurred_at>=datetime(?) AND occurred_at<datetime(?) GROUP BY hour,kind ORDER BY hour`,
    )
    .bind(from, until)
    .all<{ hour: string; kind: string; count: number }>()
  const days = new Map<string, { date: string; total: number; counts: Record<string, number> }>()
  for (const row of rows.results || []) {
    const date = cairoDate(row.hour)
    const entry = days.get(date) || { date, total: 0, counts: {} }
    entry.counts[row.kind] = (entry.counts[row.kind] || 0) + row.count
    entry.total += row.count
    days.set(date, entry)
  }
  let events: CalendarEvent[] = []
  if (day) {
    const nextDay = new Date(`${day}T00:00:00Z`)
    nextDay.setUTCDate(nextDay.getUTCDate() + 1)
    const result = await db
      .prepare(
        `WITH events AS (${eventsSql}) SELECT * FROM events
      WHERE occurred_at>=datetime(?) AND occurred_at<datetime(?) ORDER BY occurred_at DESC,id DESC LIMIT 50 OFFSET ?`,
      )
      .bind(dayStart(day), dayStart(nextDay.toISOString().slice(0, 10)), offset)
      .all<CalendarEvent>()
    events = result.results || []
  }
  const total = day ? days.get(day)?.total || 0 : 0
  return {
    month,
    timezone: 'Africa/Cairo',
    days: [...days.values()],
    day: day || null,
    events,
    total,
    offset,
    next_offset: offset + events.length < total ? offset + events.length : null,
  }
}
