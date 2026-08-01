# RSS and Atom feeds in Learning Compass

## What this feature does

Learning Compass can subscribe to RSS 2.0 and Atom feeds and place their articles in the unlimited Inbox. Feed articles follow the same workflow as every other capture:

```text
feed → Inbox → triage → Queue (optional) → external reading → session → reflection
```

Feed imports never bypass Inbox triage and never add directly to the five-item Queue.

## Use it in the site

1. Open **Curate → RSS Feed** (Queue is the first Curate destination; RSS Feed is next).
2. Under **Web feeds**, paste an RSS or Atom URL and select **Subscribe**.
3. Learning Compass reads the feed and imports up to 20 current entries.
4. Select **Check now** whenever you want a manual refresh.
5. Use **Queue** on individual articles only after deciding they deserve one of the five active slots.
6. Select **Remove** to unsubscribe. Existing captures stay in Learning Compass.

Enabled feeds are also checked automatically by the Worker every six hours.

This guide is stored as a Markdown artifact. Open it from **Learn → Files → Read**; Learning Compass renders Markdown files as a readable document instead of exposing the raw file.

## What gets stored

- `feed_sources` stores the feed URL, title, site URL, enabled state, HTTP validators, last check, and last error.
- `feed_entries` stores each feed GUID, its linked recommendation, publication time, and import time.
- The linked recommendation is a normal Inbox capture in D1.
- R2 is not used for feed XML or article pages. The real article URL remains the learning source.

Imports are deduplicated by feed GUID and the normal recommendation URL deduplication key. Rechecking a feed is safe.

## API

Base URL: `https://recommendations-worker.mhmudnasr30.workers.dev`

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/capture/feeds` | List subscriptions and imported-entry counts |
| POST | `/capture/feeds` | Subscribe to `{ "url": "https://…" }` and import current entries |
| POST | `/capture/feeds/sync` | Refresh every enabled feed |
| POST | `/capture/feeds/:id/sync` | Refresh one feed |
| GET | `/capture/feeds/:id/entries?limit=200&offset=0` | Read imported history for one feed |
| DELETE | `/capture/feeds/:id` | Unsubscribe without deleting captures |
| GET | `/capture` | Read feed articles still waiting in Inbox |
| POST | `/capture/:id/triage` | Queue or exclude an imported article |

Writes require `x-api-token` when `API_TOKEN` is configured. Agent clients should discover the allow-list from `GET /agent/capabilities` and use `POST /agent/request` rather than guessing routes.

## Safety and limits

- Only HTTP and HTTPS feed URLs are accepted.
- Local, loopback, private-network, and unsafe redirect targets are rejected.
- Each feed response is capped at 2 MB.
- Each check imports at most 20 entries per feed.
- Conditional `ETag` and `Last-Modified` headers reduce unnecessary downloads.
- Feed errors are recorded on the subscription and do not stop other feeds.
- Feed articles stay in Inbox until the user explicitly triages them.

## Hermes workflow

The user-local `rss-feed` skill handles requests to subscribe, refresh, inspect, or enumerate feed articles. It should:

1. Resolve the feed URL(s) from the user's sources.
2. Subscribe new URLs, treating an already-subscribed response as idempotent.
3. Refresh all enabled feeds.
4. Read every imported entry through the paginated feed-entry endpoint.
5. Report title, source URL, feed, and Inbox state.

Fetching is not recommendation. Do not auto-queue, auto-rate, auto-process feedback, or call `taste-rec` after a feed refresh.

## Troubleshooting

- **Feed URL rejected:** use the publisher's actual RSS/Atom URL, not a local or private address.
- **No entries imported:** check the subscription's `last_error`; the feed may be HTML, empty, oversized, or unavailable.
- **Article already exists:** URL/GUID deduplication worked; inspect the existing Inbox or archive record.
- **Feed article is missing from Queue:** this is expected; Queue promotion is always explicit.
- **A feed was removed:** removal stops future refreshes but does not remove already captured recommendations.
