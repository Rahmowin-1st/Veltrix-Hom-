-- ============================================================================
-- VELTRIX HOM — migration-010 FIXED (Supabase/PostgreSQL)
--
-- Safe convergence migration for either state:
--   A) 001..008 applied, 009 skipped
--   B) 009 partially/fully applied, including the older incompatible variant
--
-- Fixes:
--   * 42P13 return-type conflicts by dropping exact RPC signatures first
--   * syntax errors caused by the reserved legacy column name "offset"
--   * partially-created source_page_segments schemas (pdf_from/pdf_to vs
--     pdf_start/pdf_end)
--   * duplicate rows that would block unique-index creation
--   * CREATE TABLE IF NOT EXISTS not converging missing columns
--   * resume_processing_job returning the result of the wrong UPDATE
--   * rerun/idempotency failures after an interrupted migration
--
-- Apply AFTER migration-008. migration-009 is optional/skippable.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. PREFLIGHT
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','sources','source_pages','source_chunks','messages',
    'chat_requests','processing_jobs','source_page_map'
  ] loop
    if to_regclass('public.' || t) is null then
      raise exception 'migration-010 requires public.% (apply through migration-008 first)', t;
    end if;
  end loop;
end $$;

-- pg_trgm is optional for correctness. Try to enable it; if the project role
-- cannot, the migration continues and creates a normal fallback index later.
do $$
begin
  begin
    execute 'create extension if not exists pg_trgm with schema extensions';
  exception
    when others then
      raise notice 'pg_trgm could not be enabled (%); using fallback TOC index', SQLERRM;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 1. PROCESSING JOB COLUMNS
-- ---------------------------------------------------------------------------
alter table public.processing_jobs add column if not exists lease_version bigint not null default 0;
alter table public.processing_jobs add column if not exists worker_id text;
alter table public.processing_jobs add column if not exists time_budget_ms int not null default 45000;
alter table public.processing_jobs add column if not exists extractor_version text not null default 'pdfjs-1';
alter table public.processing_jobs add column if not exists cancel_requested_at timestamptz;
alter table public.processing_jobs add column if not exists resume_reason text;
alter table public.processing_jobs add column if not exists resume_count int not null default 0;
alter table public.processing_jobs add column if not exists pages_processed int not null default 0;
alter table public.processing_jobs add column if not exists ms_in_pdf bigint not null default 0;
alter table public.processing_jobs add column if not exists retry_class text;

-- CREATE OR REPLACE cannot change a function's return type. Remove the exact
-- signatures first so this migration also repairs partial 009/010 attempts.
drop function if exists public.claim_processing_job(int,text);
drop function if exists public.extend_processing_job_lease(uuid,uuid,int);
drop function if exists public.checkpoint_processing_job(uuid,uuid,int,int,int,bigint,int);
drop function if exists public.complete_processing_job(uuid,uuid);
drop function if exists public.fail_processing_job(uuid,uuid,text,text,boolean,int,int);
drop function if exists public.pause_processing_job_quota(uuid,uuid,int);
drop function if exists public.resume_processing_job(uuid,uuid);
drop function if exists public.cancel_processing_job(uuid,uuid);

create function public.claim_processing_job(
  p_lease_seconds int default 120,
  p_worker_id text default null
)
returns public.processing_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.processing_jobs;
  v_lease uuid := gen_random_uuid();
begin
  select *
    into v_job
    from public.processing_jobs
   where cancel_requested_at is null
     and (
          (status = 'queued' and (next_retry_at is null or next_retry_at <= now()))
       or (status = 'paused_quota' and next_retry_at is not null and next_retry_at <= now())
       or (status = 'running' and lease_expires_at < now())
     )
   order by priority asc, created_at asc
   for update skip locked
   limit 1;

  if not found then
    return null;
  end if;

  update public.processing_jobs
     set status = 'running',
         lease_token = v_lease,
         lease_version = v_job.lease_version + 1,
         lease_expires_at = now() + make_interval(secs => greatest(p_lease_seconds, 1)),
         heartbeat_at = now(),
         worker_id = coalesce(p_worker_id, worker_id),
         attempt_count = v_job.attempt_count + 1,
         resume_count = case when v_job.status = 'paused_quota'
                             then v_job.resume_count + 1 else v_job.resume_count end,
         resume_reason = case when v_job.status = 'paused_quota'
                              then 'quota_backoff_elapsed' else resume_reason end,
         error_code = case when v_job.status = 'paused_quota' then null else error_code end,
         updated_at = now()
   where id = v_job.id
   returning * into v_job;

  return v_job;
end
$$;

