# Learning Compass API

## Canonical read models

- `GET /dashboard/briefing` — Today next action, due reviews, queue pressure, gaps, neglected branches, and recent output.
- `GET /capture/queue` — five-item active queue read model.
- `GET /recommendations/list` — archive and filtered recommendation records. Use `source=feed` for RSS/Atom captures or `source=manual` to keep feed entries out of the main archive.
- `GET /knowledge/graph` — nodes and evidence-backed edges.
- `GET /knowledge/blind-spots` — unmapped or unconsumed branches.
- `GET /learning/health` — branch health.
- `GET /taste/dna` — vectors, decay, ratings, diversity, and momentum.
- `GET /analytics/heatmaps`, `/analytics/forecast`, `/analytics/taste-drift`, `/analytics/creator-trust`.

## Capture and learning

- `POST /capture`, `GET /capture`, `GET /capture/:id` — universal capture, Inbox, and enrichment status.
- `GET/POST /capture/feeds`, `DELETE /capture/feeds/:id` — list, subscribe to, and remove RSS/Atom sources. Subscribing imports up to 20 current entries into Inbox.
- `GET /capture/feeds/:id/entries` — read all imported articles for one feed with pagination.
- `POST /capture/feeds/sync`, `POST /capture/feeds/:id/sync` — check all feeds or one feed now; scheduled checks run every six hours.
- `POST /capture/:id/triage` — promote an Inbox item to Queue or exclude it; queue overflow requires explicit override.
- `POST /artifacts`, `GET /artifacts`, `GET /artifacts/:id` — R2-backed files and metadata. Multipart uploads accept `pair_id`, `role`, `recommendation_id`, `source_url`, `source_title`, `generator`, or a JSON `metadata` field.
- `GET /artifacts/:id/view` — render Markdown artifacts as a safe, readable HTML document.
- `POST /artifacts/:id/process` — queue an idempotent `extract_notes` Hermes job; a failed extraction is reset to `retry` by the same call.
- `GET/POST /sessions`, `POST /sessions/start`, `POST /sessions/:id/return` — external handoff lifecycle. Starting an unfinished item resumes its existing session. Returning with `reflection` creates one idempotent linked `kind=reflection` note with five editable sections; pass `complete:true` and `rating` to close the session in the same request.
- `GET/POST/PUT /notes`, `POST /notes/:id/process` — structured notes and Hermes feedback jobs.
- `GET /srs/drafts`, `PUT /srs/drafts/:id`, `POST /srs/drafts/:id/approve`, `POST /srs/drafts/:id/reject` — editable recall drafts.
- Existing `/learning/srs/due`, `/learning/srs/review`, and `/learning/srs/create` remain compatible.

## Hermes jobs

- `GET /agent/jobs?status=pending` — pending work.
- `POST /agent/jobs/:id/claim` — lease one job; expired leases are reclaimed automatically.
- `POST /agent/jobs/:id/complete` — persist structured note/SRS output while its lease is current.
- `POST /agent/jobs/:id/fail` — retry up to three attempts, then mark failed.

## Agent control protocol

- `GET /agent/capabilities` — complete machine-readable allow-list of site operations.
- `GET /agent/openapi.json` — compact OpenAPI description for HTTP/tool clients.
- `POST /agent/request` — execute one allow-listed site operation with `{method,path,body}`.
- `GET /agent/tools` and `POST /agent/tool-call` — function-calling declarations and execution.

Agent mutations reuse product validation, require `x-api-token` when configured, and audit to `agent_logs`. Arbitrary SQL, arbitrary paths, and outbound proxying are not exposed.

## Settings and organization

- `GET /settings` — stored preferences plus fully resolved defaults; `PUT /settings/:key` updates one preference group.
- `GET/PUT /dashboard/layout` — adaptive module pins/order.
- `GET/POST /collections`, `POST /collections/:id/items` — durable collections.
