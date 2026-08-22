# Books API contract

Books is one continuous Learn workspace containing the reading desk, **My books**, and integrated **Canon fields**. There is no Shelf/Canon tab split. A captured book record is owned by `GET /recommendations/books`; its typed dossier, chapter rows, and chapter files stay under Learn → Books rather than creating a competing Library or Canon collection. Canon retains its separate curated-domain model until a selection is explicitly captured, after which the same book identity carries both personal reading state and Canon membership.

## Add a book

`POST /recommendations/books`

Requires `title`, `author`, and `branch_id`; `isbn`, `url`, and `why_this` are optional. The branch must exist, be a branch node, and not be pruned. The write atomically stores the canonical branch ID plus its label and round and creates a `captured` record. Missing, unknown, or pruned branches return HTTP 400.

## Read

`GET /recommendations/books`

Returns `{ "books": [...] }`. Each book may include:

- `visual.chapters[]`: `{ key, title, number, completed, completed_at }`
- `visual.chapters[].html`: optional chapter HTML artifact link metadata
- `visual.chapters[].pdf`: optional chapter PDF artifact link metadata
- `canon_memberships[]`: zero or more `{ entry_id, domain_id, domain_slug, domain_title, domain_boundary, role }` placements linked through `canon_entries.recommendation_id`

`GET /capture/:id/record` returns the authoritative book dossier read model. Its `item.canon_memberships[]` and top-level `canon_memberships[]` use the same membership shape, alongside sessions, Threads, annotations, learning Units, disposition and feedback, notes, artifacts, chapter projections, recall drafts/cards, and outcome.

## Register chapter metadata

`POST /recommendations/books/:id/chapters`

Request:

```json
{
  "chapters": [
    { "key": "ch-01", "title": "Chapter title", "number": 1, "completed": false }
  ]
}
```

This creates or updates book-scoped chapter rows only. It does not upload files and returns `artifacts_created: 0`.

## Add a chapter PDF or HTML

Use multipart `POST /artifacts` with metadata containing:

```json
{
  "recommendation_id": "book_...",
  "scope": "book",
  "chapter_key": "ch-01",
  "chapter_title": "Chapter title",
  "chapter_number": 1,
  "role": "pdf",
  "pair_id": "book-slug-ch-01"
}
```

Book chapter artifacts must have `scope=book`, stable chapter metadata, and a unique pair ID. The Books endpoint joins them to the matching chapter row and renders the PDF/HTML button there. `GET /artifacts` excludes `scope=book` artifacts, so they do not appear in the general Files library or general source companion badges.

## Complete a chapter

`POST /recommendations/books/:id/chapters/:chapterKey/complete`

Request `{ "completed": true|false }`. This changes chapter completion metadata only; it does not create, delete, or process artifacts.

## Hermes invariants

- Read and mutate book chapters through the Books routes.
- Require and verify a non-pruned branch for every manual book intake; preserve its round everywhere the book renders.
- Keep passive My books and dossier links separate from Queue-owned tracked Start/Resume actions.
- Render a captured Canon selection once as a personal book identity with Canon domain/role metadata; Canon field summaries remain navigation context, not duplicate book cards.
- Keep book chapter files book-scoped with `scope=book`.
- Verify the owning book and chapter key before upload or completion.
- Do not turn a book chapter into a standalone recommendation, captured Library source, Queue item, or general Files entry.
- Do not create HTML/PDF artifacts unless the user explicitly requests the chapter files.
