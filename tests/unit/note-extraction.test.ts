import assert from 'node:assert/strict'
import test from 'node:test'
import { countNoteWords, minimumSourceNoteWords, SOURCE_NOTE_CONTRACT, validateSourceNoteCompletion } from '../../src/services/note-extraction.ts'

const validBody = {
  extraction: {
    contract: SOURCE_NOTE_CONTRACT,
    complete: true,
    adapter: 'html_readability',
    source_hash: 'a'.repeat(64),
    source_word_count: 600,
    note_word_count: 151,
    coverage_status: 'complete',
  },
  note: {
    title: 'Why incentives fail in multitask work',
    kind: 'guide',
    sections: [{
      section_key: 'body',
      label: 'Source note',
      content: Array.from({ length: 151 }, (_, index) => `word${index}`).join(' '),
    }],
  },
  learning_units: [{
    id: 'unit_1',
    unit_type: 'claim',
    statement: 'Strong incentives can redirect effort toward measured tasks.',
    anchors: [{ anchor_type: 'section', locator: 'Multitasking', excerpt: 'Measured tasks attract effort.' }],
  }],
}

test('source-note v2 accepts a proportional note with anchored ideas and no generated recall', () => {
  assert.equal(countNoteWords(validBody.note.sections[0].content), 151)
  assert.equal(minimumSourceNoteWords(600), 150)
  assert.deepEqual(validateSourceNoteCompletion({ output_contract: SOURCE_NOTE_CONTRACT }, validBody), [])
})

test('source-note v2 rejects thin templated notes', () => {
  const body = structuredClone(validBody)
  body.note.title = 'Incentives — Source Notes'
  body.note.sections = [
    { section_key: 'foundation', label: 'Foundation', content: 'short' },
    { section_key: 'case_studies', label: 'Case Studies', content: 'short' },
    { section_key: 'exploitation', label: 'Exploitation', content: 'short' },
    { section_key: 'defense', label: 'Defense', content: 'short' },
  ]
  body.extraction.note_word_count = 4
  const failures = validateSourceNoteCompletion({ output_contract: SOURCE_NOTE_CONTRACT }, body)
  assert.ok(failures.some((failure) => failure.includes('generated suffix')))
  assert.ok(failures.some((failure) => failure.includes('legacy Foundation')))
  assert.ok(failures.some((failure) => failure.includes('too thin')))
})

test('source-note v2 does not require a recall receipt', () => {
  const body = structuredClone(validBody)
  assert.deepEqual(validateSourceNoteCompletion({ output_contract: SOURCE_NOTE_CONTRACT }, body), [])
})

test('source-note v2 rejects all automatically generated recall drafts', () => {
  const body = structuredClone(validBody)
  body.srs_drafts = [{ question: 'سؤال تلقائي؟', answer: 'إجابة تلقائية.' }]
  assert.ok(validateSourceNoteCompletion({ output_contract: SOURCE_NOTE_CONTRACT }, body).some((failure) => failure.includes('automated recall drafting is disabled')))
})