create function public.extend_processing_job_lease(
  p_job_id uuid,
  p_lease_token uuid,
  p_seconds int default 120
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_exp timestamptz;
begin
  update public.processing_jobs
     set lease_expires_at = now() + make_interval(secs => greatest(p_seconds, 1)),
         heartbeat_at = now(),
         updated_at = now()
   where id = p_job_id
     and lease_token = p_lease_token
     and status = 'running'
     and cancel_requested_at is null
   returning lease_expires_at into v_exp;

  return v_exp;
end
$$;

create function public.checkpoint_processing_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_checkpoint_page int,
  p_total_pages int,
  p_pages_processed int default null,
  p_ms_in_pdf bigint default null,
  p_seconds int default 120
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_exp timestamptz;
begin
  update public.processing_jobs
     set checkpoint_page = greatest(coalesce(p_checkpoint_page, 0), 0),
         total_pages = coalesce(p_total_pages, total_pages),
         pages_processed = coalesce(p_pages_processed, pages_processed),
         ms_in_pdf = coalesce(p_ms_in_pdf, ms_in_pdf),
         progress = least(
           99,
           round(
             greatest(coalesce(p_checkpoint_page, 0), 0)::numeric
             / greatest(coalesce(p_total_pages, total_pages, 1), 1)
             * 100
           )
         ),
         lease_expires_at = now() + make_interval(secs => greatest(p_seconds, 1)),
         heartbeat_at = now(),
         updated_at = now()
   where id = p_job_id
     and lease_token = p_lease_token
     and status = 'running'
     and cancel_requested_at is null
   returning lease_expires_at into v_exp;

  return v_exp;
end
$$;

create function public.complete_processing_job(
  p_job_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.processing_jobs
     set status = 'completed',
         progress = 100,
         lease_token = null,
         lease_expires_at = null,
         next_retry_at = null,
         updated_at = now()
   where id = p_job_id
     and lease_token = p_lease_token
     and status = 'running';

  return found;
end
$$;

create function public.fail_processing_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_code text,
  p_message text,
  p_retryable boolean default true,
  p_max_attempts int default 5,
  p_backoff_seconds int default 30
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.processing_jobs;
  v_terminal boolean;
begin
  select *
    into v_job
    from public.processing_jobs
   where id = p_job_id and lease_token = p_lease_token
   for update;

  if not found then
    return 'lost';
  end if;

  v_terminal := (not p_retryable) or v_job.attempt_count >= greatest(p_max_attempts, 1);

  update public.processing_jobs
     set status = case when v_terminal then 'failed' else 'queued' end,
         error_code = p_code,
         error_message = left(coalesce(p_message, ''), 500),
         retry_class = case when not p_retryable then 'fatal' else 'transient' end,
         lease_token = null,
         lease_expires_at = null,
         next_retry_at = case when v_terminal then null
                              else now() + make_interval(secs => greatest(p_backoff_seconds, 1)) end,
         updated_at = now()
   where id = v_job.id;

  if v_terminal then
    update public.sources
       set status = 'failed',
           error_message = left(coalesce(p_message, ''), 300),
           updated_at = now()
     where id = v_job.source_id and user_id = v_job.user_id;
  end if;

  return case when v_terminal then 'failed' else 'requeued' end;
end
$$;

create function public.pause_processing_job_quota(
  p_job_id uuid,
  p_lease_token uuid,
  p_retry_seconds int default 900
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.processing_jobs
     set status = 'paused_quota',
         error_code = 'quota',
         retry_class = 'quota',
         lease_token = null,
         lease_expires_at = null,
         next_retry_at = now() + make_interval(secs => greatest(p_retry_seconds, 1)),
         updated_at = now()
   where id = p_job_id
     and lease_token = p_lease_token
     and status = 'running';

  return found;
end
$$;

create function public.resume_processing_job(
  p_user_id uuid,
  p_source_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resumed boolean := false;
begin
  update public.processing_jobs
     set status = 'queued',
         next_retry_at = now(),
         error_code = null,
         resume_reason = 'manual',
         cancel_requested_at = null,
         updated_at = now()
   where source_id = p_source_id
     and user_id = p_user_id
     and status in ('paused_quota', 'failed');

  v_resumed := found;

  update public.source_pages
     set indexing_status = 'pending',
         updated_at = now()
   where source_id = p_source_id
     and indexing_status = 'paused_quota';

  return v_resumed;
end
$$;

create function public.cancel_processing_job(
  p_user_id uuid,
  p_source_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.processing_jobs
     set cancel_requested_at = now(),
         status = case when status in ('queued', 'paused_quota') then 'cancelled' else status end,
         lease_token = case when status in ('queued', 'paused_quota') then null else lease_token end,
         lease_expires_at = case when status in ('queued', 'paused_quota') then null else lease_expires_at end,
         next_retry_at = null,
         updated_at = now()
   where source_id = p_source_id
     and user_id = p_user_id
     and status in ('queued', 'running', 'paused_quota');

  return found;
end
$$;

-- Obsolete migration-008 overload. Drop only after the replacement exists.
drop function if exists public.claim_processing_job(int);

-- ---------------------------------------------------------------------------
-- 2. CRASH-IDEMPOTENT CHUNKS
-- ---------------------------------------------------------------------------
alter table public.source_chunks add column if not exists source_page_id uuid references public.source_pages on delete cascade;
alter table public.source_chunks add column if not exists chunker_version text not null default 'v9-900-150';
alter table public.source_chunks add column if not exists embedding_model text;
alter table public.source_chunks add column if not exists embedding_version text;

-- Repair page ownership for legacy chunks where possible.
update public.source_chunks c
   set source_page_id = (
     select p.id
       from public.source_pages p
      where p.source_id = c.source_id
        and p.page_number = c.page_number
      order by p.id
      limit 1
   )
 where c.source_page_id is null;

update public.source_chunks
   set content_hash = encode(
     sha256(convert_to(coalesce(page_number::text, '') || ':' || coalesce(content, ''), 'UTF8')),
     'hex'
   )
 where content_hash is null;

-- Remove exact legacy duplicates before creating the unique index.
delete from public.source_chunks a
using public.source_chunks b
where a.ctid > b.ctid
  and a.source_id = b.source_id
  and a.page_number is not distinct from b.page_number
  and a.chunk_index is not distinct from b.chunk_index
  and a.chunker_version is not distinct from b.chunker_version
  and a.content_hash is not distinct from b.content_hash;

create unique index if not exists source_chunks_logical_uniq
  on public.source_chunks (source_id, page_number, chunk_index, chunker_version, content_hash)
  where content_hash is not null;

create index if not exists source_chunks_page_idx
  on public.source_chunks (source_page_id);

drop function if exists public.begin_page_reindex(uuid,uuid,int,text);
create function public.begin_page_reindex(
  p_source_id uuid,
  p_user_id uuid,
  p_page_number int,
  p_chunker_version text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.sources
     where id = p_source_id and user_id = p_user_id
  ) then
    raise exception 'source_not_found_or_not_owned' using errcode = 'P0002';
  end if;

  delete from public.source_chunks
   where source_id = p_source_id
     and user_id = p_user_id
     and page_number = p_page_number
     and chunker_version is distinct from p_chunker_version;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. CHAT REQUEST LEASE
-- ---------------------------------------------------------------------------
alter table public.chat_requests add column if not exists retry_after_ms int;
alter table public.chat_requests add column if not exists provider_call_count int not null default 0;

-- Main fix for ERROR 42P13.
drop function if exists public.extend_chat_request_lease(uuid,uuid,uuid,integer);
create function public.extend_chat_request_lease(
  p_user_id uuid,
  p_request_id uuid,
  p_lease_token uuid,
  p_seconds int default 180
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_exp timestamptz;
begin
  update public.chat_requests
     set lease_expires_at = now() + make_interval(secs => greatest(p_seconds, 1)),
         updated_at = now()
   where id = p_request_id
     and user_id = p_user_id
     and lease_token = p_lease_token
     and status in ('claimed', 'processing')
   returning lease_expires_at into v_exp;

  return v_exp;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. EVIDENCE — supports both historical table shapes
-- ---------------------------------------------------------------------------
-- One older V9 branch used message_evidence(message_id,evidence_id) as a
-- join table. V10 uses message_evidence as the evidence record itself. This
-- hybrid convergence keeps both call paths valid while the backend is rolled
-- forward, instead of dropping user evidence or breaking the old RPC.
create table if not exists public.message_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles on delete cascade,
  message_id uuid not null references public.messages on delete cascade,
  source_id uuid references public.sources on delete set null,
  source_page_id uuid references public.source_pages on delete set null,
  chunk_id uuid references public.source_chunks on delete set null,
  evidence_kind text,
  pdf_page_index int,
  printed_page text,
  quote text,
  created_at timestamptz not null default now()
);

alter table public.message_evidence add column if not exists id uuid default gen_random_uuid();
alter table public.message_evidence add column if not exists evidence_id uuid;
alter table public.message_evidence add column if not exists user_id uuid references public.profiles on delete cascade;
alter table public.message_evidence add column if not exists message_id uuid references public.messages on delete cascade;
alter table public.message_evidence add column if not exists source_id uuid references public.sources on delete set null;
alter table public.message_evidence add column if not exists source_page_id uuid references public.source_pages on delete set null;
alter table public.message_evidence add column if not exists chunk_id uuid references public.source_chunks on delete set null;
alter table public.message_evidence add column if not exists evidence_kind text;
alter table public.message_evidence add column if not exists pdf_page_index int;
alter table public.message_evidence add column if not exists printed_page text;
alter table public.message_evidence add column if not exists quote text;
alter table public.message_evidence add column if not exists created_at timestamptz default now();

-- Backfill canonical ownership from messages. When the legacy source_evidence
-- table exists, also retain its source/page/chunk metadata.
update public.message_evidence me
   set user_id = coalesce(me.user_id, m.user_id)
  from public.messages m
 where m.id = me.message_id
   and me.user_id is null;

do $$
begin
  if to_regclass('public.source_evidence') is not null then
    execute $sql$
      update public.message_evidence me
         set user_id = coalesce(me.user_id, e.user_id),
             source_id = coalesce(me.source_id, e.source_id),
             source_page_id = coalesce(me.source_page_id, e.source_page_id),
             chunk_id = coalesce(me.chunk_id, e.source_chunk_id),
             evidence_kind = coalesce(
               me.evidence_kind,
               case e.evidence_type
                 when 'page_image' then 'page_image'
                 when 'toc' then 'toc'
                 when 'chunk' then 'chunk'
                 else 'region'
               end
             ),
             quote = coalesce(me.quote, e.quote)
        from public.source_evidence e
       where me.evidence_id = e.id
    $sql$;
  end if;
end $$;

-- Replace an old composite primary key with the stable surrogate id. The
-- old logical pair remains unique through a partial index below.
do $$
declare
  r record;
begin
  for r in
    select c.conname, pg_get_constraintdef(c.oid) as def
      from pg_constraint c
     where c.conrelid = 'public.message_evidence'::regclass
       and c.contype = 'p'
  loop
    if r.def not ilike '%(id)%' then
      execute format('alter table public.message_evidence drop constraint %I', r.conname);
    end if;
  end loop;

  alter table public.message_evidence alter column evidence_id drop not null;
  alter table public.message_evidence alter column id set default gen_random_uuid();

  update public.message_evidence set id = gen_random_uuid() where id is null;

  if not exists (
    select 1 from pg_constraint c
     where c.conrelid = 'public.message_evidence'::regclass
       and c.contype = 'p'
  ) then
    alter table public.message_evidence add constraint message_evidence_pkey primary key (id);
  end if;
end $$;

delete from public.message_evidence a
using public.message_evidence b
where a.ctid > b.ctid
  and a.message_id = b.message_id
  and a.evidence_id = b.evidence_id
  and a.evidence_id is not null;

create unique index if not exists message_evidence_legacy_pair_uniq
  on public.message_evidence (message_id, evidence_id)
  where evidence_id is not null;

-- Use a named NOT VALID constraint so legacy rows can be preserved safely.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.message_evidence'::regclass
       and conname = 'message_evidence_kind_check'
  ) then
    alter table public.message_evidence
      add constraint message_evidence_kind_check
      check (evidence_kind is null or evidence_kind in ('chunk','page','page_image','toc','region')) not valid;
  end if;
end $$;

create index if not exists message_evidence_message_idx on public.message_evidence (message_id);
create index if not exists message_evidence_user_idx on public.message_evidence (user_id);

-- ---------------------------------------------------------------------------
-- 5. PAGE SEGMENT CONVERGENCE
-- ---------------------------------------------------------------------------
-- The broken alternate migration used an unquoted reserved column named
-- offset and different names (pdf_from/pdf_to). The canonical schema below
-- never uses the reserved word and can absorb either shape.
create table if not exists public.source_page_segments (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources on delete cascade,
  pdf_start int,
  pdf_end int,
  printed_start int,
  printed_kind text default 'arabic',
  offset_value int not null default 0,
  anchor_count int not null default 0,
  confidence real not null default 0,
  created_at timestamptz not null default now()
);

alter table public.source_page_segments add column if not exists source_id uuid references public.sources on delete cascade;
alter table public.source_page_segments add column if not exists pdf_start int;
alter table public.source_page_segments add column if not exists pdf_end int;
alter table public.source_page_segments add column if not exists printed_start int;
alter table public.source_page_segments add column if not exists printed_kind text default 'arabic';
alter table public.source_page_segments add column if not exists offset_value int not null default 0;
alter table public.source_page_segments add column if not exists anchor_count int not null default 0;
alter table public.source_page_segments add column if not exists confidence real not null default 0;
alter table public.source_page_segments add column if not exists created_at timestamptz not null default now();

-- Dynamically copy old columns. Quoting "offset" avoids ERROR 42601.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'source_page_segments' and column_name = 'pdf_from'
  ) then
    execute 'update public.source_page_segments set pdf_start = coalesce(pdf_start, pdf_from)';
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'source_page_segments' and column_name = 'pdf_to'
  ) then
    execute 'update public.source_page_segments set pdf_end = coalesce(pdf_end, pdf_to)';
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'source_page_segments' and column_name = 'printed_from'
  ) then
    execute 'update public.source_page_segments set printed_start = coalesce(printed_start, printed_from)';
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'source_page_segments' and column_name = 'offset'
  ) then
    execute 'update public.source_page_segments set offset_value = coalesce("offset", offset_value, 0)';
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'source_page_segments' and column_name = 'anchors'
  ) then
    execute 'update public.source_page_segments set anchor_count = coalesce(anchors, anchor_count, 0)';
  end if;

  -- Legacy columns may be NOT NULL. Canonical V10 inserts do not name them,
  -- so relax only those obsolete constraints and keep values synchronized by
  -- the compatibility trigger below.
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='source_page_segments' and column_name='pdf_from') then
    execute 'alter table public.source_page_segments alter column pdf_from drop not null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='source_page_segments' and column_name='pdf_to') then
    execute 'alter table public.source_page_segments alter column pdf_to drop not null';
  end if;
