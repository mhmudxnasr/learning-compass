import { useState } from 'preact/hooks'
import { api } from '../../api'
import { PathStage } from './types'

export function ThreadAuthoring({ threadId, stage, stageCount, onChanged }: { threadId: string; stage?: PathStage; stageCount: number; onChanged: () => void }) {
  const [stageTitle, setStageTitle] = useState('')
  const [stageObjective, setStageObjective] = useState('')
  const [itemTitle, setItemTitle] = useState('')
  const [itemType, setItemType] = useState('concept')
  const [itemEvidence, setItemEvidence] = useState('explanation')
  const [itemDescription, setItemDescription] = useState('')
  const [working, setWorking] = useState('')
  const [message, setMessage] = useState('')

  const addStage = async (event: Event) => {
    event.preventDefault()
    if (!stageTitle.trim()) return
    setWorking('stage')
    setMessage('Adding level…')
    try {
      await api(`/learning/core/threads/${encodeURIComponent(threadId)}/stages`, { method: 'POST', body: JSON.stringify({ title: stageTitle.trim(), objective: stageObjective.trim(), position: stageCount }) })
      setStageTitle('')
      setStageObjective('')
      setMessage('Level added.')
      onChanged()
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'The level could not be added.')
    } finally {
      setWorking('')
    }
  }

  const addItem = async (event: Event) => {
    event.preventDefault()
    if (!stage || !itemTitle.trim()) return
    setWorking('item')
    setMessage('Adding proof action…')
    try {
      await api(`/learning/core/threads/${encodeURIComponent(threadId)}/stages/${encodeURIComponent(stage.id)}/items`, {
        method: 'POST',
        body: JSON.stringify({ title: itemTitle.trim(), description: itemDescription.trim(), item_type: itemType, evidence_type: itemEvidence, position: stage.items.length }),
      })
      setItemTitle('')
      setItemDescription('')
      setMessage('Proof action added.')
      onChanged()
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'The proof action could not be added.')
    } finally {
      setWorking('')
    }
  }

  return <details class="folio-authoring">
    <summary>Shape this path</summary>
    <div class="folio-authoring-body">
      <form onSubmit={addStage}>
        <div><p class="folio-object-kicker">Curriculum level</p><h4>Add a level</h4><p>Keep each level small enough to finish and verify.</p></div>
        <label>Level title<input value={stageTitle} onInput={(event) => setStageTitle((event.target as HTMLInputElement).value)} required /></label>
        <label>Objective<textarea value={stageObjective} onInput={(event) => setStageObjective((event.target as HTMLTextAreaElement).value)} /></label>
        <button class="button secondary" type="submit" disabled={working === 'stage' || !stageTitle.trim()}>{working === 'stage' ? 'Adding…' : 'Add level'}</button>
      </form>
      <form onSubmit={addItem} class={!stage ? 'folio-form-disabled' : undefined}>
        <div><p class="folio-object-kicker">Proof action</p><h4>{stage ? `Add to ${stage.title}` : 'Select an available level'}</h4><p>Only required proof actions influence stage verification.</p></div>
        <label>Action title<input value={itemTitle} onInput={(event) => setItemTitle((event.target as HTMLInputElement).value)} disabled={!stage} required /></label>
        <label>Action type<select value={itemType} onChange={(event) => setItemType((event.target as HTMLSelectElement).value)} disabled={!stage}><option value="concept">Concept</option><option value="recall_prompt">Free recall</option><option value="exercise">Exercise</option><option value="application">Application</option><option value="reflection">Reflection</option></select></label>
        <label>Evidence type<select value={itemEvidence} onChange={(event) => setItemEvidence((event.target as HTMLSelectElement).value)} disabled={!stage}><option value="explanation">Explanation</option><option value="free_recall">Free recall</option><option value="transfer">Transfer</option><option value="application">Application</option><option value="decision">Decision</option><option value="artifact">Artifact</option></select></label>
        <label>Description<textarea value={itemDescription} onInput={(event) => setItemDescription((event.target as HTMLTextAreaElement).value)} disabled={!stage} /></label>
        <button class="button secondary" type="submit" disabled={!stage || working === 'item' || !itemTitle.trim()}>{working === 'item' ? 'Adding…' : 'Add proof action'}</button>
      </form>
      {message && <output aria-live="polite">{message}</output>}
    </div>
  </details>
}
