import { itemHref, useRoute } from '../app/router'

export type ItemSection = { key: string; label: string; count?: number }

export function ItemParentLinks({
  sourceId,
  noteId,
  threadId,
}: {
  sourceId?: string | null
  noteId?: string | null
  threadId?: string | null
}) {
  return (
    <nav class="item-parent-links" aria-label="Related material">
      {sourceId && (
        <>
          <a class="folio-button" href={itemHref({ id: sourceId })}>
            Open source item
          </a>
          <a class="folio-button" href={itemHref({ id: sourceId }, 'files')}>
            Source files
          </a>
          <a class="folio-button" href={itemHref({ id: sourceId }, 'notes')}>
            Source notes
          </a>
        </>
      )}
      {noteId && (
        <a class="folio-button" href={`#/learn/note/${encodeURIComponent(noteId)}`}>
          Open source note
        </a>
      )}
      {threadId && (
        <a class="folio-button" href={`#/learn/thread/${encodeURIComponent(threadId)}`}>
          Open Thread
        </a>
      )}
    </nav>
  )
}

export function useItemSection(sections: ItemSection[], anchorSection = 'notes') {
  const route = useRoute()
  const requested = route.query.get('tab') || (route.query.has('annotation') ? anchorSection : 'overview')
  return sections.some((section) => section.key === requested) ? requested : 'overview'
}

export function ItemSections({
  sections,
  active,
  label = 'Item sections',
}: {
  sections: ItemSection[]
  active: string
  label?: string
}) {
  const route = useRoute()
  const path = route.canonical.split('?')[0]
  return (
    <nav class="item-sections" aria-label={label}>
      {sections.map((section) => {
        const query = new URLSearchParams(route.query)
        query.set('tab', section.key)
        if (section.key !== 'notes' && section.key !== 'study') query.delete('annotation')
        return (
          <a
            key={section.key}
            href={`#${path}?${query}`}
            class={active === section.key ? 'active' : ''}
            aria-current={active === section.key ? 'page' : undefined}
          >
            <span>{section.label}</span>
            {section.count != null && <small>{section.count}</small>}
          </a>
        )
      })}
    </nav>
  )
}
