-- Compass can hold multiple unresolved picks; explicit starts still enforce the five-item Queue cap.
DROP INDEX IF EXISTS idx_compass_current_pick;
CREATE INDEX IF NOT EXISTS idx_compass_active_picks ON compass_picks(status, created_at DESC) WHERE status IN ('ready','started');
