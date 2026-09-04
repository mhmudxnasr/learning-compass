---
name: media-transcription-systems
description: Acquire and validate timed-media transcripts. For YouTube, use published captions first and permit audio transcription only after caption inventory positively confirms that no manual or generated track exists.
license: MIT
metadata:
  hermes:
    tags: [audio, transcription, arabic, quality, api]
    related_skills: [lite-visual]
---

# Media transcription systems

## When to use

Use when designing, testing, integrating, or reviewing a system that transcribes public audio URLs; when comparing hosted multimodal transcription with local ASR; or when deciding whether a transcript is complete enough for notes, subtitles, search, or source-substitute reading artifacts.

This skill owns transcription acquisition and quality validation. Downstream companion authoring remains with `lite-visual` or the relevant document skill. When available, `compass_extract` wraps the same canonical `extract_source.py` with structured inputs and hash-verified output/receipt paths. Audio fallback defaults off; explicitly enable it only under the source-resolution rules below. Read the saved full source, not merely the tool receipt. No new transcription engine or parallel caption policy is introduced.

## Source resolution order

1. Prefer a complete official transcript or caption track, including YouTube manual captions and generated captions.
2. Reuse an accepted transcript cache only when source validators and prompt/model versions still match.
3. For YouTube, inspect all published caption tracks through the transcript API and yt-dlp. Audio transcription is allowed only after at least one complete inventory positively reports zero manual and zero generated tracks, and no other adapter reports that a caption track exists.
4. If caption lookup fails without proving absence, stop with a blocked receipt. A network error, IP block, unavailable dependency, rejected caption body, or language mismatch is not permission to download audio.
5. Once YouTube captions are confirmed absent, use a hosted low-latency transcription model when credentials, privacy policy, and provider capability are suitable. Use local ASR only as the offline/API-failure fallback.

Do not download media locally merely because the first implementation did so. If the provider accepts public media URLs, send the verified URL directly. If upload is required, stream it through the service and delete temporary provider files after committing the transcript.

For the exact YouTube decision boundary and the resumable audio workflow modeled on the completed Riyadh al-Salihin corpus, read `references/youtube-no-caption-audio.md`.

## YouTube no-caption gate

Use `lite-visual/scripts/fetch_transcript.py` as the canonical caption-first adapter for Learning Compass extraction. Its receipt must state one of these outcomes:

- caption accepted: `method=youtube-transcript-api|yt-dlp-subtitles`; audio was never fetched;
- captions confirmed absent: audio may run and the adapter records `audio_fallback_reason=youtube_captions_confirmed_absent` plus the absence evidence;
- captions present but unusable: block and preserve the failed track evidence;
- caption availability unknown: block and preserve the lookup errors.

Never treat “no caption in the requested language” as “no captions.” Select another original published track before considering audio. Never invoke audio because captions are inconvenient, poorly punctuated, or need cleanup.

## Transcription prompt contract

For faithful Arabic transcription:

- temperature 0;
- verbatim speech, not summary or rewrite;
- complete start-to-end coverage;
- real timestamped segments;
- preserved spoken repetition;
- known speaker, series, book, and terminology context;
- `[غير واضح]` instead of guessing;
- no Markdown, editorial introduction, summary, or invented conclusion.

Context improves recognition of names and classical terminology but never authorizes silent paraphrase.

## Quality gate

A provider’s `success`, `completed`, or HTTP 200 is not evidence of a complete transcript. Accept only when a server-side receipt proves:

- timestamps are monotonic and non-negative;
- segments do not overlap;
- first speech begins near zero;
- final segment reaches within five seconds of measured audio end;
- no unexplained gap exceeds 30 seconds;
- transcript is predominantly in the expected language;
- word count is plausible for duration;
- transcript contains no summary markers or model commentary;
- concatenated segment text equals canonical full text;
- source URL plus ETag/Last-Modified/Content-Length or audio hash is bound to transcript SHA-256;
- model ID, prompt version, timings, token usage, and cache status are recorded.

Never create timestamps by evenly distributing untimed paragraphs across the recording. Plain text without source-derived times cannot be treated as valid SRT/VTT.

Allow one correction request naming the exact failed checks. If it still fails, return failed with the receipt; do not display a partial transcript as completed.

## Hosted API contract

Use durable asynchronous jobs for automation and long recordings:

- `POST /api/jobs` returns a stable, idempotent job ID.
- `GET /api/jobs/:id` returns queued, validating, transcribing, verifying, completed, or failed.
- `GET /api/transcripts/:id` returns immutable transcript data plus its quality receipt.
- `DELETE /api/transcripts/:id` removes the exact persisted transcript only after explicit authority.

Machine access requires authentication, rate limiting, URL normalization, private-network blocking, redirect revalidation, MIME/size limits, bounded retries, and secret-safe logs. Browser localStorage may mirror history but is never canonical storage.

Cache accepted transcripts server-side by normalized URL, HTTP validators, model, prompt version, and supplied context. A changed validator invalidates the cache.

## Website review procedure

1. Inspect the rendered interface and deployed frontend behavior.
2. Call link-validation and transcription endpoints directly with one known public fixture.
3. Compare the returned transcript against a fuller independent transcript or checked reference—not only the site’s status.
4. Verify actual ending coverage, named entities, segment timing, exports, persistence, authentication, and retry behavior.
5. Inspect whether “verifying” is a real server gate rather than a cosmetic delay.
6. Do not approve the system until an incomplete fixture is rejected or repaired.

Read `references/arabic-gemini-benchmark.md` for the measured Arabic lecture case and failure signature.

## Product-specification style

When the user asks for a prompt “for the site” or says to explain only the site, provide a behavior-and-interface brief. Omit providers, cloud platforms, authentication mechanisms, schemas, endpoints, and infrastructure unless the user explicitly asks for technical implementation.

Use `templates/product-only-site-brief.md` as the default shape. A later technical prompt can add architecture separately without polluting the initial product brief.

## Pitfalls

- Fast output is not necessarily complete output.
- A transcript can claim the correct total duration while omitting speech and stretching timestamps to hide the gap.
- Named-term correctness does not prove full coverage.
- Client-side “verifying” animation is not validation.
- Local history is not an automation API.
- A public unauthenticated transcription endpoint is a cost and abuse risk.
- Do not expose or persist provider keys in chat, commands, source code, or frontend bundles.
- A failed caption adapter is not evidence that captions are absent.
- A published caption track that fails validation must be repaired or reported blocked; it must not silently trigger audio transcription.

## Completion receipt

Return:

`source → adapter/model → measured timing → transcript hash → duration/segment checks → persistence/readback → blocker`

## Evolution handoff

When a provider changes URL support, timestamp behavior, model quality, quota, or retention semantics, store the measured case in `references/` and keep the class-level acceptance gate stable. Do not encode temporary setup failures as permanent tool limitations.
