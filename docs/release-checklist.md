# Release checklist

- `npm run test`
- `npm run test:e2e`
- `npm run build`
- Rehearse `schema.sql`, `migrations/0000_brain.sql`, `migrations/0001_production_rebuild.sql`, then `migrations/0002_rss_feeds.sql` on a clean D1 database.
- Verify Today, Queue, Notes, Atlas, Review, Capture, RSS feed refresh, and Hermes job completion.
- Check desktop, tablet, phone, light, and dark screenshots.
- Confirm no stale service-worker cache remains after version bump.
- Deploy with `npx wrangler deploy --config wrangler.toml`.
- Smoke-test `/health`, `/dashboard/briefing`, `/capture`, `/capture/feeds`, `/notes`, `/learning/srs/due`, and `/agent/jobs`.
