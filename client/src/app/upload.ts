import { authFetch } from '../auth'

export type UploadArtifactResult = {
  ok?: boolean
  id: string
  filename?: string
  r2_key?: string
  metadata?: Record<string, unknown>
  quality_assurance?: Record<string, unknown>
}

export class UploadError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'UploadError'
    this.status = status
    this.body = body
  }
}

/** Uploads a browser File through the multipart artifact boundary. */
export async function uploadArtifact(file: File, metadata?: Record<string, unknown>): Promise<UploadArtifactResult> {
  if (!file) throw new UploadError('Choose a file before uploading.', 400, { error: 'file_required' })
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new UploadError('Files need a connection before they can be stored in R2.', 0, { error: 'offline_upload' })
  }

  const form = new FormData()
  form.append('file', file)
  if (metadata && Object.keys(metadata).length) form.append('metadata', JSON.stringify(metadata))

  let response: Response
  try {
    response = await authFetch('/artifacts', { method: 'POST', body: form })
  } catch (error) {
    throw error instanceof Error ? error : new Error('The file upload could not start.')
  }

  const body = await response.json().catch(() => ({})) as Partial<UploadArtifactResult> & { error?: string }
  if (!response.ok || !body.id) {
    throw new UploadError(body.error || `Upload failed (${response.status})`, response.status, body)
  }
  return body as UploadArtifactResult
}
