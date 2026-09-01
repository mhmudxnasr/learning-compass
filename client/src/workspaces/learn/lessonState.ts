export type LessonReadiness = 'completed' | 'in_progress' | 'ready' | 'needs_material'

export function hasLessonStudyMaterial(lesson: { content?: string | null; sources?: unknown[] }) {
  return Boolean(lesson.content?.trim() || lesson.sources?.length)
}

export function lessonReadiness(lesson: {
  status?: string | null
  content?: string | null
  sources?: unknown[]
}): LessonReadiness {
  if (lesson.status === 'completed') return 'completed'
  if (!hasLessonStudyMaterial(lesson)) return 'needs_material'
  if (lesson.status === 'in_progress') return 'in_progress'
  return 'ready'
}

export function findNextThreadLesson<T extends { id: string }>(
  stages: ReadonlyArray<{ lessons: ReadonlyArray<T> }>,
  currentLessonId: string,
): T | null {
  const lessons = stages.flatMap((stage) => stage.lessons)
  const currentIndex = lessons.findIndex((lesson) => lesson.id === currentLessonId)
  return currentIndex >= 0 ? lessons[currentIndex + 1] || null : null
}
