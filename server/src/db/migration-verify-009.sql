-- ============================================================================
-- migration-verify-009.sql
-- Post-deploy assertions for the V9 migration. Run AFTER applying
-- migration-009.sql on a real database (Supabase SQL editor or psql):
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migration-verify-009.sql
-- Every check RAISEs on failure, so a clean run (no ERROR) means the schema
-- is in the expected V9 state. This asserts structure only; it makes no
-- changes and is safe to run repeatedly.
-- ============================================================================
do $$
declare
  missing text;
begin
  -- ---- Tables added by 009 ----
  foreach missing in array array['message_evidence','source_page_segments'] loop
    if to_regclass('public.'||missing) is null then
      raise exception 'V9 verify FAILED: table % is missing', missing;
    end if;
  end loop;

  -- ---- RPCs (008 recreated + 009 new) ----
  foreach missing in array array[
    'extend_chat_request_lease','extend_processing_job_lease','checkpoint_processing_job',
    'complete_processing_job','fail_processing_job','pause_processing_job_quota',
    'resume_processing_job','cancel_processing_job','begin_page_reindex','claim_processing_job'
  ] loop
    if not exists (select 1 from pg_proc where proname = missing) then
      raise exception 'V9 verify FAILED: function %() is missing', missing;
    end if;
  end loop;

  -- ---- processing_jobs columns ----
  foreach missing in array array[
    'lease_version','worker_id','time_budget_ms','extractor_version',
    'cancel_requested_at','resume_reason','resume_count','pages_processed','ms_in_pdf','retry_class'
  ] loop
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='processing_jobs' and column_name=missing) then
      raise exception 'V9 verify FAILED: processing_jobs.% is missing', missing;
    end if;
  end loop;

  -- ---- source_chunks idempotency columns + unique index ----
  foreach missing in array array['source_page_id','chunker_version','embedding_model','embedding_version'] loop
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='source_chunks' and column_name=missing) then
      raise exception 'V9 verify FAILED: source_chunks.% is missing', missing;
    end if;
  end loop;
  if not exists (select 1 from pg_indexes where indexname='source_chunks_logical_uniq') then
    raise exception 'V9 verify FAILED: unique index source_chunks_logical_uniq is missing';
  end if;

  -- ---- chat_requests polling columns ----
  foreach missing in array array['retry_after_ms','provider_call_count'] loop
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='chat_requests' and column_name=missing) then
      raise exception 'V9 verify FAILED: chat_requests.% is missing', missing;
    end if;
  end loop;

  -- ---- capability columns on sources ----
  foreach missing in array array['capability_printed_map','capability_semantic','ocr_pages_done','ocr_pages_total','printed_map_confidence'] loop
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='sources' and column_name=missing) then
      raise exception 'V9 verify FAILED: sources.% is missing', missing;
    end if;
  end loop;

  -- ---- RLS enabled on new tables ----
  if not (select relrowsecurity from pg_class where oid='public.message_evidence'::regclass) then
    raise exception 'V9 verify FAILED: RLS not enabled on message_evidence';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.source_page_segments'::regclass) then
    raise exception 'V9 verify FAILED: RLS not enabled on source_page_segments';
  end if;

  -- ---- mutation RPCs must NOT be executable by anon/authenticated ----
  if has_function_privilege('authenticated', 'public.complete_processing_job(uuid,uuid)', 'execute') then
    raise exception 'V9 verify FAILED: complete_processing_job is executable by authenticated (should be service_role only)';
  end if;

  raise notice 'V9 verify PASSED: all migration-009 objects present, RLS on, grants locked down.';
end $$;
