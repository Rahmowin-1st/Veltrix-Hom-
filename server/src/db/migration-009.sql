-- =====================================================================
-- VELTRIX HOM — migration-009  (V9 completion)
--
-- Builds on migration-008. Everything here is ADDITIVE and IDEMPOTENT:
-- no table is dropped, no existing row is destroyed, every statement is
-- guarded with IF NOT EXISTS / CREATE OR REPLACE / DO-block checks, so it
-- is safe to run on the live database and safe to run twice.
--
-- Deployment order:  007  →  008  →  009
--
-- What it adds, and why:
--   1. Processing-job lease fencing + heartbeat extension + metrics
--   2. Quota-paused jobs that can actually resume (auto + manual)
--   3. Crash-idempotent per-page chunk indexing
--   4. Chat-request lease extension during long generation
--   5. Evidence records (answer → verified source page/chunk relation)
--   6. Printed-page mapping segments (multi-anchor, not one global offset)
--   7. Honest per-source capability flags
--   8. RLS / grant audit + safe search_path on every security-definer fn
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROCESSING-JOB FENCING, HEARTBEAT, METRICS
--
-- V8 renewed a lease by writing heartbeat_at + lease_expires_at guarded
-- only by lease_token. That is a valid optimistic guard, but there was no
-- monotonic fence, no way to EXTEND a lease mid-operation, and the lease
-- could quietly expire while a page was being downloaded or embedded. We
-- add a fencing counter, an explicit extend RPC, cancellation, and metrics.
-- ---------------------------------------------------------------------
alter table public.processing_jobs add column if not exists lease_version   bigint  not null default 0;
alter table public.processing_jobs add column if not exists worker_id        text;
alter table public.processing_jobs add column if not exists time_budget_ms   int     not null default 45000;
alter table public.processing_jobs add column if not exists extractor_version text  not null default 'pdfjs-1';
alter table public.processing_jobs add column if not exists cancel_requested_at timestamptz;
alter table public.processing_jobs add column if not exists resume_reason    text;
alter table public.processing_jobs add column if not exists resume_count     int     not null default 0;
alter table public.processing_jobs add column if not exists pages_processed  int     not null default 0;
alter table public.processing_jobs add column if not exists ms_in_pdf        bigint  not null default 0;
alter table public.processing_jobs add column if not exists retry_class      text;   -- transient | quota | fatal

-- 'cancelled' already allowed by the 008 check constraint. Nothing to widen.

-- Re-create claim so it (a) reclaims quota-paused jobs whose backoff has
-- elapsed, (b) stamps a worker id, and (c) bumps the fencing counter. The
-- FOR UPDATE SKIP LOCKED queue semantics from 008 are preserved.
create or replace function public.claim_processing_job(
  p_lease_seconds int default 120,
  p_worker_id     text default null
)
returns public.processing_jobs
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_job public.processing_jobs; v_lease uuid := gen_random_uuid();
begin
  select * into v_job from public.processing_jobs
   where cancel_requested_at is null
     and (
           (status = 'queued'       and (next_retry_at is null or next_retry_at <= now()))
        or (status = 'paused_quota' and next_retry_at is not null and next_retry_at <= now())
        or (status = 'running'      and lease_expires_at < now())   -- reclaim dead lease
         )
   order by priority asc, created_at asc
   for update skip locked
   limit 1;

  if not found then return null; end if;

  update public.processing_jobs
     set status           = 'running',
         lease_token      = v_lease,
         lease_version    = v_job.lease_version + 1,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         heartbeat_at     = now(),
         worker_id        = coalesce(p_worker_id, worker_id),
         attempt_count    = v_job.attempt_count + 1,
         resume_count     = case when v_job.status = 'paused_quota'
                                 then v_job.resume_count + 1 else v_job.resume_count end,
         resume_reason    = case when v_job.status = 'paused_quota'
                                 then 'quota_backoff_elapsed' else resume_reason end,
         error_code       = case when v_job.status = 'paused_quota' then null else error_code end,
         updated_at       = now()
   where id = v_job.id
   returning * into v_job;

  return v_job;
end; $$;

-- Renews the lease of a running job. Returns the new expiry, or NULL when
-- the caller no longer owns the lease (a newer worker took over). The
-- worker must stop writing the moment this returns NULL.
create or replace function public.extend_processing_job_lease(
  p_job_id uuid, p_lease_token uuid, p_seconds int default 120
)
returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_exp timestamptz;
begin
  update public.processing_jobs
     set lease_expires_at = now() + make_interval(secs => p_seconds),
         heartbeat_at = now(), updated_at = now()
   where id = p_job_id and lease_token = p_lease_token
     and status = 'running' and cancel_requested_at is null
   returning lease_expires_at into v_exp;
  return v_exp;  -- NULL ⇒ lease lost or cancellation requested
