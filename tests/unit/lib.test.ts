import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeUrlForDedup } from '../../src/lib.ts'

test('URL normalization never converts non-YouTube paths containing v/', () => {
  const url = 'https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=919754'
  assert.equal(normalizeUrlForDedup(url), url)
})

test('URL normalization still canonicalizes real YouTube URLs', () => {
  assert.equal(normalizeUrlForDedup('https://youtu.be/7CJQYjNJtmg?t=12'), 'https://www.youtube.com/watch?v=7CJQYjNJtmg')
})