end $$;

create or replace function public.sync_source_page_segments_compat()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  j jsonb := to_jsonb(new);
  v int;
begin
  if j ? 'pdf_from' then
    v := coalesce(nullif(j->>'pdf_start','')::int, nullif(j->>'pdf_from','')::int);
    if v is not null then
      j := jsonb_set(j, '{pdf_start}', to_jsonb(v), true);
      j := jsonb_set(j, '{pdf_from}', to_jsonb(v), true);
    end if;
  end if;
  if j ? 'pdf_to' then
    v := coalesce(nullif(j->>'pdf_end','')::int, nullif(j->>'pdf_to','')::int);
    if v is not null then
      j := jsonb_set(j, '{pdf_end}', to_jsonb(v), true);
      j := jsonb_set(j, '{pdf_to}', to_jsonb(v), true);
    end if;
  end if;
  if j ? 'printed_from' then
    v := coalesce(nullif(j->>'printed_start','')::int, nullif(j->>'printed_from','')::int);
    if v is not null then
      j := jsonb_set(j, '{printed_start}', to_jsonb(v), true);
      j := jsonb_set(j, '{printed_from}', to_jsonb(v), true);
    end if;
  end if;
  if j ? 'offset' then
    v := coalesce(nullif(j->>'offset','')::int, nullif(j->>'offset_value','')::int, 0);
    j := jsonb_set(j, '{offset_value}', to_jsonb(v), true);
    j := jsonb_set(j, '{offset}', to_jsonb(v), true);
  end if;
  if j ? 'anchors' then
    v := coalesce(nullif(j->>'anchors','')::int, nullif(j->>'anchor_count','')::int, 0);
    j := jsonb_set(j, '{anchor_count}', to_jsonb(v), true);
    j := jsonb_set(j, '{anchors}', to_jsonb(v), true);
  end if;
  new := jsonb_populate_record(new, j);
  return new;
