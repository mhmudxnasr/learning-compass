export function selectHomeLessonTurns<T extends { status: string }>(lessons: T[], limit = 1) {
  const activeIndex = lessons.findIndex((lesson) => lesson.status === 'in_progress')
  const unfinishedIndex = lessons.findIndex((lesson) => lesson.status !== 'completed')
  if (activeIndex < 0 && unfinishedIndex < 0) return []
  const start = activeIndex >= 0 ? activeIndex : Math.max(0, unfinishedIndex)
  return lessons.slice(start, start + limit)
}
