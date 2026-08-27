import { createCapture } from './capture'
import { ParsedFeed, parseFeed, validateFeedUrl } from './rss-parser'
import { redactSensitiveText } from '../lib'

type FeedSource = {
  id: string
  feed_url: string
  title: string
  site_url: string | null
  etag: string | null
  last_modified: string | null
  branch_id: string
}

type FeedBranch = { id: string; label: string }

async function fetchFeed(url: string, conditional?: { etag?: string | null; lastModified?: string | null }) {
  const headers = new Headers({ accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9' })
  if (conditional?.etag) headers.set('if-none-match', conditional.etag)
  if (conditional?.lastModified) headers.set('if-modified-since', conditional.lastModified)
  let currentUrl = validateFeedUrl(url)
  let response: Response | null = null
  for (let redirect = 0; redirect <= 5; redirect++) {
    response = await fetch(currentUrl, { headers, redirect: 'manual', signal: AbortSignal.timeout(15_000) })
    if (![301, 302, 303, 307, 308].includes(response.status)) break
    const location = response.headers.get('location')
    if (!location) throw new Error('Feed redirect has no destination')
    currentUrl = validateFeedUrl(new URL(location, currentUrl).toString())
    if (redirect === 5) throw new Error('Feed has too many redirects')
  }
  if (!response) throw new Error('Feed could not be read')
  if (response.status === 304) return { unchanged: true as const, response }
  if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}`)
  const size = Number(response.headers.get('content-length') || 0)
  if (size > 2_000_000) throw new Error('Feed is larger than 2 MB')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Feed returned no content')
  const decoder = new TextDecoder()
  let bytes = 0
  let xml = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    bytes += chunk.value.byteLength
    if (bytes > 2_000_000) {
      await reader.cancel()
      throw new Error('Feed is larger than 2 MB')
    }
    xml += decoder.decode(chunk.value, { stream: true })
  }
  xml += decoder.decode()
  return { unchanged: false as const, response, parsed: parseFeed(xml, currentUrl) }
}

async function importEntries(DB: D1Database, feed: FeedSource, parsed: ParsedFeed, maxEntries = parsed.entries.length) {
  if (!feed.branch_id) throw new Error('Feed subscription has no verified default branch')
  let imported = 0
  let duplicates = 0
  let branchConflicts = 0
  const entries = parsed.entries.slice(0, maxEntries)
  for (const entry of entries) {
    const seen = await DB.prepare('SELECT 1 FROM feed_entries WHERE feed_id=? AND guid=?').bind(feed.id, entry.guid).first()
    if (seen) { duplicates++; continue }
    // Feed refreshes populate the Feed stream and Library; they never create a Queue commitment.
    const capture = await createCapture(DB, {
      source: entry.url,
      title: entry.title,
      initialLearningState: 'captured',
      branch: {
        id: feed.branch_id,
        confidence: 'high',
        reason: `Inherited from the reviewed RSS subscription “${parsed.title}”.`,
        source: `rss_feed:${feed.id}`,
      },
    })
    if ('branchConflict' in capture && capture.branchConflict) branchConflicts += 1
    const metadata = JSON.stringify({ rss_feed_id: feed.id, rss_feed_title: parsed.title, rss_guid: entry.guid, published_at: entry.publishedAt })
    await DB.batch([
      DB.prepare(`UPDATE recommendations SET creator=COALESCE(NULLIF(creator,''),?),why_this=COALESCE(NULLIF(why_this,''),?),content_type='article',updated_at=datetime('now') WHERE id=?`)
        .bind(entry.author, entry.summary, capture.id),
      DB.prepare(`UPDATE recommendation_meta SET source_metadata_json=json_patch(COALESCE(source_metadata_json,'{}'),?),updated_at=datetime('now') WHERE recommendation_id=?`)
        .bind(metadata, capture.id),
      DB.prepare(`INSERT OR IGNORE INTO feed_entries (feed_id,guid,recommendation_id,published_at) VALUES (?,?,?,?)`)
        .bind(feed.id, entry.guid, capture.id, entry.publishedAt),
    ])
    if (capture.duplicate) duplicates++
    else imported++
  }
  return { imported, duplicates, branch_conflicts: branchConflicts, found: entries.length }
}

async function assertUsableFeedBranch(DB: D1Database, branchId: string) {
  if (!branchId) throw new Error('Feed subscription default branch is no longer valid')
  const branch = await DB.prepare(`SELECT 1 FROM tree_nodes n
    WHERE n.id=? AND n.type='branch'
      AND (n.parent_id='root' OR EXISTS (SELECT 1 FROM tree_nodes p WHERE p.id=n.parent_id AND p.type='category'))
      AND lower(COALESCE(n.status,''))!='pruned'`).bind(branchId).first()
  if (!branch) throw new Error('Feed subscription default branch is no longer valid')
}

export async function addFeed(DB: D1Database, rawUrl: string, branch: FeedBranch, maxEntries?: number) {
  const feedUrl = validateFeedUrl(rawUrl.trim())
  const existing = await DB.prepare('SELECT id FROM feed_sources WHERE feed_url=?').bind(feedUrl).first<{ id: string }>()
  if (existing) throw new Error('This feed is already subscribed')
  const fetched = await fetchFeed(feedUrl)
  if (fetched.unchanged) throw new Error('Feed could not be read')
  const id = `feed_${crypto.randomUUID()}`
  await DB.prepare(`INSERT INTO feed_sources (id,feed_url,title,site_url,etag,last_modified,branch_id,last_checked_at,last_success_at)
    VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))`).bind(
    id,
    feedUrl,
    fetched.parsed.title,
    fetched.parsed.siteUrl,
    fetched.response.headers.get('etag'),
    fetched.response.headers.get('last-modified'),
    branch.id,
  ).run()
  const feed = { id, feed_url: feedUrl, title: fetched.parsed.title, site_url: fetched.parsed.siteUrl, etag: null, last_modified: null, branch_id: branch.id }
  const result = await importEntries(DB, feed, fetched.parsed, maxEntries)
  return { feed: { ...feed, branch_label: branch.label, last_checked_at: new Date().toISOString(), last_error: null }, ...result }
}

export async function syncFeed(DB: D1Database, feed: FeedSource, maxEntries?: number) {
  try {
    await assertUsableFeedBranch(DB, feed.branch_id)
    const fetched = await fetchFeed(feed.feed_url, { etag: feed.etag, lastModified: feed.last_modified })
    if (fetched.unchanged) {
      await DB.prepare(`UPDATE feed_sources SET last_checked_at=datetime('now'),last_success_at=datetime('now'),last_error=NULL,updated_at=datetime('now') WHERE id=?`).bind(feed.id).run()
      return { feedId: feed.id, imported: 0, duplicates: 0, found: 0, unchanged: true }
    }
    const result = await importEntries(DB, feed, fetched.parsed, maxEntries)
    await DB.prepare(`UPDATE feed_sources SET title=?,site_url=?,etag=?,last_modified=?,last_checked_at=datetime('now'),last_success_at=datetime('now'),last_error=NULL,updated_at=datetime('now') WHERE id=?`).bind(
      fetched.parsed.title,
      fetched.parsed.siteUrl,
      fetched.response.headers.get('etag'),
      fetched.response.headers.get('last-modified'),
      feed.id,
    ).run()
    return { feedId: feed.id, ...result, unchanged: false }
  } catch (error) {
    const message = error instanceof Error ? redactSensitiveText(error, 500) : 'Feed check failed'
    await DB.prepare(`UPDATE feed_sources SET last_checked_at=datetime('now'),last_error=?,updated_at=datetime('now') WHERE id=?`).bind(message.slice(0, 500), feed.id).run()
    throw error
  }
}

export async function syncAllFeeds(DB: D1Database, maxEntriesPerFeed?: number) {
  const rows = await DB.prepare(`SELECT id,feed_url,title,site_url,etag,last_modified,branch_id FROM feed_sources WHERE enabled=1 ORDER BY COALESCE(last_checked_at,'') LIMIT 50`).all<FeedSource>()
  const results = []
  for (const feed of rows.results || []) {
    try { results.push(await syncFeed(DB, feed, maxEntriesPerFeed)) }
    catch (error) { results.push({ feedId: feed.id, error: error instanceof Error ? redactSensitiveText(error, 500) : 'Feed check failed' }) }
  }
  return results
}