end; $$;

-- Persists progress + metrics AND renews the lease in one write, so a
-- checkpoint doubles as a heartbeat.
create or replace function public.checkpoint_processing_job(
  p_job_id uuid, p_lease_token uuid,
  p_checkpoint_page int, p_total_pages int,
  p_pages_processed int default null, p_ms_in_pdf bigint default null,
  p_seconds int default 120
)
returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_exp timestamptz;
begin
  update public.processing_jobs
     set checkpoint_page = p_checkpoint_page,
         total_pages     = coalesce(p_total_pages, total_pages),
         pages_processed = coalesce(p_pages_processed, pages_processed),
         ms_in_pdf       = coalesce(p_ms_in_pdf, ms_in_pdf),
         progress        = least(99, round((p_checkpoint_page::numeric
                             / greatest(coalesce(p_total_pages, total_pages, 1), 1)) * 100)),
         lease_expires_at = now() + make_interval(secs => p_seconds),
         heartbeat_at = now(), updated_at = now()
   where id = p_job_id and lease_token = p_lease_token and status = 'running'
   returning lease_expires_at into v_exp;
  return v_exp;
end; $$;

create or replace function public.complete_processing_job(
  p_job_id uuid, p_lease_token uuid
)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.processing_jobs
     set status = 'completed', progress = 100,
         lease_token = null, lease_expires_at = null, next_retry_at = null,
         updated_at = now()
   where id = p_job_id and lease_token = p_lease_token;
  return found;
end; $$;

-- Fails a job. p_retryable + attempt budget decide whether it re-queues
-- with backoff or terminates. Records a retry classification for /health.
create or replace function public.fail_processing_job(
  p_job_id uuid, p_lease_token uuid,
  p_code text, p_message text,
  p_retryable boolean default true, p_max_attempts int default 5,
  p_backoff_seconds int default 30
)
returns text  -- 'requeued' | 'failed'
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_job public.processing_jobs; v_terminal boolean;
begin
  select * into v_job from public.processing_jobs
   where id = p_job_id and lease_token = p_lease_token for update;
  if not found then return 'lost'; end if;

  v_terminal := (not p_retryable) or v_job.attempt_count >= p_max_attempts;

  update public.processing_jobs
     set status        = case when v_terminal then 'failed' else 'queued' end,
         error_code    = p_code,
         error_message = left(coalesce(p_message,''), 500),
         retry_class   = case when not p_retryable then 'fatal' else 'transient' end,
         lease_token = null, lease_expires_at = null,
         next_retry_at = case when v_terminal then null
                              else now() + make_interval(secs => p_backoff_seconds) end,
         updated_at = now()
   where id = v_job.id;

  if v_terminal then
    update public.sources
       set status = 'failed', error_message = left(coalesce(p_message,''), 300)
     where id = v_job.source_id and user_id = v_job.user_id;
  end if;

  return case when v_terminal then 'failed' else 'requeued' end;
end; $$;

-- Pauses a job because the AI quota is exhausted. Every page already
-- processed is kept; the job resumes automatically once next_retry_at
-- elapses (claim reclaims it) or when a user hits Resume.
create or replace function public.pause_processing_job_quota(
  p_job_id uuid, p_lease_token uuid, p_retry_seconds int default 900
)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.processing_jobs
     set status = 'paused_quota', error_code = 'quota', retry_class = 'quota',
         lease_token = null, lease_expires_at = null,
         next_retry_at = now() + make_interval(secs => p_retry_seconds),
         updated_at = now()
   where id = p_job_id and lease_token = p_lease_token;
  return found;
end; $$;

-- Manual Resume from the Sources screen. Clears the backoff so the next
-- claim picks the job up immediately. Owner-checked.
create or replace function public.resume_processing_job(
  p_user_id uuid, p_source_id uuid
)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.processing_jobs
     set status = 'queued', next_retry_at = now(),
         error_code = null, resume_reason = 'manual', updated_at = now()
   where source_id = p_source_id and user_id = p_user_id
     and status in ('paused_quota','failed');
  -- Move quota-paused pages back to a retryable state.
  update public.source_pages
     set indexing_status = 'pending'
   where source_id = p_source_id and indexing_status = 'paused_quota';
  return found;
end; $$;

