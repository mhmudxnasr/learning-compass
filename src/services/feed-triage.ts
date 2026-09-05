// Keep the import identity so a scheduled refresh cannot reintroduce a skipped article.
export async function dismissFeedEntry(DB: D1Database, feedId: string, recommendationId: string) {
  await DB.prepare(
    `INSERT INTO feed_entry_dismissals (feed_id,recommendation_id)
     SELECT feed_id,recommendation_id FROM feed_entries
     WHERE feed_id=? AND recommendation_id=?
     ON CONFLICT(feed_id,recommendation_id) DO NOTHING`,
  )
    .bind(feedId, recommendationId)
    .run()
  return DB.prepare(
    `SELECT feed_id,recommendation_id,dismissed_at FROM feed_entry_dismissals
     WHERE feed_id=? AND recommendation_id=?`,
  )
    .bind(feedId, recommendationId)
    .first<{ feed_id: string; recommendation_id: string; dismissed_at: string }>()
}
