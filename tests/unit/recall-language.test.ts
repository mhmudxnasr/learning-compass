import assert from 'node:assert/strict'
import test from 'node:test'
import { isArabicRecallText, validateArabicRecall } from '../../src/services/recall-language.ts'

test('recall accepts Arabic with precise technical terms', () => {
  assert.equal(isArabicRecallText('إيه الفرق بين BATNA والبديل الضعيف؟'), true)
  assert.equal(
    validateArabicRecall('إيه الفرق بين BATNA والبديل الضعيف؟', 'BATNA هو أفضل بديل متاح لو لم يتم الاتفاق.'),
    null,
  )
})

test('recall rejects English questions or answers', () => {
  assert.match(validateArabicRecall('What is BATNA?', 'هو أفضل بديل متاح.') || '', /primarily in Arabic/)
  assert.match(
    validateArabicRecall('إيه معنى BATNA؟', 'Best alternative to a negotiated agreement.') || '',
    /primarily in Arabic/,
  )
})
