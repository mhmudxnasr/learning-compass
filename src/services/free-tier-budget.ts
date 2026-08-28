export const DAILY_READ_BUDGET = 5_000_000
export const DAILY_WRITE_BUDGET = 100_000

const readCost = (path: string) => {
  if (path === '/recommendations/list' || /^\/brain\/branches\/[^/]+\/items$/.test(path)) return 5_000
  if (/^\/learning\/core\/threads\/[^/]+\/path$/.test(path) || path === '/knowledge/graph' || path === '/learning/balance') return 5_000
  return 10
}

const corpusMutation = (path: string) => path === '/artifacts/corpora' || /^\/artifacts\/corpora\/[^/]+\/(?:activate|abort)$/.test(path)
const writeCost = (path: string) => corpusMutation(path) ? 50 : path === '/artifacts/pairs' ? 4 : 2
const mutationReadCost = (path: string) => corpusMutation(path) ? 100 : path === '/artifacts/pairs' ? 10 : 0

export async function reserveFreeTierBudget(DB: D1Database, method: string, path: string) {
  const isRead = ['GET', 'HEAD'].includes(method)
  const read = isRead ? readCost(path) : mutationReadCost(path)
  const written = isRead ? 0 : writeCost(path)
  const result = await DB.prepare(`INSERT INTO free_tier_usage_budget(day_utc,estimated_rows_read,estimated_rows_written,read_requests,write_requests)
    VALUES (date('now'),?,?,?,?)
    ON CONFLICT(day_utc) DO UPDATE SET
      estimated_rows_read=estimated_rows_read+excluded.estimated_rows_read,
      estimated_rows_written=estimated_rows_written+excluded.estimated_rows_written,
      read_requests=read_requests+excluded.read_requests,
      write_requests=write_requests+excluded.write_requests,
      updated_at=datetime('now')
    WHERE free_tier_usage_budget.estimated_rows_read+excluded.estimated_rows_read<=?
      AND free_tier_usage_budget.estimated_rows_written+excluded.estimated_rows_written<=?`)
    .bind(read, written, read ? 1 : 0, read ? 0 : 1, DAILY_READ_BUDGET, DAILY_WRITE_BUDGET).run()
  return { allowed: Number(result.meta?.changes || 0) > 0, read, written }
}

export function secondsUntilUtcReset(now = new Date()) {
  return Math.max(1, Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 1000))
}
