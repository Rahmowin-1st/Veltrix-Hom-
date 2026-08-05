# V11 Known Limitations

1. **Playwright E2E not run — no browser in this environment.** Back/Forward overlay
   history, 50 open/close cycles, refresh-with-pending-request, account switch and the
   500-message chat are verified by TypeScript and by the underlying database tests, but
   not by a driven browser. Run: `npm run build && npm run preview`, then Playwright.

2. **No live provider call.** No Gemini API key was present, so answer, OCR and embedding
   requests were exercised only through the deterministic fake adapter and by compilation.
   OCR *accuracy* on real scans is therefore unmeasured; coverage is reported honestly
   (zero until pages are actually read), so nothing is claimed that was not done.

3. **No physical Android run.** Use `MANUAL_ANDROID_CHECKLIST_V11.md` on a real low-end
   device. Emulator results must be labelled as emulator.

4. **Multi-process database concurrency not exercised.** PGlite is single-connection. Lease
   fencing is proven sequentially — including a zombie worker's write being rejected — but
   genuinely parallel `SKIP LOCKED` claiming across OS processes must be run on a real
   Postgres before relying on multiple workers.

5. **TUS byte transfer not executed.** The client compiles against Supabase's documented
   resumable endpoint with account-scoped fingerprints and a full fallback chain, but no
   browser moved bytes here.

6. **TOC parsing is text-based.** It reads `title … leader … page` lines, which covers the
   overwhelming majority of textbooks, but will miss a purely graphical contents page or a
   multi-column layout whose reading order the text layer scrambles. In that case
   `toc_status` becomes `none` and retrieval falls back to indexed coverage with an honest
   disclosure — it never guesses.

7. **Printed-page mapping accuracy unmeasured.** Anchors, segments, user correction and the
   "printed ≠ index" failure mode are implemented and fixture-tested, but hit rate on real
   books has not been measured against a labelled corpus.

8. **Render Free sleeps.** Durable jobs survive, but processing pauses until the service
   wakes. Continuous processing needs the dedicated worker or a paid instance.

9. **`pgvector` shimmed in tests.** The similarity-search objects in the base schema are not
   covered by the automated suite (the migration chain itself is vector-free). Smoke-test
   semantic retrieval on the real Supabase instance after deploy.

10. **The V10 chunk index is retained.** Migration-011 adds the page-owned index but does
    not drop `source_chunks_logical_uniq`, because dropping an index on a live table is a
    destructive change with no benefit. Both coexist safely.
