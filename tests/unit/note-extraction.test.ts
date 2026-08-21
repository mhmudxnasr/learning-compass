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
  srs_drafts: [{
    unit_id: 'unit_1',
    card_type: 'causal',
    question: 'How can strong incentives reduce performance in a multitask role?',
    answer: 'They pull effort toward measured work and away from important unmeasured tasks.',
    source_anchor: 'Multitasking',
  }],
  recall: { status: 'drafted', count: 1 },
}

test('source-note v2 accepts a proportional note with anchored ideas and sparse recall', () => {
  assert.equal(countNoteWords(validBody.note.sections[0].content), 151)
  assert.equal(minimumSourceNoteWords(600), 150)
  assert.deepEqual(validateSourceNoteCompletion({ output_contract: SOURCE_NOTE_CONTRACT }, validBody), [])
})

test('source-note v2 rejects thin templated notes and generic disconnected cards', () => {
  const body = structuredClone(validBody)
  body.note.title = 'Incentives — Source Notes'
  body.note.sections = [
    { section_key: 'foundation', label: 'Foundation', content: 'short' },
    { section_key: 'case_studies', label: 'Case Studies', content: 'short' },
    { section_key: 'exploitation', label: 'Exploitation', content: 'short' },
    { section_key: 'defense', label: 'Defense', content: 'short' },
  ]
  body.extraction.note_word_count = 4
  body.srs_drafts[0] = {
    ...body.srs_drafts[0],
    unit_id: 'missing',
    card_type: 'definition',
    question: 'What are the main takeaways?',
    source_anchor: '',
  }
  const failures = validateSourceNoteCompletion({ output_contract: SOURCE_NOTE_CONTRACT }, body)
  assert.ok(failures.some((failure) => failure.includes('generated suffix')))
  assert.ok(failures.some((failure) => failure.includes('legacy Foundation')))
  assert.ok(failures.some((failure) => failure.includes('too thin')))
  assert.ok(failures.some((failure) => failure.includes('submitted learning unit')))
  assert.ok(failures.some((failure) => failure.includes('durable card_type')))
  assert.ok(failures.some((failure) => failure.includes('generic prompt')))
  assert.ok(failures.some((failure) => failure.includes('source_anchor')))
})

test('source-note v2 allows no cards only with a reason', () => {
  const body = structuredClone(validBody)
  body.srs_drafts = []
  body.recall = { status: 'none', count: 0, reason: 'The source contains context but no durable retrieval target.' }
  assert.deepEqual(validateSourceNoteCompletion({ output_contract: SOURCE_NOTE_CONTRACT }, body), [])
  body.recall = { status: 'none', count: 0, reason: '' }
  assert.ok(validateSourceNoteCompletion({ output_contract: SOURCE_NOTE_CONTRACT }, body).some((failure) => failure.includes('no-card reason')))
})
