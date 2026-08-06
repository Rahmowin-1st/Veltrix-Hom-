-- ============================================================================
-- MIGRATION_VERIFY_V11.sql
-- Run AFTER applying migration-010 then migration-011:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f MIGRATION_VERIFY_V11.sql
-- Every check RAISEs on failure. A clean run means the schema is in the
-- expected V11 state. Read-only; safe to run repeatedly.
-- ============================================================================
do $$
declare missing text;
begin
  -- ---- Tables (010 + 011) ----
  foreach missing in array array[
    'message_evidence','source_page_segments','source_toc_entries',
    'source_page_items','user_usage_counters','chat_requests','processing_jobs'
  ] loop
    if to_regclass('public.'||missing) is null then
      raise exception 'V11 verify FAILED: table % is missing', missing;
    end if;
  end loop;

  -- ---- Functions ----
  foreach missing in array array[
    'claim_chat_request','complete_chat_request','extend_chat_request_lease',
    'claim_processing_job','extend_processing_job_lease','checkpoint_processing_job',
    'complete_processing_job','fail_processing_job','pause_processing_job_quota',
    'resume_processing_job','cancel_processing_job',
    'claim_ocr_page','complete_ocr_page','prioritize_ocr_pages',
    'cleanup_abandoned_uploads','bump_usage_counter','set_printed_page_anchor',
    'reindex_page_versioned','replace_toc_entries'
  ] loop
    if not exists (select 1 from pg_proc where proname = missing) then
      raise exception 'V11 verify FAILED: function %() is missing', missing;
    end if;
  end loop;

  -- ---- V11 columns ----
  foreach missing in array array['toc_status','toc_entry_count','upload_protocol','ocr_pages_done'] loop
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='sources' and column_name=missing) then
      raise exception 'V11 verify FAILED: sources.% is missing', missing;
    end if;
  end loop;
  foreach missing in array array['ocr_claimed_at','ocr_priority','ocr_attempts'] loop
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='source_pages' and column_name=missing) then
      raise exception 'V11 verify FAILED: source_pages.% is missing', missing;
    end if;
  end loop;
  foreach missing in array array['source_page_id','chunker_version','embedding_model','content_hash'] loop
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='source_chunks' and column_name=missing) then
      raise exception 'V11 verify FAILED: source_chunks.% is missing', missing;
    end if;
  end loop;

  -- ---- Uniqueness that makes indexing crash-idempotent ----
  if not exists (select 1 from pg_indexes where indexname='source_chunks_page_owned_uniq') then
    raise exception 'V11 verify FAILED: index source_chunks_page_owned_uniq is missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname='source_page_items_uniq') then
    raise exception 'V11 verify FAILED: index source_page_items_uniq is missing';
  end if;

  -- ---- RLS on every user-owned table added since 008 ----
  foreach missing in array array[
    'message_evidence','source_page_segments','source_toc_entries',
    'source_page_items','user_usage_counters'
  ] loop
    if not (select relrowsecurity from pg_class where oid = ('public.'||missing)::regclass) then
      raise exception 'V11 verify FAILED: RLS not enabled on %', missing;
    end if;
  end loop;

  -- ---- Mutation RPCs must be service_role only ----
  if has_function_privilege('authenticated','public.complete_ocr_page(uuid,uuid,text,real,text,text,text)','execute') then
    raise exception 'V11 verify FAILED: complete_ocr_page executable by authenticated';
  end if;
  if has_function_privilege('authenticated','public.replace_toc_entries(uuid,uuid,jsonb,int)','execute') then
    raise exception 'V11 verify FAILED: replace_toc_entries executable by authenticated';
  end if;
  if has_function_privilege('anon','public.reindex_page_versioned(uuid,uuid,text,text)','execute') then
    raise exception 'V11 verify FAILED: reindex_page_versioned executable by anon';
  end if;

  raise notice 'V11 verify PASSED: schema, indexes, RLS and grants are correct.';
end $$;
