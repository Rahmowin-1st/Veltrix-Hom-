-- ============================================================================
-- VELTRIX HOM — verification for migration-010-fixed + migration-011-fixed
-- Read-only. Run after both migrations. Any failed assertion raises ERROR.
-- ============================================================================

do $$
declare
  item text;
  lease_fn regprocedure;
begin
  -- Required tables.
  foreach item in array array[
    'message_evidence','source_page_segments','source_toc_entries',
    'source_page_items','user_usage_counters','chat_requests','processing_jobs'
  ] loop
    if to_regclass('public.' || item) is null then
      raise exception 'VERIFY FAILED: table public.% is missing', item;
    end if;
  end loop;

  -- Required V10/V11 RPC signatures.
  foreach item in array array[
    'claim_processing_job(integer,text)',
    'extend_processing_job_lease(uuid,uuid,integer)',
    'checkpoint_processing_job(uuid,uuid,integer,integer,integer,bigint,integer)',
    'complete_processing_job(uuid,uuid)',
    'fail_processing_job(uuid,uuid,text,text,boolean,integer,integer)',
    'pause_processing_job_quota(uuid,uuid,integer)',
    'resume_processing_job(uuid,uuid)',
    'cancel_processing_job(uuid,uuid)',
    'begin_page_reindex(uuid,uuid,integer,text)',
    'extend_chat_request_lease(uuid,uuid,uuid,integer)',
    'claim_ocr_page(uuid,uuid,text,integer)',
    'complete_ocr_page(uuid,uuid,text,real,text,text,text)',
    'prioritize_ocr_pages(uuid,uuid,integer,integer,integer)',
    'cleanup_abandoned_uploads(uuid,integer)',
    'bump_usage_counter(uuid,text,integer,integer)',
    'set_printed_page_anchor(uuid,uuid,integer,integer)',
    'reindex_page_versioned(uuid,uuid,text,text)',
    'replace_toc_entries(uuid,uuid,jsonb,integer)'
  ] loop
    if to_regprocedure('public.' || item) is null then
      raise exception 'VERIFY FAILED: function public.% is missing', item;
    end if;
  end loop;

  -- Exact repair for the reported 42P13 conflict.
  lease_fn := to_regprocedure('public.extend_chat_request_lease(uuid,uuid,uuid,integer)');
  if pg_get_function_result(lease_fn) <> 'timestamp with time zone' then
    raise exception 'VERIFY FAILED: extend_chat_request_lease return type is %, expected timestamptz',
      pg_get_function_result(lease_fn);
  end if;

  -- Required columns that prove the two historical page-segment shapes converged.
  foreach item in array array[
    'pdf_start','pdf_end','printed_start','offset_value','anchor_count','confidence'
  ] loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema='public'
         and table_name='source_page_segments'
         and column_name=item
    ) then
      raise exception 'VERIFY FAILED: source_page_segments.% is missing', item;
    end if;
  end loop;

  -- Required indexes and idempotency barriers.
  foreach item in array array[
    'source_chunks_logical_uniq',
    'source_chunks_page_owned_uniq',
    'source_page_items_uniq',
    'source_page_segments_source_start_uniq',
    'user_usage_counters_identity_uniq',
    'message_evidence_legacy_pair_uniq'
  ] loop
    if not exists (
      select 1 from pg_indexes
       where schemaname='public' and indexname=item
    ) then
      raise exception 'VERIFY FAILED: index % is missing', item;
    end if;
  end loop;

  -- message_evidence must have a surrogate-id primary key even when it began
  -- as the older (message_id,evidence_id) join table.
  if not exists (
    select 1
      from pg_constraint c
      join pg_attribute a
        on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
     where c.conrelid='public.message_evidence'::regclass
       and c.contype='p'
       and cardinality(c.conkey)=1
       and a.attname='id'
  ) then
    raise exception 'VERIFY FAILED: message_evidence primary key is not id';
  end if;

  -- No duplicates should remain behind the uniqueness barriers.
  if exists (
    select 1 from public.user_usage_counters
     group by user_id, metric, window_start having count(*) > 1
  ) then
    raise exception 'VERIFY FAILED: duplicate user_usage_counters rows remain';
  end if;

  if exists (
    select 1 from public.message_evidence
     where evidence_id is not null
     group by message_id, evidence_id having count(*) > 1
  ) then
    raise exception 'VERIFY FAILED: duplicate legacy message evidence pairs remain';
  end if;

  -- RLS must be active on all new account-owned tables.
  foreach item in array array[
    'message_evidence','source_page_segments','source_toc_entries',
    'source_page_items','user_usage_counters'
  ] loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname=item and c.relrowsecurity
    ) then
      raise exception 'VERIFY FAILED: RLS is disabled on public.%', item;
    end if;
  end loop;

  if exists (
    select 1 from information_schema.columns
     where table_schema='public'
       and table_name='source_page_segments'
       and column_name='offset'
  ) then
    raise notice 'Legacy quoted column source_page_segments."offset" remains for backward compatibility; canonical code uses offset_value.';
  end if;

  raise notice 'VELTRIX FIXED MIGRATIONS VERIFY PASSED';
end $$;
