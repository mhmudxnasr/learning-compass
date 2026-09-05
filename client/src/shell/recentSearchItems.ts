export type RecentSearchItem = { href: string; title: string; meta: string }

const storageKey = 'compass-recent-search-items'
const isRecentItem = (item: unknown): item is RecentSearchItem => {
  if (!item || typeof item !== 'object') return false
  const value = item as RecentSearchItem
  return (
    typeof value.href === 'string' &&
    /^#\/(?:library|learn|map)\/(?:source|book|thread|note|artifact|node|unit)\//.test(value.href) &&
    value.href.length <= 1000 &&
    typeof value.title === 'string' &&
    value.title.length > 0 &&
    value.title.length <= 300 &&
    typeof value.meta === 'string' &&
    value.meta.length <= 200
  )
}

export function readRecentSearchItems(): RecentSearchItem[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]')
    return Array.isArray(value) ? value.filter(isRecentItem).slice(0, 8) : []
  } catch {
    return []
  }
}

export function rememberSearchItem(item: RecentSearchItem, previous = readRecentSearchItems()): RecentSearchItem[] {
  if (!isRecentItem(item)) return previous
  const next = [item, ...previous.filter((entry) => entry.href !== item.href)].slice(0, 8)
  try {
    localStorage.setItem(storageKey, JSON.stringify(next))
  } catch {
    // The open dialog still works when browser storage is unavailable.
  }
  return next
}

export function clearRecentSearchItems() {
  try {
    localStorage.removeItem(storageKey)
  } catch {
    // Clearing the current dialog remains available without storage.
  }
}
