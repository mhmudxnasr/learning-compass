import type { ComponentChildren } from 'preact'
import { languageForText, parseNoteBlocks, type NoteReaderBlock } from './noteReader'

function inlineMarkdown(text: string): ComponentChildren[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*[^*]+\*)/g
  return text
    .split(pattern)
    .filter(Boolean)
    .map((part, index) => {
      const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/)
      if (link)
        return (
          <a key={index} href={link[2]} target="_blank" rel="noreferrer">
            {link[1]}
          </a>
        )
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
      if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>
      if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>
      return part
    })
}

export function ReaderBlockComponent({ block }: { block: NoteReaderBlock }) {
  const language = languageForText(block.kind === 'list' ? block.items.join(' ') : block.text)
  if (block.kind === 'heading') {
    const Tag = block.level === 2 ? 'h2' : block.level === 3 ? 'h3' : 'h4'
    return (
      <Tag id={block.id} class={`reader-heading level-${block.level}`} dir={block.direction} lang={language}>
        {inlineMarkdown(block.text)}
      </Tag>
    )
  }
  if (block.kind === 'quote')
    return (
      <blockquote class="reader-blockquote" dir={block.direction} lang={language}>
        {inlineMarkdown(block.text)}
      </blockquote>
    )
  if (block.kind === 'list') {
    const items = block.items.map((item, index) => (
      <li key={index} lang={languageForText(item)}>
        {inlineMarkdown(item)}
      </li>
    ))
    return block.ordered ? (
      <ol class="reader-list" dir={block.direction} lang={language} start={block.start}>
        {items}
      </ol>
    ) : (
      <ul class="reader-list" dir={block.direction} lang={language}>
        {items}
      </ul>
    )
  }
  return (
    <p class="reader-paragraph" dir={block.direction} lang={language}>
      {inlineMarkdown(block.text)}
    </p>
  )
}

export function StudyText({ text }: { text: string }) {
  return (
    <div class="study-text">
      {parseNoteBlocks(text, 'auto', 'lesson').map((block, index) => (
        <ReaderBlockComponent key={index} block={block} />
      ))}
    </div>
  )
}
