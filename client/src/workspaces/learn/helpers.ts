import { formatDate as apiFormatDate, labelize } from '../../api'
export { hasLessonStudyMaterial, lessonReadiness } from './lessonState'
export type { LessonReadiness } from './lessonState'

export { labelize }

export function formatDate(value?: string | null) {
  return apiFormatDate(value || undefined)
}

export function statusLabel(value?: string | null) {
  return ({
    active: 'In progress',
    paused: 'Paused',
    verified: 'Verified',
    ready_to_verify: 'Ready to verify',
    abandoned: 'Archived',
    draft: 'Planned',
    available: 'Available',
    in_progress: 'In progress',
    locked: 'Locked',
    waived: 'Waived',
  } as Record<string, string>)[value || ''] || labelize(value || 'Not recorded')
}

export function roleLabel(value?: string | null) {
  return ({
    foundation: 'Foundation',
    case: 'Case study',
    companion: 'Reading companion',
    reference: 'Reference',
    primary: 'Primary',
    supporting: 'Supporting',
  } as Record<string, string>)[value || ''] || labelize(value || 'Reference')
}

export function itemLabel(value?: string | null) {
  return ({
    concept: 'Concept',
    source_role: 'Source study',
    companion: 'Companion study',
    recall_prompt: 'Free recall',
    exercise: 'Exercise',
    application: 'Application',
    reflection: 'Reflection',
  } as Record<string, string>)[value || ''] || labelize(value || 'Item')
}

export function directionValue(value?: string | null): 'auto' | 'ltr' | 'rtl' {
  return value === 'ltr' || value === 'rtl' ? value : 'auto'
}

export function threadHref(id: string) {
  return `#/learn/thread/${encodeURIComponent(id)}`
}

export function lessonHref(threadId: string, lessonId: string) {
  return `#/learn/t/${encodeURIComponent(threadId)}/l/${encodeURIComponent(lessonId)}`
}

export function levelHref(threadId: string, levelId: string) {
  return `#/learn/t/${encodeURIComponent(threadId)}/v/${encodeURIComponent(levelId)}`
}

export function noteHref(id: string) {
  return `#/learn/note/${encodeURIComponent(id)}`
}

export function cardHref(id: string) {
  return `#/learn/card/${encodeURIComponent(id)}`
}

export function artifactHref(id: string) {
  return `/artifacts/${encodeURIComponent(id)}`
}

export function isRequired(item: { required?: number | boolean }) {
  return item.required === true || Number(item.required) === 1
}

export function percent(completed: number, total: number) {
  if (!total) return 0
  return Math.round((completed / total) * 100)
}
