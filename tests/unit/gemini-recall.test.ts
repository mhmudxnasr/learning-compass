import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeCards } from '../../src/services/gemini-recall.ts'

test('sanitizeCards filters out generic boilerplate and meta-questions', () => {
  const input = [
    {
      question: 'What is the primary governing principle of Source Notes?',
      answer: 'The core framework establishes systematic mechanisms that determine outcomes.',
      topic: 'general'
    },
    {
      question: 'How can one defend against exploitative patterns identified in Source Notes?',
      answer: 'By implementing explicit guardrails and structured countermeasures.',
      topic: 'defense'
    },
    {
      question: 'Under what condition does a feedback loop shift from stabilizing to runaway escalation?',
      answer: 'When the loop gain exceeds 1.0 and delays in the sensor state prevent timely negative damping.',
      topic: 'Systems'
    }
  ]

  const output = sanitizeCards(input, 'Default')
  assert.equal(output.length, 1)
  assert.equal(output[0].topic, 'Systems')
  assert.ok(output[0].question.includes('runaway escalation'))
})

test('sanitizeCards handles empty and invalid inputs gracefully', () => {
  assert.deepEqual(sanitizeCards([]), [])
  assert.deepEqual(sanitizeCards(null as any), [])
  assert.deepEqual(sanitizeCards([{ question: 'tiny', answer: 'x' }]), [])
})
