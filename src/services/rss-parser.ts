export type FeedEntry = {
  guid: string
  title: string
  url: string
  author: string | null
  summary: string | null
  publishedAt: string | null
}

export type ParsedFeed = {
  title: string
  siteUrl: string | null
  entries: FeedEntry[]
}

const decodeXml = (value: string) => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&(?:nbsp|#160);/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&apos;/gi, "'")

const tag = (block: string, names: string[]) => {
  for (const name of names) {
    const qualified = name.includes(':') ? name.replace(':', '\\:') : `(?:[\\w.-]+:)?${name}`
    const match = block.match(new RegExp(`<${qualified}\\b(?![^>]*\\/\\s*>)[^>]*>([\\s\\S]*?)<\\/${qualified}\\s*>`, 'i'))
    if (match) return decodeXml(match[1]).trim()
  }
  return ''
}

const cleanText = (value: string, max = 500) => decodeXml(value)
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max)

const absoluteHttpUrl = (value: string, base: string) => {
  try {
    const url = new URL(value.trim(), base)
    return /^https?:$/.test(url.protocol) ? url.toString() : ''
  } catch { return '' }
}

const atomLink = (block: string) => {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)]
  for (const link of links) {
    const attrs = link[1]
    const href = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]
    const rel = attrs.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1]
    if (href && (!rel || rel === 'alternate')) return decodeXml(href)
  }
  return ''
}

const isoDate = (value: string) => {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

export function parseFeed(xml: string, feedUrl: string): ParsedFeed {
  const itemBlocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi)].map((match) => match[1])
  const entryBlocks = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry\s*>/gi)].map((match) => match[1])
  const blocks = itemBlocks.length ? itemBlocks : entryBlocks
  if (!blocks.length) throw new Error('Feed contains no RSS or Atom entries')

  const header = xml.slice(0, Math.max(0, xml.search(/<(?:item|entry)\b/i)))
  const feedTitle = cleanText(tag(header, ['title']), 160) || new URL(feedUrl).hostname
  const rssSiteUrl = tag(header, ['link'])
  const siteUrl = absoluteHttpUrl(atomLink(header) || rssSiteUrl, feedUrl) || null
  const entries: FeedEntry[] = []

  for (const block of blocks) {
    const url = absoluteHttpUrl(atomLink(block) || tag(block, ['link']), feedUrl)
    const title = cleanText(tag(block, ['title']), 300)
    if (!url || !title) continue
    const guid = cleanText(tag(block, ['guid', 'id']), 500) || url
    const summary = cleanText(tag(block, ['description', 'summary', 'content:encoded', 'content']), 500) || null
    const author = cleanText(tag(block, ['dc:creator', 'author', 'creator']), 160) || null
    entries.push({
      guid,
      title,
      url,
      author,
      summary,
      publishedAt: isoDate(tag(block, ['pubDate', 'published', 'updated', 'date'])),
    })
  }

  if (!entries.length) throw new Error('Feed entries have no usable article links')
  return { title: feedTitle, siteUrl, entries: entries.slice(0, 20) }
}

export function validateFeedUrl(value: string) {
  if (typeof value !== 'string' || value.length === 0 || value.length >= 2048 || !/^https?:\/\/[^\s<>"']+$/i.test(value)) {
    throw new Error('Enter a valid HTTP or HTTPS feed URL')
  }
  const url = new URL(value)
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const parts = host.split('.').map(Number)
  const privateIpv4 = parts.length === 4 && parts.every(Number.isInteger) && (
    parts[0] === 0 || parts[0] === 10 || parts[0] === 127 ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) || parts[0] >= 224
  )
  const privateIpv6 = host === '::1' || host === '::' || /^(?:fc|fd|fe8|fe9|fea|feb)/i.test(host)
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || privateIpv4 || privateIpv6) {
    throw new Error('Private or local feed URLs are not allowed')
  }
  url.hash = ''
  return url.toString()
}
