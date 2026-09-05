import { useState } from 'preact/hooks'
import { api } from '../../api'

type ExportPacket = {
  filename: string
  files: Array<{ path: string; content: string }>
  attachments: Array<{ path: string; url: string; size_bytes: number }>
  markdown_bytes: number
  summary: { notes: number; sources: number; lessons: number; companion_files: number; missing: string[] }
}
const MAX_DOWNLOAD_BYTES = 48 * 1024 * 1024

export function ThreadExport({ threadId, stages }: { threadId: string; stages: Array<{ id: string; title: string }> }) {
  const [stageId, setStageId] = useState('')
  const [companions, setCompanions] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const download = async () => {
    if (busy) return
    setBusy(true)
    setMessage('Preparing your notes…')
    setError('')
    try {
      const packet = await api<ExportPacket>(
        `/learning/core/threads/${encodeURIComponent(threadId)}/export?format=obsidian${stageId ? `&stage_id=${encodeURIComponent(stageId)}` : ''}`,
        { timeoutMs: 60000 },
      )
      const { buildZip } = await import('./zip')
      const files = packet.files.map((file) => ({ path: file.path, bytes: new TextEncoder().encode(file.content) }))
      let bytes = packet.markdown_bytes
      if (companions && bytes + packet.attachments.reduce((sum, file) => sum + file.size_bytes, 0) > MAX_DOWNLOAD_BYTES)
        throw new Error('This package exceeds 48 MB. Select a Level or download notes without companions.')
      if (companions) {
        for (const [index, attachment] of packet.attachments.entries()) {
          setMessage(`Downloading companion ${index + 1} of ${packet.attachments.length}…`)
          const blob = await api<Blob>(attachment.url, { responseType: 'blob', timeoutMs: 60000 })
          const expectedType = attachment.path.endsWith('.pdf') ? 'application/pdf' : 'text/html'
          if (blob.type.split(';')[0] !== expectedType)
            throw new Error('A companion is unavailable. Download notes only or try again later.')
          bytes += blob.size
          if (bytes > MAX_DOWNLOAD_BYTES) throw new Error('This package exceeds 48 MB. Select a smaller Level.')
          if (attachment.size_bytes > 0 && blob.size !== attachment.size_bytes)
            throw new Error('A companion changed during download. Please try again.')
          files.push({ path: attachment.path, bytes: new Uint8Array(await blob.arrayBuffer()) })
        }
      }
      const url = URL.createObjectURL(buildZip(files))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = packet.filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
      setMessage(
        `Downloaded ${packet.summary.notes} notes and ${packet.summary.lessons} lessons${companions ? ` with ${packet.attachments.length} companion files` : ''}. Unzip into your Obsidian vault and open Start here.${packet.summary.missing.length ? ' See README for unavailable material.' : ''}`,
      )
    } catch (reason) {
      setMessage('')
      setError(reason instanceof Error ? reason.message : 'Download failed. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <details class="thread-export">
      <summary>Download for Obsidian</summary>
      <div class="thread-export-options">
        <p>
          Linked Markdown notes, personal reflections, and a curriculum index. Includes book and chapter notes. Uses
          material already saved in Compass.
        </p>
        <label>
          Download scope
          <select
            aria-label="Download scope"
            value={stageId}
            disabled={busy}
            onChange={(event) => setStageId(event.currentTarget.value)}
          >
            <option value="">Entire Thread</option>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.title}
              </option>
            ))}
          </select>
        </label>
        <label class="thread-export-checkbox">
          <input
            type="checkbox"
            checked={companions}
            disabled={busy}
            onChange={(event) => setCompanions(event.currentTarget.checked)}
          />{' '}
          Include available HTML/PDF companions (up to 48 MB)
        </label>
        <button type="button" class="button secondary" disabled={busy} onClick={download}>
          {busy ? 'Preparing download…' : 'Download ZIP'}
        </button>
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  )
}
