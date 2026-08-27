-- Every RSS subscription owns one reviewed default knowledge branch. Imported
-- entries inherit that branch at capture time, so feed refreshes cannot create
-- unclassified source records.
ALTER TABLE feed_sources ADD COLUMN branch_id TEXT REFERENCES tree_nodes(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_feed_sources_branch ON feed_sources(branch_id, enabled);

-- Production subscriptions that predate this contract. Ben's Bites is used for
-- practical agent/knowledge-work workflows; the two AI-industry feeds retain
-- the Systems Thinking mapping used by the earlier ai-news-feed migration.
UPDATE feed_sources
SET branch_id = CASE
  WHEN lower(feed_url) LIKE '%bensbites.com/%' THEN 'pkm'
  WHEN lower(feed_url) LIKE '%techcrunch.com/category/artificial-intelligence/%' THEN 'systems-thinking'
  WHEN lower(feed_url) LIKE '%news.crunchbase.com/sections/ai/%' THEN 'systems-thinking'
  ELSE branch_id
END,
updated_at = datetime('now')
WHERE branch_id IS NULL OR trim(branch_id) = '';

-- Repair only entries that have never received a branch. Explicit per-source
-- mappings remain authoritative.
UPDATE recommendation_meta
SET branch_id = (
      SELECT fs.branch_id
      FROM feed_entries fe
      JOIN feed_sources fs ON fs.id = fe.feed_id
      WHERE fe.recommendation_id = recommendation_meta.recommendation_id
        AND fs.branch_id IS NOT NULL
        AND trim(fs.branch_id) != ''
      ORDER BY fe.created_at
      LIMIT 1
    ),
    source_metadata_json = json_patch(
      COALESCE(source_metadata_json, '{}'),
      json_object(
        'branch_mapping_confidence', 'high',
        'branch_mapping_reason', 'Inherited from the reviewed RSS subscription default branch.',
        'branch_mapping_source', 'rss_feed_migration_0063'
      )
    ),
    updated_at = datetime('now')
WHERE (branch_id IS NULL OR trim(branch_id) = '')
  AND EXISTS (
    SELECT 1
    FROM feed_entries fe
    JOIN feed_sources fs ON fs.id = fe.feed_id
    JOIN tree_nodes n ON n.id = fs.branch_id
    WHERE fe.recommendation_id = recommendation_meta.recommendation_id
      AND lower(COALESCE(n.status, '')) != 'pruned'
  );

UPDATE recommendations
SET branch = (
      SELECT n.label
      FROM recommendation_meta m
      JOIN tree_nodes n ON n.id = m.branch_id
      WHERE m.recommendation_id = recommendations.id
    ),
    updated_at = datetime('now')
WHERE id IN (SELECT recommendation_id FROM feed_entries)
  AND EXISTS (
    SELECT 1
    FROM recommendation_meta m
    JOIN tree_nodes n ON n.id = m.branch_id
    WHERE m.recommendation_id = recommendations.id
  );

-- D1 enforces the feed-level contract even if a future caller bypasses the
-- HTTP service. Existing per-source branch changes remain independently
-- reviewable through the canonical mapping route.
CREATE TRIGGER IF NOT EXISTS feed_sources_branch_required_insert
BEFORE INSERT ON feed_sources
WHEN NEW.branch_id IS NULL
  OR trim(NEW.branch_id) = ''
  OR NOT EXISTS (
    SELECT 1 FROM tree_nodes n
    WHERE n.id = NEW.branch_id
      AND n.type = 'branch'
      AND (n.parent_id = 'root' OR EXISTS (SELECT 1 FROM tree_nodes p WHERE p.id = n.parent_id AND p.type = 'category'))
      AND lower(COALESCE(n.status, '')) != 'pruned'
  )
BEGIN
  SELECT RAISE(ABORT, 'feed source requires a verified non-pruned branch');
END;

CREATE TRIGGER IF NOT EXISTS feed_sources_branch_required_update
BEFORE UPDATE OF branch_id ON feed_sources
WHEN NEW.branch_id IS NULL
  OR trim(NEW.branch_id) = ''
  OR NOT EXISTS (
    SELECT 1 FROM tree_nodes n
    WHERE n.id = NEW.branch_id
      AND n.type = 'branch'
      AND (n.parent_id = 'root' OR EXISTS (SELECT 1 FROM tree_nodes p WHERE p.id = n.parent_id AND p.type = 'category'))
      AND lower(COALESCE(n.status, '')) != 'pruned'
  )
BEGIN
  SELECT RAISE(ABORT, 'feed source requires a verified non-pruned branch');
END;
