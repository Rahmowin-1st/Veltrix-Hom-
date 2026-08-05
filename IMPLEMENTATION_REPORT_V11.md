# V11 Implementation Report

Only the work V11 actually changed. Systems inherited working from V10 are listed in
`V11_TASK_LEDGER.md` and were not rebuilt.

---

## 1. `extract_toc` — a table that nothing wrote to
- **Problem:** `source_toc_entries` existed and `routeQuery()` read from it, but no code
  ever inserted a row. TOC routing therefore always returned zero candidates — a
  database-only feature exactly as §1 forbids.
- **Root cause:** V10 shipped the schema and the reader; the producer was never written.
- **Implementation:** `parseTocPage()` extracts `title … leader … page` lines, and
  `looksLikeToc()` distinguishes a contents page from prose that happens to end in a
  number (requires a heading match or ≥4 dotted-leader lines). Both are wired into the
  existing extract page loop, scanning only the first 25 pages, and the result is stored
  through `replace_toc_entries` — one RPC that deletes the old parse, inserts the new
  rows and stamps `sources.toc_status` / `toc_entry_count` atomically.
- **Why in the page loop, not a new stage:** a separate stage would re-download and
  re-open the whole PDF for data that is always in the front matter — the repeated-reparse
  pattern §6 forbids.
- **Files:** `services/tocRouter.ts`, `services/jobWorker.ts`, `migration-011.sql`.
- **Tests:** 8 (`toc.test.ts`) — parser accuracy, false-positive rejection, atomic
  replacement, `toc_status` stamping, non-owner rejection. **PASSED.**
- **Limitation:** For a fully scanned book the TOC is only parseable once those pages have
  been OCR'd; until then routing falls back to indexed coverage with honest disclosure.

## 2. Page-owned, embedding-sparing indexing (§12)
- **Problem A:** uniqueness was keyed on `(source_id, page_number, …)`. If a book is
  re-extracted and page numbering shifts, old chunks stop being addressable by the new run.
- **Problem B:** every index run re-embedded every chunk, including content that had not
  changed — the single most expensive operation in the pipeline, repeated for nothing.
- **Implementation:** migration-011 adds
  `source_chunks_page_owned_uniq (source_page_id, chunk_index, chunker_version, content_hash)`
  after backfilling `source_page_id`. `reindex_page_versioned()` deletes only chunks from a
  *different* chunker/embedding version and reports what survived. The index session now
  loads the existing hashes for a page at the current version and **skips embedding any
  chunk whose hash already exists**.
- **Fallback:** a model or chunker version change still forces a full clean rebuild of the
  page, so versions are never silently mixed.
- **Files:** `migration-011.sql`, `services/jobWorker.ts`.
- **Tests:** 5 (`indexing.test.ts`) — triple insert → 1 row; reindex deletes 2 stale and
  keeps 2 current; non-owner cannot reindex. **PASSED.**

## 3. User correction of printed-page mapping (§9)
- **Problem:** `set_printed_page_anchor` existed with no route, so the required "user
  correction" path was unreachable.
- **Implementation:** `POST /api/sources/:id/page-anchor` validates ownership through the
  RPC, stores the anchor as `verified_by = 'user'` (outranking every inferred mapping),
  then **rebuilds the derived page segments** so the correction propagates to the whole
  region rather than fixing one page. Client method `sourceApi.setPageAnchor`.
- **Files:** `routes/sources.ts`, `services/jobWorker.ts` (`buildPageSegments` exported),
  `src/lib/api.ts`.
- **Result:** PASSED (compiles; ownership rejection covered by the isolation suite).

## 4. Abandoned upload cleanup (§7)
- **Problem:** `cleanup_abandoned_uploads` was never called, so a reservation whose bytes
  never arrived stayed `uploading` forever — and its checksum blocked a legitimate
  re-upload of the same file.
- **Implementation:** `POST /api/sources/cleanup-uploads` (owner-scoped, 120-minute
  threshold) plus `sourceApi.cleanupAbandonedUploads`.
- **Files:** `routes/sources.ts`, `src/lib/api.ts`. **Result:** PASSED.

## 5. Motion levels now actually reach Framer (§16)
- **Problem:** motion levels were enforced in CSS only. Framer Motion animates in
  JavaScript and ignores `transition-duration`, so on a weak device 29 components kept
  animating at full cost even at level `off`.
- **Implementation:** one `MotionConfig` wrapper around the app —
  `reducedMotion="always"` at `off`, a short global transition at `reduced`.
  `useMotionLevel()` uses `useSyncExternalStore` against a subscription added to
  `useAdaptiveMotion`, so a level change costs exactly one re-render, never one per frame.
  The bounded 2-second startup sample and the absence of any permanent RAF are unchanged.
- **Files:** `src/app/App.tsx`, `src/hooks/useMotionLevel.ts`, `src/hooks/useAdaptiveMotion.ts`.
- **Result:** PASSED (typecheck + build). Visual verification needs a device.

## 6. Migration 011
Next additive migration in the real chain (010 → 011). No deployed migration was rewritten.
Verified on **both** database states, idempotent on a second run, with
`MIGRATION_VERIFY_V11.sql` running clean afterwards.
