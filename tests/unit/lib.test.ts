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

test('URL normalization is idempotent after removing tracking from a root or directory URL', () => {
  for (const url of ['https://example.com/?utm_source=share', 'https://example.com/article/?ref=android']) {
    const normalized = normalizeUrlForDedup(url)
    assert.equal(normalizeUrlForDedup(normalized), normalized)
  }
})
