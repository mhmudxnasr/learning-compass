# Release checklist

- `npm run test`
- `npm run verify:hermes`
- `npm run test:e2e`
- `npm run build`
- Rehearse `schema.sql` and every numbered migration through `0039` on a clean D1 database.
- Verify loop-ordered navigation, weekly closure/counterevidence, Queue Thread backfill, universal target-aware sessions, source dispositions, consolidation closure, anchored Units, evidence gates, source-centric Notes, FSRS recall, Atlas, and Inbox/RSS refresh.
- Verify Insights → Hermes clean cohorts, profile health, improvement receipts, shadow gates, guarded memory, automatic profile application/undo, snapshot repair dry-run, and the 20-global/8-lane recalibration gates.
- Verify `learning-compass-self-evolution` is the sole improvement owner, every active skill exposes an evolution handoff, retired skills are absent, and improvement receipts can close as applied/deployed, failed/resumable, or evidence-backed no-change.
- Verify Compass requires an open Thread, stores fit/bridge/challenge lanes and v1/v2 shadow receipts, treats `not_now` as neutral, and records bad-fit reasons separately from rating/disposition/evidence.
- Check desktop, tablet, phone, light, and dark screenshots.
- Confirm no stale service-worker cache remains after version bump.
- Deploy with `npx wrangler deploy --config wrangler.toml`.
- Smoke-test `/health`, `/dashboard/briefing`, `/capture`, `/capture/feeds`, `/notes`, `/learning/srs/due`, `/learning/core/integrity/health`, `/learning/core/threads`, `/learning/core/consolidation/open`, `/agent/jobs`, `/agent/briefing`, `/agent/activity`, `/agent/capabilities`, `/agent/system`, and `/search/evidence`.
- If `REQUIRE_API_AUTH=true`, verify an unauthenticated read is rejected and the authorized `x-api-token` path succeeds. If Telegram is enabled, verify the secret header, allowed chat restriction, and duplicate `update_id` behavior before accepting captures.
- Verify Settings → System renders every allow-listed operation, the exact configured schedule, on-demand-only workflows, storage ownership, service health, and safety boundaries without horizontal overflow.
- Confirm no learning-core timer, scheduled monitor, or host poller was introduced; Hermes processes exact jobs only during active explicit workflows.
- Smoke-test `/analytics/hermes`, `/analytics/hermes/engine`, `/analytics/hermes/repair` (dry-run), `/brain/profile/intelligence`, and `/agent/memory` after migration. Do not activate v2 unless every returned gate passes.
- Set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` as Worker secrets, then enable a real browser subscription and confirm `/notifications/test` records `delivered` while the app is closed.