-- Cancels processing for a source. A running worker sees cancel_requested_at
-- on its next heartbeat and stops; queued/paused rows terminate at once.
create or replace function public.cancel_processing_job(
  p_user_id uuid, p_source_id uuid
)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.processing_jobs
     set cancel_requested_at = now(),
         status = case when status in ('queued','paused_quota') then 'cancelled' else status end,
         lease_token = case when status in ('queued','paused_quota') then null else lease_token end,
         next_retry_at = null, updated_at = now()
   where source_id = p_source_id and user_id = p_user_id
     and status in ('queued','running','paused_quota');
  return found;
end; $$;

-- ---------------------------------------------------------------------
-- 2. CRASH-IDEMPOTENT CHUNK INDEXING
--
-- V8 inserted chunks then marked the page embedded in two steps; a crash
-- between them duplicated chunks on retry. We give each chunk a stable
-- logical identity and a page relation, so re-running a page is an upsert,
-- not a duplication. embedding_model/version let a model change trigger a
-- controlled reindex instead of silently mixing vector spaces.
-- ---------------------------------------------------------------------
alter table public.source_chunks add column if not exists source_page_id uuid
  references public.source_pages on delete cascade;
alter table public.source_chunks add column if not exists chunker_version  text not null default 'v9-900-150';
alter table public.source_chunks add column if not exists embedding_model   text;
alter table public.source_chunks add column if not exists embedding_version text;

-- Backfill content_hash for any legacy chunk missing one, so the unique
-- index below can be built without a rewrite of history.
update public.source_chunks
   set content_hash = encode(sha256(convert_to(page_number::text || ':' || content, 'UTF8')), 'hex')
 where content_hash is null;

-- Logical uniqueness. Two identical chunks for the same page+chunker can no
-- longer coexist, which is what makes a retried page a no-op instead of a
-- duplicate. Partial (content_hash not null) keeps it safe on legacy rows.
create unique index if not exists source_chunks_logical_uniq
  on public.source_chunks (source_id, page_number, chunk_index, chunker_version, content_hash)
  where content_hash is not null;

create index if not exists source_chunks_page_idx
  on public.source_chunks (source_page_id);

-- Atomic per-page rebuild: delete this page's chunks from OTHER chunker
-- versions (stale) and return, so the worker can insert the current set
-- with ON CONFLICT DO NOTHING and never leave a mixed page. Owner-checked.
create or replace function public.begin_page_reindex(
  p_source_id uuid, p_user_id uuid, p_page_number int, p_chunker_version text
)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.source_chunks
   where source_id = p_source_id and user_id = p_user_id
     and page_number = p_page_number
     and chunker_version is distinct from p_chunker_version;
end; $$;

-- ---------------------------------------------------------------------
-- 3. CHAT-REQUEST LEASE EXTENSION + POLLING HINTS
--
-- A long Gemini generation could outlive the 180s request lease, letting a
-- stale reclaim mark the request uncertain while the first attempt was
-- still working. The heartbeat renews it. Polling hints let the client
-- back off politely and know when a retry is safe.
-- ---------------------------------------------------------------------
alter table public.chat_requests add column if not exists retry_after_ms int;
alter table public.chat_requests add column if not exists provider_call_count int not null default 0;

create or replace function public.extend_chat_request_lease(
  p_user_id uuid, p_request_id uuid, p_lease_token uuid, p_seconds int default 180
)
returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_exp timestamptz;
begin
  update public.chat_requests
     set lease_expires_at = now() + make_interval(secs => p_seconds), updated_at = now()
   where id = p_request_id and user_id = p_user_id and lease_token = p_lease_token
     and status in ('claimed','processing')
   returning lease_expires_at into v_exp;
  return v_exp;  -- NULL ⇒ ownership lost; stop and do not persist
end; $$;

-- ---------------------------------------------------------------------
-- 4. EVIDENCE RECORDS
--
-- A citation must be traceable to a real, owned source page or chunk that
-- was actually supplied to the model. We record the answer↔evidence
-- relation so a citation can never be a number the model invented.
-- ---------------------------------------------------------------------
create table if not exists public.message_evidence (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles on delete cascade,
  message_id     uuid not null references public.messages on delete cascade,
  source_id      uuid references public.sources on delete set null,
  source_page_id uuid references public.source_pages on delete set null,
  chunk_id       uuid references public.source_chunks on delete set null,
  evidence_kind  text not null check (evidence_kind in ('chunk','page','page_image','toc','region')),
  pdf_page_index int,
  printed_page   text,
  quote          text,
  created_at     timestamptz not null default now()
);
create index if not exists message_evidence_message_idx on public.message_evidence (message_id);
create index if not exists message_evidence_user_idx    on public.message_evidence (user_id);

