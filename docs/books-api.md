# Books API contract

Books are a separate product surface. A book record is owned by `GET /recommendations/books`; its chapter rows and chapter files are rendered in Books, not in the general source/File library.

## Read

`GET /recommendations/books`

Returns `{ "books": [...] }`. Each book may include:

- `visual.chapters[]`: `{ key, title, number, completed, completed_at }`
- `visual.chapters[].html`: optional chapter HTML artifact link metadata
- `visual.chapters[].pdf`: optional chapter PDF artifact link metadata

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
- Keep book chapter files book-scoped with `scope=book`.
- Verify the owning book and chapter key before upload or completion.
- Do not turn a book chapter into a standalone recommendation, captured Library source, Queue item, or general Files entry.
- Do not create HTML/PDF artifacts unless the user explicitly requests the chapter files.
