// A metadata-only page: never hydrate authored bodies, notes, or artifact receipts.
export function parseLevelLessonPage(query: { stage_id?: string; limit?: string; offset?: string }) {
  const { stage_id: stageId, limit = '25', offset = '0' } = query
  if (!stageId || !/^[A-Za-z0-9_-]{1,120}$/.test(stageId)) return null
  if (!/^\d+$/.test(limit) || !/^\d+$/.test(offset)) return null
  const pageSize = Number(limit)
  const pageOffset = Number(offset)
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) return null
  if (!Number.isSafeInteger(pageOffset) || pageOffset < 0) return null
  return { stageId, limit: pageSize, offset: pageOffset }
}

export async function loadLevelLessonPage(
  db: D1Database,
  threadId: string,
  page: NonNullable<ReturnType<typeof parseLevelLessonPage>>,
) {
  const stage = await db
    .prepare('SELECT id,thread_id,title,status,position FROM learning_path_stages WHERE id=? AND thread_id=?')
    .bind(page.stageId, threadId)
    .first()
  if (!stage) return null
  const [counts, rows] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) total,COALESCE(SUM(status='completed'),0) completed
         FROM thread_lessons WHERE thread_id=? AND stage_id=?`,
      )
      .bind(threadId, page.stageId)
      .first<{ total: number; completed: number }>(),
    db
      .prepare(
        `SELECT l.id,l.thread_id,l.stage_id,l.title,l.status,l.position,l.estimated_minutes,
          CASE WHEN length(trim(COALESCE(l.content,'')))>0 THEN 1 ELSE 0 END has_content,
          (SELECT ls.recommendation_id FROM thread_lesson_sources ls
           WHERE ls.lesson_id=l.id AND ls.role='primary' ORDER BY ls.position,ls.recommendation_id LIMIT 1) primary_source_id,
          (SELECT COUNT(*) FROM thread_lesson_sources ls WHERE ls.lesson_id=l.id) source_count
         FROM thread_lessons l WHERE l.thread_id=? AND l.stage_id=?
         ORDER BY l.position,l.id LIMIT ? OFFSET ?`,
      )
      .bind(threadId, page.stageId, page.limit, page.offset)
      .all(),
  ])
  const lessons = rows.results || []
  const total = Number(counts?.total || 0)
  const hasMore = page.offset + lessons.length < total
  return {
    view: 'lessons',
    stage,
    lessons,
    progress: { total, completed: Number(counts?.completed || 0) },
    pagination: {
      total,
      limit: page.limit,
      offset: page.offset,
      returned: lessons.length,
      has_more: hasMore,
      next_offset: hasMore ? page.offset + lessons.length : null,
    },
  }
}