end
$$;

drop trigger if exists source_page_segments_compat_trg on public.source_page_segments;
create trigger source_page_segments_compat_trg
before insert or update on public.source_page_segments
for each row execute function public.sync_source_page_segments_compat();

update public.source_page_segments
   set pdf_end = coalesce(pdf_end, pdf_start),
       offset_value = coalesce(offset_value, 0),
       anchor_count = coalesce(anchor_count, 0),
       confidence = coalesce(confidence, 0),
       printed_kind = coalesce(printed_kind, 'arabic')
 where pdf_end is null
    or offset_value is null
    or anchor_count is null
    or confidence is null
    or printed_kind is null;

-- If a failed old migration left duplicate canonical rows, keep one.
delete from public.source_page_segments a
using public.source_page_segments b
where a.ctid > b.ctid
  and a.source_id = b.source_id
  and a.pdf_start is not distinct from b.pdf_start;

create unique index if not exists source_page_segments_source_start_uniq
  on public.source_page_segments (source_id, pdf_start)
  where pdf_start is not null;

create index if not exists source_page_segments_source_idx
  on public.source_page_segments (source_id, pdf_start);

-- Canonical checks, NOT VALID so corrupt legacy rows do not block deployment.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.source_page_segments'::regclass
       and conname = 'source_page_segments_range_check'
  ) then
    alter table public.source_page_segments
      add constraint source_page_segments_range_check
      check (pdf_start is null or (pdf_start > 0 and pdf_end >= pdf_start)) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.source_page_segments'::regclass
       and conname = 'source_page_segments_kind_check'
  ) then
    alter table public.source_page_segments
      add constraint source_page_segments_kind_check
      check (printed_kind in ('arabic','roman','none')) not valid;
  end if;
