# Release checklist

- `npm run test`
- `npm run verify:hermes`
- `npm run test:e2e`
- `npm run build`
- Rehearse `schema.sql` and migrations `0000` through `0007` on a clean D1 database.
- Verify Today, Queue, Notes, Atlas, Review, Capture, RSS feed refresh, and Hermes job completion.
- Verify Insights → Hermes, `/analytics/hermes`, job replay/alert acknowledgement, guarded memory lifecycle, and the recalibration evidence gate.
- Check desktop, tablet, phone, light, and dark screenshots.
- Confirm no stale service-worker cache remains after version bump.
- Deploy with `npx wrangler deploy --config wrangler.toml`.
- Smoke-test `/health`, `/dashboard/briefing`, `/capture`, `/capture/feeds`, `/notes`, `/learning/srs/due`, and `/agent/jobs`.
- Smoke-test `/analytics/hermes` and `/agent/memory` after migration.
- Set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` as Worker secrets, then enable a real browser subscription and confirm `/notifications/test` records `delivered` while the app is closed.
