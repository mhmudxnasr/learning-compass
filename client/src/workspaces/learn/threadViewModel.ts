import { lessonReadiness } from './helpers'
import type { PathResponse, PathStage, ThreadLesson } from './types'

export type ThreadTabKey = 'overview' | 'curriculum' | 'practice' | 'materials'

export function threadTabHref(threadId: string, tab: ThreadTabKey, levelId?: string) {
  const query = new URLSearchParams({ tab })
  if (levelId) query.set('level', levelId)
  return `#/learn/thread/${encodeURIComponent(threadId)}?${query.toString()}`
}

export function domId(prefix: string, value: string) {
  return `${prefix}-${value.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

// Authored numbering is learner-facing; positions remain zero-based storage order.
export function levelNumber(stage: Pick<PathStage, 'title' | 'position'>) {
  const authored = stage.title.match(/^Level\s+(\d+)\b/i)
  return authored ? Number(authored[1]) : stage.position + 1
}

export function levelTitle(stage: PathStage) {
  return stage.title.replace(/^Level \d+\s*[—-]\s*/, '')
}

export function persistThreadLevelFocus(threadId: string, tab: ThreadTabKey, levelId: string) {
  const href = threadTabHref(threadId, tab, levelId)
  if (window.location.hash !== href) window.history.replaceState(window.history.state, '', href)
}

export function completedLessonCount(stage: PathStage) {
  return Number(
    stage.progress?.study_completed ?? stage.lessons.filter((lesson) => lesson.status === 'completed').length,
  )
}

export function threadNextLesson(path: PathResponse) {
  const lessons = path.stages.flatMap((stage) => stage.lessons.map((lesson) => ({ stage, lesson })))
  return (
    lessons.find(({ stage, lesson }) => lesson.status === 'in_progress' && stage.status !== 'locked') ||
    lessons.find(
      ({ stage, lesson }) => ['available', 'in_progress'].includes(stage.status) && lesson.status !== 'completed',
    ) ||
    lessons.find(({ lesson }) => lesson.status !== 'completed')
  )
}

export function threadSourceCount(path: PathResponse) {
  return path.stages.reduce(
    (total, stage) =>
      total +
      stage.sources.length +
      stage.lessons.reduce((lessonTotal, lesson) => lessonTotal + (lesson.sources?.length || 0), 0),
    0,
  )
}

export function lessonActionLabel(lesson: ThreadLesson) {
  const readiness = lessonReadiness(lesson)
  if (readiness === 'completed') return 'Review'
  if (readiness === 'in_progress') return 'Continue'
  if (readiness === 'needs_material') return 'Review gap'
  return 'Open lesson'
}

export function materialExcerpt(value: string | null | undefined, fallback: string) {
  const plain = String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!plain) return fallback
  return plain.length > 220 ? `${plain.slice(0, 217).trimEnd()}…` : plain
}

export function threadMaterialTotals(path: PathResponse) {
  return path.stages.reduce(
    (totals, stage) => {
      totals.notes += stage.notes.length
      totals.files += stage.files.length
      totals.cards += stage.cards.length
      totals.drafts += stage.recall_drafts.length
      for (const lesson of stage.lessons) {
        totals.notes += lesson.notes?.length || 0
        totals.files += lesson.files?.length || 0
        totals.cards += lesson.cards?.length || 0
        totals.drafts += lesson.recall_drafts?.length || 0
      }
      return totals
    },
    {
      notes: path.notes.length,
      files: path.files.length,
      cards: path.cards.length,
      drafts: path.recall_drafts.length,
    },
  )
}
