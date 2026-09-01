# RSS and Atom feeds in Learning Compass

## What this feature does

Learning Compass can subscribe to RSS 2.0 and Atom feeds and place their articles in the durable source ledger. Feed articles follow the same workflow as every other capture:

```text
feed + reviewed default branch → captured Library source → Queue (optional) → external reading → session → reflection
```

Feed imports never add directly to the five-item Queue. Queue triage is explicit and requires a verified non-pruned branch.

## Use it in the site

1. Open **Library → Triage → RSS Feeds**.
2. Under **Web feeds**, paste an RSS or Atom URL, choose its default knowledge branch, and select **Subscribe**.
3. Learning Compass reads the feed and imports up to 20 current entries.
4. Select **Check now** whenever you want a manual refresh. It imports at most five latest entries per feed.
5. Use **Queue** on individual articles only after deciding they deserve one of the five active slots.
6. Select **Remove** to unsubscribe. Existing captures stay in Learning Compass.

Enabled feeds are also checked automatically by the Worker every six hours.

This guide is stored as a Markdown artifact. Open it from **Library → Files → Read**; Learning Compass renders Markdown files as a readable document instead of exposing the raw file.

## What gets stored

- `feed_sources` stores the feed URL, title, site URL, reviewed default `branch_id`, enabled state, HTTP validators, last check, and last error.
- `feed_entries` stores each feed GUID, its linked recommendation, publication time, and import time.
- The linked recommendation is a normal `captured` Library source in D1.
- R2 is not used for feed XML or article pages. The real article URL remains the learning source.

Imports are deduplicated by feed GUID and the normal recommendation URL deduplication key. Rechecking a feed is safe.

## API

Base URL: `https://recommendations-worker.mhmudnasr30.workers.dev`

| Method | Endpoint                                        | Purpose                                                                                                                             |
| ------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/capture/feeds`                                | List subscriptions and imported-entry counts                                                                                        |
| POST   | `/capture/feeds`                                | Subscribe to `{ "url": "https://…", "branch_id": "verified-branch", "limit": 1..20 }` and import current entries; limit is optional |
| POST   | `/capture/feeds/sync`                           | Refresh every enabled feed; optional `{ "limit": 1..20 }` caps each feed                                                            |
| POST   | `/capture/feeds/:id/sync`                       | Refresh one feed; optional `{ "limit": 1..20 }`                                                                                     |
| GET    | `/capture/feeds/:id/entries?limit=200&offset=0` | Read imported history for one feed                                                                                                  |
| DELETE | `/capture/feeds/:id`                            | Unsubscribe without deleting captures                                                                                               |
| GET    | `/capture`                                      | Read captured feed articles in the durable source ledger                                                                            |
| POST   | `/capture/:id/triage`                           | Queue or exclude an imported article                                                                                                |

Ordinary reads and writes are public at the transport layer. Agent clients send no Learning Compass token/header/session; they should still discover the allow-list from `GET /agent/capabilities` and use `POST /agent/request` rather than guessing routes.

## Safety and limits

- Only HTTP and HTTPS feed URLs are accepted.
- Every subscription requires one existing non-pruned top-level knowledge branch. Newly created sources inherit it in the same D1 capture write; a deduplicated source keeps its prior reviewed branch and increments `branch_conflicts` in the import receipt. The canonical branch remains visible on the feed and each article.
- Local, loopback, private-network, and unsafe redirect targets are rejected.
- Each feed response is capped at 2 MB.
- Subscription and scheduled checks import at most 20 entries per feed. RSS Feeds **Check now** imports at most five per feed.
- Conditional `ETag` and `Last-Modified` headers reduce unnecessary downloads.
- Feed errors are recorded on the subscription and do not stop other feeds.
- Feed articles stay as captured Library sources until the user explicitly queues them. Any deliberate per-article remap remains a separate reviewed action.

## Hermes workflow

The user-local `rss-feed` skill handles requests to subscribe, refresh, inspect, or enumerate feed articles. It should:

1. Resolve the feed URL(s) from the user's sources.
2. Subscribe new URLs, treating an already-subscribed response as idempotent.
3. Refresh all enabled feeds.
4. Read every imported entry through the paginated feed-entry endpoint.
5. Report title, source URL, feed, captured state, and canonical branch.

Fetching is not recommendation. Do not auto-queue, auto-rate, auto-process feedback, or call `taste-rec` after a feed refresh.

## Troubleshooting

- **Feed URL rejected:** use the publisher's actual RSS/Atom URL, not a local or private address.
- **No entries imported:** check the subscription's `last_error`; the feed may be HTML, empty, oversized, or unavailable.
- **Article already exists:** URL/GUID deduplication worked; inspect the existing source-ledger or Archive record. Its prior reviewed branch remains authoritative.
- **Feed article is missing from Queue:** this is expected; Queue promotion is always explicit.
- **A feed was removed:** removal stops future refreshes but does not remove already captured recommendations.