end $$;

alter table public.source_pages add column if not exists printed_page_kind text;
alter table public.source_pages add column if not exists render_status text;
alter table public.source_pages add column if not exists thumbnail_path text;
alter table public.source_pages add column if not exists ocr_model text;
alter table public.source_pages add column if not exists ocr_schema_version text;
alter table public.source_pages add column if not exists text_quality real;

-- Allow both historical 'ready' and newer 'rendered'. Remove only check
-- constraints that explicitly reference render_status.
do $$
declare
  r record;
begin
  for r in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.source_pages'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%render_status%'
  loop
    execute format('alter table public.source_pages drop constraint %I', r.conname);
  end loop;

  alter table public.source_pages
    add constraint source_pages_render_status_check
    check (render_status is null or render_status in ('pending','ready','rendered','failed','skipped')) not valid;
end $$;

-- ---------------------------------------------------------------------------
-- 6. SOURCE CAPABILITIES
-- ---------------------------------------------------------------------------
alter table public.sources add column if not exists capability_printed_map boolean not null default false;
alter table public.sources add column if not exists capability_semantic boolean not null default false;
alter table public.sources add column if not exists ocr_pages_done int not null default 0;
alter table public.sources add column if not exists ocr_pages_total int not null default 0;
alter table public.sources add column if not exists printed_map_confidence real not null default 0;

