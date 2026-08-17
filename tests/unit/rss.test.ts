import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parseFeed, validateFeedUrl } from '../../src/services/rss-parser.ts'

test('parses RSS entries and resolves relative article links', () => {
  const feed = parseFeed(`<?xml version="1.0"?>
    <rss><channel><title>Example Notes</title><link>https://example.com</link>
      <item><title>First &amp; best</title><link>/posts/first</link><guid>a-1</guid>
        <dc:creator>Mahmood</dc:creator><description><![CDATA[<p>A useful idea.</p>]]></description>
        <pubDate>Wed, 29 Jul 2026 10:00:00 GMT</pubDate></item>
    </channel></rss>`, 'https://example.com/feed.xml')
  assert.equal(feed.title, 'Example Notes')
  assert.equal(feed.siteUrl, 'https://example.com/')
  assert.deepEqual(feed.entries[0], {
    guid: 'a-1',
    title: 'First & best',
    url: 'https://example.com/posts/first',
    author: 'Mahmood',
    summary: 'A useful idea.',
    publishedAt: '2026-07-29T10:00:00.000Z',
  })
})

test('ignores self-closing namespaced links before the RSS channel link', () => {
  const feed = parseFeed(`<rss xmlns:atom="http://www.w3.org/2005/Atom"><channel>
    <title>AI News</title>
    <atom:link href="https://example.com/feed/" rel="self" type="application/rss+xml" />
    <link>https://example.com/ai/</link>
    <item><title>First story</title><link>https://example.com/ai/first</link></item>
  </channel></rss>`, 'https://example.com/feed')
  assert.equal(feed.siteUrl, 'https://example.com/ai/')
})

test('parses Atom alternate links', () => {
  const feed = parseFeed(`<feed><title>Atom Source</title><link href="https://example.org"/>
    <entry><id>tag:example.org,1</id><title>New entry</title><link rel="alternate" href="/new"/>
    <author>Writer</author><summary>Short summary</summary><updated>2026-07-29T12:00:00Z</updated></entry></feed>`, 'https://example.org/atom.xml')
  assert.equal(feed.entries[0].url, 'https://example.org/new')
  assert.equal(feed.entries[0].guid, 'tag:example.org,1')
})

test('rejects local and private feed URLs', () => {
  for (const url of ['http://localhost/feed', 'http://127.0.0.1/rss', 'http://192.168.1.2/feed', 'http://[::1]/feed']) {
    assert.throws(() => validateFeedUrl(url), /not allowed/)
  }
  assert.equal(validateFeedUrl('https://example.com/feed.xml'), 'https://example.com/feed.xml')
})

test('RSS import explicitly requests Inbox state rather than Queue state', () => {
  const source = readFileSync(new URL('../../src/services/rss.ts', import.meta.url), 'utf8')
  assert.match(source, /createInboxCapture\(DB, \{ source: entry\.url, title: entry\.title, initialLearningState: 'inbox' \}\)/)
})
