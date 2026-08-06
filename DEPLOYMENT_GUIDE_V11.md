# V11 Deployment Guide

## 1. Back up
Supabase → Database → Backups → manual backup (or `pg_dump`). Everything below is
additive, but a backup is the only real rollback for a production database.

## 2. Detect what is applied
```sql
select to_regclass('public.chat_requests')     as has_008,
       to_regclass('public.message_evidence')  as has_009,
       to_regclass('public.source_page_items') as has_010,
       to_regclass('public.source_toc_entries') as has_toc,
       (select 1 from pg_proc where proname='replace_toc_entries') as has_011;
```

## 3. Migration order
```text
Run all missing migrations through 008.
Do NOT run an unverified partial 009 — migration-010 replays it idempotently.
Run migration-010  (convergence).
Run migration-011  (V11).
```
Both files are idempotent; re-running either is harmless.

## 4. Verify
```
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f MIGRATION_VERIFY_V11.sql
# expect:  NOTICE  V11 verify PASSED
```

## 5. Environment
No new **mandatory** variables in V11. Full list with safe defaults is in
`server/.env.example` (model IDs and per-user hourly limits, all optional).
Never put a service-role or Gemini key in a `VITE_`-prefixed variable — those ship to the
browser.

## 6. Backend (Render)
1. Deploy the server.
2. `GET /health` → `{ ok: true }`.
3. `GET /health/worker` → queue counts, `stale_leases: 0`.

Jobs left mid-flight by the previous instance resume from their checkpoints automatically.

## 7. Optional dedicated worker
A second Render service running `npm run worker` gives processing its own CPU. It claims
through the same fenced RPC as the web service, so running both is safe.

## 8. Frontend
```
npm ci && npm run build                        # Vercel
npm run cap:sync && npm run android:release    # Android
```

## 9. Smoke test
Run `PRODUCTION_SMOKE_TEST_V11.md` end to end.

## 10. Monitor
- `/health/worker` — queue depth, stale leases.
- `sources.processing_stage`, `ocr_pages_done / ocr_pages_total`, `toc_status` — real coverage.
- `processing_jobs` where `status='paused_quota'` — these auto-resume.
- Logs: `[worker] health`, `[worker] toc`, `[ocr:*]`, `[limits]`.

## 11. Honest note on Render Free
The free tier **sleeps after inactivity** and is not a high-availability worker. Durable
jobs survive — they live in Postgres with leases and checkpoints — but **processing pauses
until the service wakes**. A dedicated worker service (§7) or a paid instance removes the
pause.

## 12. Rollback
See `ROLLBACK_GUIDE_V11.md`.