-- ---------------------------------------------------------------------------
-- 7. V10 TABLES
-- ---------------------------------------------------------------------------
create table if not exists public.source_toc_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  topic text not null,
  printed_page int,
  printed_page_end int,
  depth int not null default 0,
  confidence real not null default 0,
  evidence_pdf_page int,
  created_at timestamptz not null default now()
);

alter table public.source_toc_entries add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.source_toc_entries add column if not exists source_id uuid references public.sources(id) on delete cascade;
alter table public.source_toc_entries add column if not exists topic text;
alter table public.source_toc_entries add column if not exists printed_page int;
alter table public.source_toc_entries add column if not exists printed_page_end int;
alter table public.source_toc_entries add column if not exists depth int not null default 0;
alter table public.source_toc_entries add column if not exists confidence real not null default 0;
alter table public.source_toc_entries add column if not exists evidence_pdf_page int;
alter table public.source_toc_entries add column if not exists created_at timestamptz not null default now();

create index if not exists source_toc_entries_source_idx on public.source_toc_entries (source_id);

-- Prefer trigram GIN when available, otherwise create a safe fallback.
do $$
declare
  op_schema text;
begin
  select n.nspname
    into op_schema
    from pg_opclass o
    join pg_namespace n on n.oid = o.opcnamespace
   where o.opcname = 'gin_trgm_ops'
   limit 1;

  if op_schema is not null then
    execute format(
      'create index if not exists source_toc_entries_topic_idx on public.source_toc_entries using gin (topic %I.gin_trgm_ops)',
      op_schema
    );
  else
    execute 'create index if not exists source_toc_entries_topic_fallback_idx on public.source_toc_entries (lower(topic))';
  end if;
end $$;

create table if not exists public.source_page_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  source_page_id uuid references public.source_pages(id) on delete cascade,
  pdf_page_index int not null,
  item_kind text not null,
  label text,
  content text,
  ordinal int not null default 0,
  confidence real not null default 0,
  needs_visual boolean not null default false,
  ocr_model text,
  schema_version text,
  created_at timestamptz not null default now()
);

alter table public.source_page_items add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.source_page_items add column if not exists source_id uuid references public.sources(id) on delete cascade;
alter table public.source_page_items add column if not exists source_page_id uuid references public.source_pages(id) on delete cascade;
alter table public.source_page_items add column if not exists pdf_page_index int;
alter table public.source_page_items add column if not exists item_kind text;
alter table public.source_page_items add column if not exists label text;
alter table public.source_page_items add column if not exists content text;
alter table public.source_page_items add column if not exists ordinal int not null default 0;
alter table public.source_page_items add column if not exists confidence real not null default 0;
alter table public.source_page_items add column if not exists needs_visual boolean not null default false;
alter table public.source_page_items add column if not exists ocr_model text;
alter table public.source_page_items add column if not exists schema_version text;
alter table public.source_page_items add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.source_page_items'::regclass
       and conname = 'source_page_items_kind_check'
  ) then
    alter table public.source_page_items
      add constraint source_page_items_kind_check
      check (item_kind in ('exercise','formula','table','diagram','heading','region')) not valid;
  end if;
end $$;

create index if not exists source_page_items_page_idx on public.source_page_items (source_id, pdf_page_index);
create index if not exists source_page_items_label_idx on public.source_page_items (source_id, item_kind, label);

-- Dedupe before expression unique index.
delete from public.source_page_items a
using public.source_page_items b
where a.ctid > b.ctid
  and a.source_id = b.source_id
  and a.pdf_page_index = b.pdf_page_index
  and a.item_kind = b.item_kind
  and coalesce(a.label, '') = coalesce(b.label, '')
  and a.ordinal = b.ordinal;

create unique index if not exists source_page_items_uniq
  on public.source_page_items (
    source_id,
    pdf_page_index,
    item_kind,
    coalesce(label, ''),
    ordinal
  );

-- ---------------------------------------------------------------------------
-- 8. OCR RPCS
-- ---------------------------------------------------------------------------
alter table public.source_pages add column if not exists ocr_claimed_at timestamptz;
alter table public.source_pages add column if not exists ocr_claimed_by text;
alter table public.source_pages add column if not exists ocr_priority int not null default 0;
alter table public.source_pages add column if not exists ocr_attempts int not null default 0;

