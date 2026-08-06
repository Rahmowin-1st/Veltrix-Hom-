# V11 Rollback Guide

Migration 011 is **additive**: one index, two functions, two columns. Rolling the **code**
back needs no database change.

## Fast path — code only (recommended)
1. Redeploy the previous server and client builds.
2. Leave migration-011 in place; older code ignores the new objects.
3. `GET /health` to confirm.

One caveat: the V11 indexer upserts with conflict target
`(source_page_id, chunk_index, chunker_version, content_hash)`. Older code targets the V10
index, which is still present — so an older build keeps working unchanged.

## Partial rollback — turn V11 behaviour off without dropping anything
- Stop TOC extraction: `update sources set toc_status='none'` for affected sources; the
  worker only parses when `toc_status` is pending, and routing degrades to indexed
  coverage with an honest disclosure.
- Force full re-embedding again (undo the skip optimisation) by bumping the chunker
  version constant, which makes `reindex_page_versioned` treat existing chunks as stale.

## Full rollback of 011 (rarely needed)
```sql
begin;
drop index if exists public.source_chunks_page_owned_uniq;
drop function if exists public.reindex_page_versioned(uuid,uuid,text,text);
drop function if exists public.replace_toc_entries(uuid,uuid,jsonb,int);
-- Leave sources.toc_status / toc_entry_count in place: they are harmless and
-- dropping them discards real extraction state.
commit;
```
Do **not** drop `source_toc_entries`, `message_evidence` or `source_page_segments` if any
answers already reference them — they hold the provenance of citations shown to users.

## Data safety
No V11 change deletes or rewrites user content. The only data write is the backfill of
`source_chunks.source_page_id` from the matching page row — deterministic, additive, and
requiring no reversal.
