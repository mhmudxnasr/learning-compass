-- 0036: Align stored profile automation with the manual-review default.
-- The original 0023 seed stored 'automatic'; product behavior now requires
-- explicit review of profile changes (review_required=true, mode=manual).
-- Idempotent: safe to run on any existing database.

INSERT INTO user_settings(setting_key,value_json,updated_at)
VALUES ('profile_automation','{"mode":"manual","policy_version":"profile_v2"}',datetime('now'))
ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json,updated_at=datetime('now');