-- ---------------------------------------------------------------------
-- 5. PRINTED-PAGE MAPPING SEGMENTS + PER-PAGE RENDER FIELDS
--
-- One global offset is wrong for real textbooks (Roman front matter,
-- inserts, appendices). Confirmed anchors from 008's source_page_map are
-- grouped into validated segments, each with its own printed↔pdf offset,
-- so "printed page N" resolves through the right segment.
-- ---------------------------------------------------------------------
create table if not exists public.source_page_segments (
  id              uuid primary key default gen_random_uuid(),
  source_id       uuid not null references public.sources on delete cascade,
  pdf_start       int not null,          -- inclusive, 1-based pdf index
  pdf_end         int not null,          -- inclusive
  printed_start   int,                   -- printed number at pdf_start
  printed_kind    text default 'arabic' check (printed_kind in ('arabic','roman','none')),
  offset_value    int not null default 0,-- printed = pdf_index + offset_value
  anchor_count    int not null default 0,-- how many confirmed anchors backed this
  confidence      real not null default 0,
  created_at      timestamptz not null default now(),
  unique (source_id, pdf_start)
);
create index if not exists source_page_segments_source_idx
  on public.source_page_segments (source_id, pdf_start);

alter table public.source_pages add column if not exists printed_page_kind text
  check (printed_page_kind in ('arabic','roman','none'));
alter table public.source_pages add column if not exists render_status text
  check (render_status in ('pending','rendered','failed','skipped'));
alter table public.source_pages add column if not exists thumbnail_path text;
alter table public.source_pages add column if not exists ocr_model text;
alter table public.source_pages add column if not exists ocr_schema_version text;
alter table public.source_pages add column if not exists text_quality real;

-- ---------------------------------------------------------------------
-- 6. HONEST PER-SOURCE CAPABILITY FLAGS
--
-- A scanned book can answer exact-page questions long before it is fully
-- searchable. One ambiguous `ready` flag hid that. 008 added exact_page /
-- full_search; here we split out printed-map + semantic coverage.
-- ---------------------------------------------------------------------
alter table public.sources add column if not exists capability_printed_map boolean not null default false;
alter table public.sources add column if not exists capability_semantic    boolean not null default false;
alter table public.sources add column if not exists ocr_pages_done int not null default 0;
alter table public.sources add column if not exists ocr_pages_total int not null default 0;
alter table public.sources add column if not exists printed_map_confidence real not null default 0;

-- ---------------------------------------------------------------------
-- 7. GRANTS — trusted backend only for every mutation RPC
-- ---------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.claim_processing_job(int,text)',
    'public.extend_processing_job_lease(uuid,uuid,int)',
    'public.checkpoint_processing_job(uuid,uuid,int,int,int,bigint,int)',
    'public.complete_processing_job(uuid,uuid)',
    'public.fail_processing_job(uuid,uuid,text,text,boolean,int,int)',
    'public.pause_processing_job_quota(uuid,uuid,int)',
    'public.resume_processing_job(uuid,uuid)',
    'public.cancel_processing_job(uuid,uuid)',
    'public.begin_page_reindex(uuid,uuid,int,text)',
    'public.extend_chat_request_lease(uuid,uuid,uuid,int)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

-- The 008 single-arg claim_processing_job(int) is superseded by the two-arg
-- version above. Drop the obsolete overload so callers cannot pick the old
-- one by accident. Safe: the backend is redeployed with the new signature.
drop function if exists public.claim_processing_job(int);

-- ---------------------------------------------------------------------
-- 8. RLS AUDIT
--
-- Reads that the browser performs directly (with the user's own JWT) must
-- be owner-scoped; all writes still flow through the service-role backend.
-- Enable RLS + owner SELECT policy on the new evidence/segment tables and
-- confirm it on the account-owned tables the client can read.
-- ---------------------------------------------------------------------
alter table public.message_evidence     enable row level security;
alter table public.source_page_segments enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='message_evidence' and policyname='message_evidence_own') then
    create policy message_evidence_own on public.message_evidence
      for select using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename='source_page_segments' and policyname='source_page_segments_own') then
    create policy source_page_segments_own on public.source_page_segments
      for select using (
        exists (select 1 from public.sources s
                 where s.id = source_page_segments.source_id and s.user_id = auth.uid())
      );
  end if;
end $$;

-- =====================================================================
-- migration-009 complete.
-- Verify with:  server/src/db/migration-verify-009.sql
-- =====================================================================
