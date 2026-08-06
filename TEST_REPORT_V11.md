# V11 Test Report

Separates what was **executed here** from what was **not run**. Nothing is invented.

## A. Automated suite — RUN, 49/49 PASSED
```
cd server && npm test        # vitest run → exit 0
Test Files  8 passed (8)
     Tests  49 passed (49)
```
Engine: **PostgreSQL 18.3 (PGlite)** — real PostgreSQL, so RPC bodies, constraints, RLS
and `FOR UPDATE SKIP LOCKED` under test are the real ones. `pgvector` is not bundled, so
base-schema `vector(n)` columns are shimmed; the migration chain 002→011 is vector-free,
so nothing under test is affected.

| Suite | Tests | Covers |
|---|---|---|
| `requests.concurrency` | 6 | duplicate submit → 1 chat / 1 user message / **1 model invocation** (fake-adapter counter) / 1 answer; completed replay; stale lease rejected; lease extension; cross-account rejection |
| `isolation` | 6 | RLS row scoping under the `authenticated` role; B cannot OCR-claim, write OCR, re-prioritize, anchor, resume or cancel A's work; per-account counters |
| `worker.recovery` | 7 | single claim; reclaim only after lease expiry with `lease_version` bump; **zombie stale-token write rejected**; resume from checkpoint 47; quota pause auto-resumes; cancel preserves finished pages; triple identical chunk insert → 1 row |
| `pagination` | 4 | 60 messages over 3 timestamps — all reachable exactly once, stable order, no tie overlap |
| `pdfPipeline` | 6 | page-addressable extraction; Roman front matter (printed 1 = PDF 5); numbering reset; injection text surfaced as data + guard present; non-PDF rejected on magic bytes; truncated PDF fails cleanly |
| `evidence` | 7 | model says page 999 → citation is server's page 12; unknown ID dropped; no citation when nothing verifiable; `exercise:` locks to page 127 |
| **`toc` (new)** | **8** | parser accepts real contents pages, rejects prose and page-number bands, handles dotted/dashed/spaced leaders; atomic replace stamps `toc_status`; re-parse replaces instead of accumulating; non-owner rejected |
| **`indexing` (new)** | **5** | crash-retry cannot duplicate a chunk; version-aware reindex drops only stale-version rows and **keeps current ones so their embeddings are reused**; non-owner cannot reindex; per-source dedup behaves as designed |

## B. Migration 011 — RUN, PASSED on both database states
Applied after 010 to two independently built databases:
- **State A** (001–008, no 009) → applies cleanly; second run is a no-op.
- **State B** (001–009 applied) → applies cleanly; second run is a no-op.

Live RPC behaviour verified in both: `replace_toc_entries` inserts 2, stamps
`toc_status='done'`, **replaces** on re-parse rather than accumulating, and returns `-1`
for a non-owner; `reindex_page_versioned` deleted exactly the 1 stale-version chunk and
kept the 1 current one.

`MIGRATION_VERIFY_V11.sql` executed against the migrated schema and ran clean (tables,
functions, columns, both uniqueness indexes, RLS on all five user-owned tables, and
grant lockdown on the mutation RPCs).

## C. Build gates — RUN, exit 0
```
server: npx tsc --noEmit → 0    server: npx tsc → 0    server: npm test → 0 (49)
client: npx tsc --noEmit → 0    client: npm run build → 0 (bundle + PWA SW)
```

## D. Final ZIP rebuild — RUN, PASSED
The packaged ZIP was extracted into a clean directory and rebuilt from scratch:
`npm install` → typecheck → test → build on both sides, all exit 0, 49/49 tests passing.

---

## NOT RUN — with the command for each

| Gate | Why | How to run |
|---|---|---|
| Playwright E2E (§18) | no browser in this environment | `npm run build && npm run preview`, then drive Playwright against the preview URL |
| Live Gemini (answer / OCR / embedding) | no API key | one live request per model with a real key; confirm the answer persists exactly once |
| Physical Android | no device or emulator | `MANUAL_ANDROID_CHECKLIST_V11.md` on a real low-end device |
| Multi-process DB concurrency | PGlite is single-connection | `psql "$DATABASE_URL" -f server/src/db/tests/concurrency.test.sql` and `jobqueue.test.sql` |
| Real TUS byte transfer | no browser | upload a >6 MB PDF from a browser and interrupt/resume it |
| Production smoke | not deployed | `PRODUCTION_SMOKE_TEST_V11.md` |

**Conclusion.** Every gate achievable in this environment passes (49 tests, both
migration states, all builds, ZIP rebuild). Because the browser, device, live-provider
and multi-process gates were **not** run here, this release is **not** described as
production-ready.

## Render/Supabase hotfix verification — 2026-08-06

Passed locally:
- TypeScript syntax transpilation for every `.ts`/`.tsx` source file.
- No real Supabase/Gemini-looking secrets detected in the package.
- Root and server migration-010 copies are byte-identical.
- Root and server migration-011 copies are byte-identical.
- Known migration guards are present: old `extend_chat_request_lease` signature
  is dropped before recreation and canonical `offset_value` is used.

Not claimed:
- A live Supabase request was not possible without the user's private Render
  environment values.
- Full `npm ci` could not be run in the isolated build environment because its
  package mirror did not contain all locked artifacts. Source syntax and file
  consistency checks passed; Render/GitHub will install from their normal npm
  registry during deployment.
