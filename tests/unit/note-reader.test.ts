import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildNoteReaderDocument,
  directionForText,
  languageForText,
  parseNoteBlocks,
} from '../../client/src/workspaces/learn/noteReader.ts'

test('bilingual reading language follows text rather than the layout direction', () => {
  assert.equal(languageForText('English explanation.'), 'en')
  assert.equal(languageForText('السلوك البشري (Behaviorism)'), 'ar')
  assert.equal(languageForText('עברית'), undefined)
  assert.equal(languageForText('123 ١٢٣'), undefined)
})

test('note reader removes Obsidian front matter and promotes the embedded source link', () => {
  const document = buildNoteReaderDocument({
    id: 'note_1',
    title: 'Skinner on Behaviorism',
    sections: [
      {
        section_key: 'body',
        label: 'Notes',
        direction: 'auto',
        content: `---
type: notes tags: people/Skinner status/completed
subject/Behavioral-Psychology ---

YT-Vid (https://www.youtube.com/watch?v=example)

يعرض هذا الفيديو مقابلة تعليمية مع سكينر.

1. **تحديد السلوك** يبدأ من أثر البيئة.
2. التعزيز الإيجابي يشكل السلوك.`,
      },
    ],
  })

  assert.equal(document.contentSourceUrl, 'https://www.youtube.com/watch?v=example')
  assert.equal(document.sections.length, 1)
  assert.equal(document.sections[0].direction, 'rtl')
  assert.ok(document.sections[0].blocks.every((block) => !JSON.stringify(block).includes('status/completed')))
  const list = document.sections[0].blocks.find((block) => block.kind === 'list')
  assert.deepEqual(list?.kind === 'list' ? list.items : [], [
    '**تحديد السلوك** يبدأ من أثر البيئة.',
    'التعزيز الإيجابي يشكل السلوك.',
  ])
  assert.equal(list?.kind === 'list' ? list.start : undefined, 1)
})

test('reader preserves Markdown structure and chooses direction per block', () => {
  const blocks = parseNoteBlocks('## Key idea\n\nEnglish context.\n\n> خلاصة عربية مهمة', 'auto')
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ['heading', 'paragraph', 'quote'],
  )
  assert.equal(blocks[0].direction, 'ltr')
  assert.equal(blocks[2].direction, 'rtl')
  assert.equal(directionForText('السلوك البشري (Behaviorism)'), 'rtl')
})

test('reader does not turn ordinary prose labels into generated cards', () => {
  const blocks = parseNoteBlocks(
    'Risk sharing: The contract allocates uncertainty between both sides.\n\nStory: This remains ordinary source prose.',
  )
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ['paragraph', 'paragraph'],
  )
  assert.equal(
    blocks.some((block) => ['definition', 'case_study', 'synthesis'].includes((block as any).kind)),
    false,
  )
})
test('reader separates receipts without changing canonical text or language order', () => {
  const sections = [
    {
      section_key: 'claim',
      label: 'Claim and explanation',
      content: 'A precise claim.\n\nشرح المعنى بالعربي.',
      direction: 'auto',
    },
    {
      section_key: 'extraction_receipt',
      label: 'Extraction receipt',
      content: '{"contract":"extraction/v1","hash":"abc"}',
      direction: 'ltr',
    },
  ]
  const before = JSON.stringify(sections)
  const document = buildNoteReaderDocument({ id: 'receipt-test', title: 'A note', sections })
  assert.equal(document.sections.length, 1)
  assert.deepEqual(
    document.sections[0].blocks.map((block) => block.direction),
    ['ltr', 'rtl'],
  )
  assert.deepEqual(document.provenance, [sections[1]])
  assert.ok(document.outline.every((entry) => entry.sectionKey !== 'extraction_receipt'))
  assert.equal(JSON.stringify(sections), before)
  assert.equal(document.wordCount, 6)
})