-- If an older variant used ocr_attempt_count, preserve its values.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='source_pages' and column_name='ocr_attempt_count'
  ) then
    execute 'update public.source_pages set ocr_attempts = greatest(ocr_attempts, coalesce(ocr_attempt_count, 0))';
  end if;
end $$;

drop function if exists public.claim_ocr_page(uuid,uuid,text,int);
drop function if exists public.complete_ocr_page(uuid,uuid,text,real,text,text,text);
drop function if exists public.prioritize_ocr_pages(uuid,uuid,int,int,int);

create function public.claim_ocr_page(
  p_user_id uuid,
  p_source_id uuid,
  p_worker_id text,
  p_stale_seconds int default 300
)
returns table (page_id uuid, pdf_page_index int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update public.source_pages sp
     set ocr_status = 'running',
         ocr_claimed_at = now(),
         ocr_claimed_by = p_worker_id,
         ocr_attempts = sp.ocr_attempts + 1,
         updated_at = now()
   where sp.id = (
     select p.id
       from public.source_pages p
       join public.sources s on s.id = p.source_id
      where p.source_id = p_source_id
        and s.user_id = p_user_id
        and p.page_type in ('scanned','mixed')
        and coalesce(p.ocr_status, 'pending') in ('pending','failed')
        and (
          p.ocr_claimed_at is null
          or p.ocr_claimed_at < now() - make_interval(secs => greatest(p_stale_seconds, 1))
        )
      order by p.ocr_priority desc, p.pdf_page_index asc
      for update skip locked
      limit 1
   )
  returning sp.id, sp.pdf_page_index;
end
$$;

create function public.complete_ocr_page(
  p_user_id uuid,
  p_page_id uuid,
  p_text text,
  p_confidence real,
  p_model text,
  p_schema text,
  p_printed text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source uuid;
begin
  update public.source_pages sp
     set ocr_text = p_text,
         ocr_status = 'done',
         ocr_confidence = p_confidence,
         ocr_model = p_model,
         ocr_schema_version = p_schema,
         printed_page_label = coalesce(p_printed, sp.printed_page_label),
         ocr_claimed_at = null,
         ocr_claimed_by = null,
         indexing_status = 'pending',
         updated_at = now()
    from public.sources s
   where sp.id = p_page_id
     and s.id = sp.source_id
     and s.user_id = p_user_id
   returning sp.source_id into v_source;

  if v_source is null then
    return false;
  end if;

  update public.sources s
     set ocr_pages_done = (
           select count(*)::int
             from public.source_pages p
            where p.source_id = v_source and p.ocr_status = 'done'
         ),
         ocr_pages_total = (
           select count(*)::int
             from public.source_pages p
            where p.source_id = v_source and p.page_type in ('scanned','mixed')
         ),
         updated_at = now()
   where s.id = v_source;

  return true;
end
$$;

create function public.prioritize_ocr_pages(
  p_user_id uuid,
  p_source_id uuid,
  p_from_page int,
  p_to_page int,
  p_priority int default 100
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
  v_from int := least(p_from_page, p_to_page);
  v_to int := greatest(p_from_page, p_to_page);
begin
  update public.source_pages sp
     set ocr_priority = greatest(sp.ocr_priority, p_priority),
         updated_at = now()
    from public.sources s
   where s.id = sp.source_id
     and s.user_id = p_user_id
     and sp.source_id = p_source_id
     and sp.pdf_page_index between v_from and v_to
     and sp.page_type in ('scanned','mixed')
     and coalesce(sp.ocr_status, 'pending') <> 'done';

  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- ---------------------------------------------------------------------------
-- 9. UPLOADS, LIMITS, PAGE ANCHOR
-- ---------------------------------------------------------------------------
alter table public.sources add column if not exists upload_protocol text;
alter table public.sources add column if not exists upload_expires_at timestamptz;
alter table public.sources add column if not exists upload_started_at timestamptz;

drop function if exists public.cleanup_abandoned_uploads(uuid,int);
create function public.cleanup_abandoned_uploads(
  p_user_id uuid,
  p_older_than_minutes int default 120
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  delete from public.sources s
   where s.user_id = p_user_id
     and s.status = 'uploading'
     and s.created_at < now() - make_interval(mins => greatest(p_older_than_minutes, 1));

  get diagnostics v_count = row_count;
  return v_count;
end
$$;

create table if not exists public.user_usage_counters (
  user_id uuid not null references public.profiles(id) on delete cascade,
  metric text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (user_id, metric, window_start)
);

alter table public.user_usage_counters add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.user_usage_counters add column if not exists metric text;
alter table public.user_usage_counters add column if not exists window_start timestamptz;
alter table public.user_usage_counters add column if not exists count int not null default 0;

delete from public.user_usage_counters a
using public.user_usage_counters b
where a.ctid > b.ctid
  and a.user_id = b.user_id
  and a.metric = b.metric
  and a.window_start = b.window_start;

create unique index if not exists user_usage_counters_identity_uniq
  on public.user_usage_counters (user_id, metric, window_start);

create index if not exists user_usage_counters_window_idx
  on public.user_usage_counters (window_start);

drop function if exists public.bump_usage_counter(uuid,text,int,int);
create function public.bump_usage_counter(
  p_user_id uuid,
  p_metric text,
  p_limit int,
  p_window_seconds int default 3600
)
returns table (allowed boolean, current_count int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seconds int := greatest(p_window_seconds, 1);
  v_window timestamptz;
  v_count int;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / v_seconds) * v_seconds);

  insert into public.user_usage_counters (user_id, metric, window_start, count)
  values (p_user_id, p_metric, v_window, 1)
  on conflict (user_id, metric, window_start)
  do update set count = public.user_usage_counters.count + 1
  returning public.user_usage_counters.count into v_count;

  return query select v_count <= greatest(p_limit, 0), v_count;
end
$$;

drop function if exists public.set_printed_page_anchor(uuid,uuid,int,int);
create function public.set_printed_page_anchor(
  p_user_id uuid,
  p_source_id uuid,
  p_pdf_page int,
  p_printed int
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.sources
     where id = p_source_id and user_id = p_user_id
  ) then
    return false;
  end if;

  insert into public.source_page_map (
    source_id,
    pdf_page_index,
    printed_label,
    printed_number,
    confidence,
    verified_by
  )
  values (p_source_id, p_pdf_page, p_printed::text, p_printed, 1, 'user')
  on conflict (source_id, pdf_page_index)
  do update set
    printed_label = excluded.printed_label,
    printed_number = excluded.printed_number,
    confidence = 1,
    verified_by = 'user';

  return true;
end
$$;

alter table public.chat_requests add column if not exists failure_class text;
alter table public.chat_requests add column if not exists retryable boolean not null default true;

-- ---------------------------------------------------------------------------
-- 10. RLS
-- ---------------------------------------------------------------------------
alter table public.message_evidence enable row level security;
alter table public.source_page_segments enable row level security;
alter table public.source_toc_entries enable row level security;
alter table public.source_page_items enable row level security;
alter table public.user_usage_counters enable row level security;

do $$
begin
  drop policy if exists message_evidence_own on public.message_evidence;
  create policy message_evidence_own on public.message_evidence
    for select using (
      auth.uid() = user_id
      or exists (
        select 1 from public.messages m
         where m.id = message_evidence.message_id
           and m.user_id = auth.uid()
      )
    );

  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='source_page_segments' and policyname='source_page_segments_own'
  ) then
    create policy source_page_segments_own on public.source_page_segments
      for select using (
        exists (
          select 1 from public.sources s
           where s.id = source_page_segments.source_id
             and s.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='source_toc_entries' and policyname='source_toc_entries_own'
  ) then
    create policy source_toc_entries_own on public.source_toc_entries
      for select using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='source_page_items' and policyname='source_page_items_own'
  ) then
    create policy source_page_items_own on public.source_page_items
      for select using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='user_usage_counters' and policyname='user_usage_counters_own'
  ) then
    create policy user_usage_counters_own on public.user_usage_counters
      for select using (user_id = auth.uid());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 11. LOCK DOWN MUTATION RPCS
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.claim_processing_job(integer,text)',
    'public.extend_processing_job_lease(uuid,uuid,integer)',
    'public.checkpoint_processing_job(uuid,uuid,integer,integer,integer,bigint,integer)',
    'public.complete_processing_job(uuid,uuid)',
    'public.fail_processing_job(uuid,uuid,text,text,boolean,integer,integer)',
    'public.pause_processing_job_quota(uuid,uuid,integer)',
    'public.resume_processing_job(uuid,uuid)',
    'public.cancel_processing_job(uuid,uuid)',
    'public.begin_page_reindex(uuid,uuid,integer,text)',
    'public.extend_chat_request_lease(uuid,uuid,uuid,integer)',
    'public.claim_ocr_page(uuid,uuid,text,integer)',
    'public.complete_ocr_page(uuid,uuid,text,real,text,text,text)',
    'public.prioritize_ocr_pages(uuid,uuid,integer,integer,integer)',
    'public.cleanup_abandoned_uploads(uuid,integer)',
    'public.bump_usage_counter(uuid,text,integer,integer)',
    'public.set_printed_page_anchor(uuid,uuid,integer,integer)'
  ] loop
    if to_regprocedure(fn) is not null then
      begin
        execute format('revoke all on function %s from public, anon, authenticated', fn);
        execute format('grant execute on function %s to service_role', fn);
      exception when undefined_object then
        raise notice 'Supabase API roles are unavailable; skipped grants for %', fn;
      end;
    end if;
  end loop;
end $$;

commit;

-- migration-010-fixed complete.
