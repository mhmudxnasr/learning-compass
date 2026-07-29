# Taste Map

Private learning operating system on Cloudflare Workers, Hono, D1, R2, and a Vite/Preact client.

Future agents should start with `AGENTS.md`, `PROJECT_CONTEXT.md`, and `CURRENT_STATE.md`.

## Development

```bash
npm install
npm run dev:worker
npm run test
npm run test:e2e
```

## Deployment

```bash
npm run deploy
```

The deploy script always uses `npx wrangler deploy --config wrangler.toml`.

## Data

D1 is canonical. Apply `schema.sql`, `migrations/0000_brain.sql`, `migrations/0001_production_rebuild.sql`, then `migrations/0002_rss_feeds.sql`. R2 stores large artifacts. Hermes writes extracted-note archive copies to Obsidian.

Capture always lands in the RSS Feed destination's unlimited inbox. RSS and Atom subscriptions import up to 20 current entries when added, refresh every six hours, and can be checked manually from RSS Feed. Queue is the first Curate destination and promoting an item enforces the five-item cap. Offline reads use the service-worker cache and pending text captures use IndexedDB.

## Hermes

The `taste-map-hermes-jobs` cron polls `/agent/jobs`, runs `learning-notes-extractor` or `taste-mapper`, and posts results back. The worker script lives at `~/.hermes/scripts/taste-map-job.py`.

## Routes

See `docs/API.md` and `client/src/destinations.ts` for the API and 28-destination workspace.
