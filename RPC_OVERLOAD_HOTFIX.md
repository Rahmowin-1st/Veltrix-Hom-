# RPC overload hotfix

Render's worker sends named RPC arguments:

- `p_lease_seconds`
- `p_worker_id`

The database contained two overloads with those same names but reversed type order:

- `claim_processing_job(integer, text)` — canonical
- `claim_processing_job(text, integer)` — stale and must be removed

## Apply now

Run `migration-012-rpc-overload-hotfix.sql` once in Supabase SQL Editor.
No Render redeploy is required for the live fix. The worker retries automatically.

## Expected

The final query returns exactly one `claim_processing_job` row. Within about 10–20 seconds,
Render should stop logging the ambiguity error and queued source processing should resume.
