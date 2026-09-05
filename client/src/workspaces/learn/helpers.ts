import { formatDate as apiFormatDate, labelize } from '../../api'
export { findNextThreadLesson, lessonReadiness } from './lessonState'

export function formatDate(value?: string | null) {
  return apiFormatDate(value || undefined)
}

export function statusLabel(value?: string | null) {
  return (
    (
      {
        active: 'In progress',
        paused: 'Paused',
        completed: 'Completed',
        abandoned: 'Archived',
        draft: 'Planned',
        available: 'Available',
        in_progress: 'In progress',
        locked: 'Locked',
        waived: 'Waived',
      } as Record<string, string>
    )[value || ''] || labelize(value || 'Not recorded')
  )
}

export function roleLabel(value?: string | null) {
  return (
    (
      {
        foundation: 'Foundation',
        case: 'Case study',
        companion: 'Reading companion',
        reference: 'Reference',
        primary: 'Primary',
        supporting: 'Supporting',
      } as Record<string, string>
    )[value || ''] || labelize(value || 'Reference')
  )
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

export function noteHref(id: string) {
  return `#/learn/note/${encodeURIComponent(id)}`
}

export function cardHref(id: string) {
  return `#/learn/card/${encodeURIComponent(id)}`
}

export function percent(completed: number, total: number) {
  if (!total) return 0
  return Math.round((completed / total) * 100)
}

export function cleanTitle(value?: string | null): string {
  if (!value) return ''
  return value.replace(/^(\d{1,4})([\u0600-\u06FF])/, '$1 · $2').trim()
}
