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

test('RSS import explicitly requests captured state rather than Queue state', () => {
  const source = readFileSync(new URL('../../src/services/rss.ts', import.meta.url), 'utf8')
  const captureApi = readFileSync(new URL('../../src/api/capture.ts', import.meta.url), 'utf8')
  assert.match(source, /initialLearningState: 'captured'/)
  assert.match(source, /id: feed\.branch_id/)
  assert.match(source, /source: `rss_feed:\$\{feed\.id\}`/)
  assert.match(source, /branch_conflicts: branchConflicts/)
  assert.match(source, /Feed subscription default branch is no longer valid/)
  assert.match(source, /INSERT INTO feed_sources \(id,feed_url,title,site_url,etag,last_modified,branch_id/)
  assert.match(captureApi, /branch_conflicts: results\.reduce/)
})

test('RSS schema backfills current feeds and enforces a reviewed branch default', () => {
  const migration = readFileSync(new URL('../../migrations/0063_data_trust_and_feed_branches.sql', import.meta.url), 'utf8')
  assert.match(migration, /ALTER TABLE feed_sources ADD COLUMN branch_id/)
  assert.match(migration, /ON DELETE RESTRICT/)
  assert.match(migration, /rss_feed_migration_0063/)
  assert.match(migration, /feed_sources_branch_required_insert/)
  assert.match(migration, /p\.type = 'category'/)
  assert.match(migration, /feed source requires a verified non-pruned branch/)
})
