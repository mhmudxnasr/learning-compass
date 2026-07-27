# Taste Map Engine

Personal taste-profile command plane. Single-page dashboard on Cloudflare Workers + D1.

**Live:** https://recommendations-worker.mhmudnasr30.workers.dev/

## What it is

Central hub for the recommendation + consumption pipeline. Manages:

- **Recommendations queue** — Active / Consumed / Rejected with ratings, reviews, dedup keys
- **HTML Vault** — uploaded artifacts (lite-visual, visual-learn, study guides)
- **Learning log** — daily consumption heatmap
- **System Hub** — stats, rating distribution, top creators, mega-prompt
- **Taste profile mirror** — Profile, Map tree, patterns, blacklist, mastery, priority

## Stack

- **Runtime:** Cloudflare Workers
- **Framework:** Hono
- **DB:** D1 (SQLite)
- **Frontend:** Single-file HTML + vanilla JS, dark mode, oklch color space
- **Deploy:** `wrangler deploy` from this directory

## Schema

See `schema.sql` — three tables:

- `recommendations` — the queue
- `html_files` — uploaded artifacts (HTML / PDF)
- `learning_log` — daily consumption counts

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/recommendations/list?status=&q=&content_type=&limit=&offset=` | Filtered list |
| POST | `/recommendations/push` | Insert / upsert (uses `dedup_key` as conflict key) |
| POST | `/recommendations/action` | Update status / rating / review |
| POST | `/recommendations/delete` | Hard delete |
| GET | `/recommendations/export?format=md\|json` | Dump everything |
| GET | `/html/list` | Vault file list |
| POST | `/html/upload` | Save HTML or PDF (base64 for binary) |
| GET | `/html/download/:id` | Serve file (auto-detects .pdf → application/pdf) |
| GET | `/html/print/:id` | A4 print-friendly wrapper |
| GET | `/learning/heatmap` | Year of daily counts |
| POST | `/learning/log` | Increment day's count + topics |
| GET | `/stats` | Full system snapshot |

## Auth

All write endpoints require `X-API-Token` header. Configure via `wrangler secret put API_TOKEN`.

If no token is set, the worker runs in dev mode (no auth required).

## Deploy

```bash
npx wrangler deploy --config wrangler.toml
```

The `--config` flag bypasses wrangler's auto-pages detection (otherwise it scans `$HOME` for stray configs and EACCES-fails).

## Files

```
src/index.ts        — entire app (Hono routes + HTML page)
schema.sql          — D1 schema
wrangler.toml       — bindings (DB, compatibility date)
package.json        — wrangler + hono
```

## Conventions

- `dedup_key` is the identity of a recommendation. Pick stable keys: `html_<slug>`, `yt_<video_id>`, `book_<isbn>`, `pod_<id>`. Re-push updates the existing row.
- `content_type` taxonomy: `video`, `book`, `article`, `podcast`, `paper`, `lite-visual`, `visual-learn`, `course`, `other`.
- `status` lifecycle: `active` → `consumed` or `rejected`. Use `/recommendations/action` for transitions, never re-push.

## License

Personal project. All rights reserved.
