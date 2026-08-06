# V11 Task Ledger

Classification of every requirement at the start of V11, and what was done.
`DONE_AND_CONNECTED` items were inherited working from V10 and deliberately **not**
rebuilt (execution contract §6).

| # | Requirement | Entry state | Action in V11 |
|---|---|---|---|
| 4 | Account isolation, no old-account flash | DONE_AND_CONNECTED | none — RLS + A/B tests already prove it |
| 4 | Service-role ownership checks on every RPC | DONE_AND_CONNECTED | none — every RPC takes `p_user_id`; covered by isolation tests |
| 5 | Atomic chat request, one chat/message/invocation | DONE_AND_CONNECTED | none — proven by fake-adapter counter test |
| 5 | Request lease heartbeat, no write after loss | DONE_AND_CONNECTED | none |
| 5 | 202 as discriminated result, bounded polling | DONE_AND_CONNECTED | none |
| 6 | Durable worker: lease, fencing, checkpoint, resume | DONE_AND_CONNECTED | none — zombie-write test proves fencing |
| 6 | Quota pause auto + manual resume | DONE_AND_CONNECTED | none |
| 6 | `npm run worker` | DONE_AND_CONNECTED | none |
| 7 | TUS resumable upload, fallback chain | DONE_AND_CONNECTED | none |
| 7 | **Cleanup of abandoned uploads** | **BROKEN** (RPC existed, never called) | wired `POST /api/sources/cleanup-uploads` + client method |
| 8 | Per-page rows, text/mixed/scanned classification | DONE_AND_CONNECTED | none |
| 8 | **`extract_toc` stage** | **BROKEN** (table written by nothing; `routeQuery` always read an empty table) | implemented `parseTocPage`/`looksLikeToc`, wired into the extract loop, atomic `replace_toc_entries` |
| 8 | OCR priority + honest coverage | DONE_AND_CONNECTED | none |
| 9 | Printed-page anchors + segments | DONE_AND_CONNECTED | none |
| 9 | **User correction of printed page** | **NOT_STARTED** (RPC existed, no endpoint) | wired `POST /api/sources/:id/page-anchor`, rebuilds segments, client method |
| 10 | Exact page / exercise retrieval | DONE_AND_CONNECTED | none |
| 11 | Evidence-locked citations, injection guard | DONE_AND_CONNECTED | none |
| 12 | **Page-owned chunk uniqueness** `(source_page_id, chunk_index, chunker_version, content_hash)` | **PARTIAL** (V10 keyed on `source_id,page_number`) | migration-011 index + upsert target changed |
| 12 | **Skip re-embedding unchanged content** | **NOT_STARTED** (every run re-embedded everything) | version-aware `reindex_page_versioned` + content-hash skip in the index session |
| 13 | Composite cursor pagination | DONE_AND_CONNECTED | none |
| 14 | Back/Forward overlay history, no `navigate(-1)` on popstate | DONE_AND_CONNECTED | none |
| 15 | Keyboard-safe full-screen shell | DONE_AND_CONNECTED | none |
| 16 | Motion levels, no permanent RAF | PARTIAL (CSS only) | **Framer Motion now gated** via `MotionConfig` + `useMotionLevel` — CSS cannot throttle JS-driven animation |
| 17 | Error Boundary, `/health`, `/health/worker`, graceful shutdown | DONE_AND_CONNECTED | none |
| 17 | Per-user abuse limits | DONE_AND_CONNECTED | none |
| 18 | Playwright E2E | BLOCKED_EXTERNALLY | no browser in this environment — see KNOWN_LIMITATIONS_V11 §1 |
| 18 | Live provider / physical Android | BLOCKED_EXTERNALLY | no API key, no device |
| 19 | Next additive migration | — | **migration-011.sql** created and verified on both DB states |

## Result
5 items were genuinely incomplete or disconnected; all 5 are now implemented and
connected end to end, with tests. 3 remain blocked by the absence of a browser, a
device and an API key — documented, never claimed as passing.
