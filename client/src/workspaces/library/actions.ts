import { api } from '../../api'
import type { LibraryRecord } from './types'

export type StartTarget = 'original' | 'html' | 'pdf' | 'artifact' | 'notebooklm'

export async function startLearningSession(
  event: MouseEvent,
  item: LibraryRecord,
  href: string,
  targetKind: StartTarget = 'original',
  targetArtifactId?: string,
) {
  event.preventDefault()
  const popup = window.open('about:blank', '_blank', 'noopener,noreferrer')
  try {
    const result = await api<{ session_id: string }>('/sessions/start', {
      method: 'POST',
      body: JSON.stringify({
        recommendation_id: item.id,
        thread_id: item.thread_id || undefined,
        target_kind: targetKind,
        target_artifact_id: targetArtifactId,
      }),
    })
    localStorage.setItem('tm-active-session', JSON.stringify({
      id: result.session_id,
      recommendationId: item.id,
      title: item.video_title || item.title,
      sourceUrl: href,
      threadId: item.thread_id || null,
      targetKind,
      targetArtifactId: targetArtifactId || null,
    }))
    if (popup) popup.location.replace(href)
    else window.location.assign(href)
  } catch (error) {
    popup?.close()
    throw error
  }
}

export async function triageCapture(id: string, action: 'queue' | 'exclude', overrideQueueCap = false) {
  return api<{ ok: boolean; state?: string; thread_id?: string }>(`/capture/${encodeURIComponent(id)}/triage`, {
    method: 'POST',
    body: JSON.stringify({ action, override_queue_cap: overrideQueueCap, reason: action === 'exclude' ? 'inbox_exclusion' : undefined }),
  })
}

export async function processArtifact(id: string) {
  return api<{ ok: boolean; status: string }>(`/artifacts/${encodeURIComponent(id)}/process`, { method: 'POST' })
}
