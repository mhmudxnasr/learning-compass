import { Icon } from '../components/Icon'
import type { HomeSelection } from '../workspaces/HomeWorkspace'
import type { LibrarySelection } from '../workspaces/library/types'

export type MapSelection = {
  type: 'node' | 'branch'
  id: string
  title: string
  data: Record<string, unknown>
  route: string
}

export type InspectorSelection = HomeSelection | LibrarySelection | MapSelection

function valueLabel(value: unknown) {
  if (value == null || value === '') return 'Not recorded'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function selectionType(selection: InspectorSelection) {
  if (selection.type === 'node') return 'Map node'
  if (selection.type === 'branch') return 'Map branch'
  if (selection.type === 'artifact') return 'Artifact'
  if (selection.type === 'book') return 'Book'
  if (selection.type === 'collection') return 'Collection'
  if (selection.type === 'thread') return 'Learning Thread'
  return 'Source'
}

function selectionFacts(selection: InspectorSelection) {
  const data = selection.data || {}
  if (selection.type === 'source' || selection.type === 'thread') {
    const rawBranch = data.branch
    const branch = typeof rawBranch === 'string'
      ? { id: rawBranch, label: rawBranch, round: data.round_label || data.round }
      : rawBranch || (data.branch_id ? { id: data.branch_id, label: data.branch_label || data.branch_id, round: data.round_label || data.round } : null)
    return [
      ['State', data.learning_state || data.status],
      ['Creator', data.creator || data.author],
      ['Format', data.content_type || data.format],
      ['Branch', branch ? (branch.label || branch.id) : undefined],
      ['Round', branch?.round || data.round_label || data.round],
      ['Thread', data.thread_title || data.thread_id],
    ] as Array<[string, unknown]>
  }
  if (selection.type === 'artifact') {
    return [
      ['Filename', data.filename],
      ['Type', data.media_type],
      ['Size', data.size_bytes ? `${data.size_bytes} bytes` : undefined],
      ['Created', data.created_at],
    ] as Array<[string, unknown]>
  }
  if (selection.type === 'book') {
    return [
      ['Author', data.author || data.creator],
      ['ISBN', data.isbn],
      ['Chapters', Array.isArray(data.chapters) ? data.chapters.length : undefined],
      ['State', data.status || data.learning_state],
    ] as Array<[string, unknown]>
  }
  if (selection.type === 'collection') {
    return [
      ['Sources', data.source_count || (Array.isArray(data.sources) ? data.sources.length : undefined)],
      ['Scope', data.scope],
      ['Created', data.created_at],
    ] as Array<[string, unknown]>
  }
  return [
    ['Object ID', selection.id],
    ['Route', selection.route],
  ] as Array<[string, unknown]>
}

export function Inspector({ selection, onClose }: { selection: InspectorSelection; onClose: () => void }) {
  const facts = selectionFacts(selection)
  const data = (selection?.data || {}) as Record<string, unknown>
  const description = data.context_brief || data.why_this || data.description
  return <div class="desk-inspector">
    <header class="inspector-head">
      <div>
        <span class="desk-card-meta">{selectionType(selection)} · {selection.id}</span>
        <h2 class="desk-title">{selection.title}</h2>
      </div>
      <button class="icon-button" type="button" onClick={onClose} aria-label="Close inspector"><Icon name="close"/></button>
    </header>
    {description && <p class="desk-desc">{valueLabel(description)}</p>}
    <section class="desk-section" aria-labelledby="inspector-facts-title">
      <div class="desk-section-head"><h3 id="inspector-facts-title">Properties</h3><span>Canonical record</span></div>
      <dl class="inspector-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{valueLabel(value)}</dd></div>)}</dl>
    </section>
    <section class="desk-section" aria-labelledby="inspector-route-title">
      <div class="desk-section-head"><h3 id="inspector-route-title">Object route</h3></div>
      <p class="desk-desc inspector-route-copy">This selection stays addressable while you move through its owning workspace.</p>
      <code class="inspector-route">{selection.route}</code>
    </section>
  </div>
}
