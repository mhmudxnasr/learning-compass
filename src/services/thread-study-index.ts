type StudyLesson = {
  id: string
  thread_id: string
  stage_id: string
  title: string
  objective: string | null
  status: string
  stage_status: string
  stage_position: number
  stage_title: string
  position: number
  estimated_minutes: number | null
  has_material: number
}

export function projectThreadStudy(lessons: StudyLesson[]) {
  const unfinished = lessons.filter((lesson) => lesson.status !== 'completed')
  // Keep an empty current lesson visible instead of silently skipping its gap.
  const next =
    unfinished.find((lesson) => lesson.status === 'in_progress' && lesson.stage_status !== 'locked') ||
    unfinished.find((lesson) => ['available', 'in_progress'].includes(lesson.stage_status)) ||
    unfinished[0]
  const gaps = unfinished.filter((lesson) => !lesson.has_material)
  return {
    next_lesson: next
      ? {
          ...next,
          readiness:
            next.stage_status === 'locked'
              ? 'locked'
              : !next.has_material
                ? 'needs_material'
                : next.status === 'in_progress'
                  ? 'in_progress'
                  : 'ready',
        }
      : null,
    needs_material_count: gaps.length,
    future_material_count: gaps.filter((lesson) => lesson.id !== next?.id).length,
    remaining_minutes: unfinished.reduce((sum, lesson) => sum + Math.max(0, Number(lesson.estimated_minutes || 0)), 0),
    estimated_lesson_count: unfinished.filter((lesson) => Number(lesson.estimated_minutes) > 0).length,
  }
}

export async function loadThreadStudyIndex(db: D1Database) {
  const [lessonRows, activityRows] = await Promise.all([
    db
      .prepare(
        `SELECT l.id,l.thread_id,l.stage_id,l.title,l.objective,l.status,l.position,l.estimated_minutes,
      s.status stage_status,s.position stage_position,s.title stage_title,
      CASE WHEN LENGTH(TRIM(COALESCE(l.content,'')))>0 OR EXISTS
        (SELECT 1 FROM thread_lesson_sources ls WHERE ls.lesson_id=l.id) THEN 1 ELSE 0 END has_material
      FROM thread_lessons l JOIN learning_path_stages s ON s.id=l.stage_id
      JOIN learning_threads t ON t.id=l.thread_id WHERE t.superseded_at IS NULL
      ORDER BY s.position,s.id,l.position,l.id`,
      )
      .all<StudyLesson>(),
    db
      .prepare(
        `SELECT thread_id,MAX(occurred_at) last_studied_at FROM learning_events
      WHERE event_type='lesson_status_changed' AND is_explicit=1 GROUP BY thread_id`,
      )
      .all<{ thread_id: string; last_studied_at: string }>(),
  ])
  const groups = new Map<string, StudyLesson[]>()
  for (const lesson of lessonRows.results || []) {
    const group = groups.get(lesson.thread_id) || []
    group.push(lesson)
    groups.set(lesson.thread_id, group)
  }
  const activity = new Map((activityRows.results || []).map((row) => [row.thread_id, row.last_studied_at]))
  return new Map(
    [...groups].map(([id, lessons]) => [
      id,
      { ...projectThreadStudy(lessons), last_studied_at: activity.get(id) || null },
    ]),
  )
}
