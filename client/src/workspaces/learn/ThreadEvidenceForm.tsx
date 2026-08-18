import { useEffect, useRef, useState } from 'preact/hooks'
import { api } from '../../api'
import { evidenceLabel, itemLabel } from './helpers'
import { ThreadItem } from './types'

type ThreadEvidenceFormProps = {
  threadId: string
  stageId: string
  item: ThreadItem
  onSaved: () => void
  onCancel: () => void
}
export function ThreadEvidenceForm({ threadId, stageId, item, onSaved, onCancel }: ThreadEvidenceFormProps) {
  const [response, setResponse] = useState('')
  const [score, setScore] = useState('1')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [item.id])

  const saveEvidence = async (event: Event) => {
    event.preventDefault()
    if (!response.trim()) return
    setWorking(true)
    setMessage('Recording evidence…')
    try {
      await api('/learning/core/evidence', {
        method: 'POST',
        body: JSON.stringify({
          thread_id: threadId,
          stage_id: stageId,
          evidence_type: item.evidence_type || (item.item_type === 'recall_prompt' ? 'free_recall' : 'explanation'),
          result: 'recorded',
          response: response.trim(),
          prompt: item.title,
          score: Number(score),
          item_id: item.id,
        }),
      })
      onSaved()
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'The evidence could not be recorded.')
      setWorking(false)
    }
  }

  return <form class="folio-evidence-form" onSubmit={saveEvidence} aria-labelledby={`evidence-title-${item.id}`}>
    <div class="folio-form-head"><div><p class="folio-object-kicker">{itemLabel(item.item_type)}</p><h4 id={`evidence-title-${item.id}`}>{item.title}</h4></div><button class="button quiet" type="button" onClick={onCancel} disabled={working}>Close</button></div>
    <p class="folio-form-instruction">Write the smallest answer that would let you check this later. This becomes learning evidence, not a source completion mark.</p>
    <label>Evidence response<textarea ref={textareaRef} value={response} onInput={(event) => setResponse((event.target as HTMLTextAreaElement).value)} aria-describedby={`evidence-help-${item.id}`} required /></label>
    <span id={`evidence-help-${item.id}`} class="folio-help">Evidence type: {evidenceLabel(item.evidence_type || (item.item_type === 'recall_prompt' ? 'free_recall' : 'explanation'))}.</span>
    <label>Confidence in this evidence<select value={score} onChange={(event) => setScore((event.target as HTMLSelectElement).value)}><option value="1">Clear enough to verify</option><option value="0.8">Mostly clear</option><option value="0.6">Partial / needs another pass</option><option value="0.4">Uncertain</option></select></label>
    <div class="folio-form-actions"><button class="button primary folio-primary" type="submit" disabled={working || !response.trim()}>{working ? 'Recording…' : 'Record evidence'}</button>{message && <output aria-live="polite">{message}</output>}</div>
  </form>
}
