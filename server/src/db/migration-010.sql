-- =====================================================================
-- VELTRIX HOM — migration-010  (V10 CONVERGENCE MIGRATION)
--
-- PURPOSE: converge BOTH possible database states into one V10 schema.
--
--   State A: migrations 001–008 applied, 009 never run.
--   State B: migrations 001–009 partially or fully applied.
--
-- You do NOT need to know which state you are in, and you must NOT run an
-- unverified partial 009. Run every missing migration through 008, then run
-- THIS file. Part 1 replays all of 009's DDL idempotently (a no-op in State
-- B, the full 009 upgrade in State A); Part 2 adds the new V10 objects.
--
-- Every statement is additive and guarded (IF NOT EXISTS / CREATE OR
-- REPLACE / DO-block inspection). No table is dropped, no user row is
-- destroyed, and the whole file is safe to run twice.
--
-- Deployment order:  …→ 008  →  010     (009 optional / skippable)
--
-- Part 1 (from 009): job fencing + heartbeat, resumable quota pause,
--   crash-idempotent chunks, chat-request lease extension, evidence
--   records, printed-page segments, honest capability flags, RLS audit.
-- Part 2 (new in V10): TOC routing metadata, per-page structured items
--   (exercises / formulas / tables / diagrams), OCR work claiming, upload
--   session lifecycle, per-user abuse counters, manual printed-page
--   correction, request failure classification.
-- =====================================================================

-- #####################################################################
-- ## PART 1 — 009 CONVERGENCE REPLAY (idempotent; no-op in State B)  ##
-- #####################################################################
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

-- #####################################################################
-- ## PART 2 — NEW IN V10                                             ##
-- #####################################################################

-- ---------------------------------------------------------------------
-- 9. TOC / INDEX ROUTING METADATA
--    A table of contents is a ROUTING CLUE, never final evidence: it tells
--    the retriever which printed pages are worth OCR-ing first for a topic.
--    Wired into: services/tocRouter.ts, jobWorker extract_toc stage.
-- ---------------------------------------------------------------------
create table if not exists public.source_toc_entries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  source_id         uuid not null references public.sources(id) on delete cascade,
  topic             text not null,
  printed_page      int,
  printed_page_end  int,
  depth             int  not null default 0,
  confidence        real not null default 0,
  evidence_pdf_page int,
  created_at        timestamptz not null default now()
);
create index if not exists source_toc_entries_source_idx on public.source_toc_entries (source_id);
create index if not exists source_toc_entries_topic_idx  on public.source_toc_entries using gin (topic gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 10. PER-PAGE STRUCTURED ITEMS (exercises / formulas / tables / diagrams)
--     Produced by OCR structured output. These become addressable evidence
--     IDs (exercise:<uuid>, formula:<uuid>, table:<uuid>, region:<uuid>) so
--     "solve problem 4 on page 127" can be locked to a real detected item
--     instead of a page-level guess.
--     Wired into: services/ocr.ts, services/evidence.ts, routes/chat.ts.
-- ---------------------------------------------------------------------
create table if not exists public.source_page_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  source_id      uuid not null references public.sources(id) on delete cascade,
  source_page_id uuid references public.source_pages(id) on delete cascade,
  pdf_page_index int  not null,
  item_kind      text not null check (item_kind in ('exercise','formula','table','diagram','heading','region')),
  label          text,             -- e.g. "4", "4.2", "Misol 3"
  content        text,
  ordinal        int  not null default 0,
  confidence     real not null default 0,
  needs_visual   boolean not null default false,
  ocr_model      text,
  schema_version text,
  created_at     timestamptz not null default now()
);
create index if not exists source_page_items_page_idx  on public.source_page_items (source_id, pdf_page_index);
create index if not exists source_page_items_label_idx on public.source_page_items (source_id, item_kind, label);
-- One row per (page, kind, label, ordinal): re-running OCR on a page must
-- update rather than duplicate the exercises it finds.
create unique index if not exists source_page_items_uniq
  on public.source_page_items (source_id, pdf_page_index, item_kind, coalesce(label,''), ordinal);

-- ---------------------------------------------------------------------
-- 11. OCR WORK CLAIMING
--     Interactive "read page 127 now" OCR must outrank background indexing,
--     and two workers must never OCR the same page twice.
--     Wired into: services/ocr.ts (claimOcrPage / completeOcrPage).
-- ---------------------------------------------------------------------
alter table public.source_pages add column if not exists ocr_claimed_at   timestamptz;
alter table public.source_pages add column if not exists ocr_claimed_by   text;
alter table public.source_pages add column if not exists ocr_priority     int not null default 0;
alter table public.source_pages add column if not exists ocr_attempts     int not null default 0;

-- Atomically claim one page for OCR. Returns the claimed page or nothing.
-- Highest ocr_priority first, then lowest page index. A stale claim (older
-- than p_stale_seconds) is reclaimable, so a crashed worker cannot strand a page.
create or replace function public.claim_ocr_page(
  p_user_id       uuid,
  p_source_id     uuid,
  p_worker_id     text,
  p_stale_seconds int default 300
) returns table (page_id uuid, pdf_page_index int)
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.source_pages sp
     set ocr_status     = 'running',
         ocr_claimed_at = now(),
         ocr_claimed_by = p_worker_id,
         ocr_attempts   = sp.ocr_attempts + 1,
         updated_at     = now()
   where sp.id = (
     select p.id from public.source_pages p
       join public.sources s on s.id = p.source_id
      where p.source_id = p_source_id
        and s.user_id   = p_user_id
        and p.page_type in ('scanned','mixed')
        and coalesce(p.ocr_status,'pending') in ('pending','failed')
        and (p.ocr_claimed_at is null or p.ocr_claimed_at < now() - make_interval(secs => p_stale_seconds))
      order by p.ocr_priority desc, p.pdf_page_index asc
      limit 1
      for update skip locked
   )
  returning sp.id, sp.pdf_page_index;
end $$;

-- Store an OCR result and keep the source's coverage counters truthful.
create or replace function public.complete_ocr_page(
  p_user_id    uuid,
  p_page_id    uuid,
  p_text       text,
  p_confidence real,
  p_model      text,
  p_schema     text,
  p_printed    text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_source uuid;
begin
  update public.source_pages sp
     set ocr_text           = p_text,
         ocr_status         = 'done',
         ocr_confidence     = p_confidence,
         ocr_model          = p_model,
         ocr_schema_version = p_schema,
         printed_page_label = coalesce(p_printed, sp.printed_page_label),
         ocr_claimed_at     = null,
         indexing_status    = 'pending',
         updated_at         = now()
    from public.sources s
   where sp.id = p_page_id and s.id = sp.source_id and s.user_id = p_user_id
  returning sp.source_id into v_source;

  if v_source is null then return false; end if;

  update public.sources s
     set ocr_pages_done = (select count(*) from public.source_pages p
                            where p.source_id = v_source and p.ocr_status = 'done'),
         ocr_pages_total = (select count(*) from public.source_pages p
                            where p.source_id = v_source and p.page_type in ('scanned','mixed')),
         updated_at = now()
   where s.id = v_source;
  return true;
end $$;

-- Raise the OCR priority of a page the user is actively asking about.
create or replace function public.prioritize_ocr_pages(
  p_user_id   uuid,
  p_source_id uuid,
  p_from_page int,
  p_to_page   int,
  p_priority  int default 100
) returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update public.source_pages sp
     set ocr_priority = greatest(sp.ocr_priority, p_priority), updated_at = now()
    from public.sources s
   where s.id = sp.source_id and s.user_id = p_user_id
     and sp.source_id = p_source_id
     and sp.pdf_page_index between p_from_page and p_to_page
     and sp.page_type in ('scanned','mixed')
     and coalesce(sp.ocr_status,'pending') <> 'done';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- 12. UPLOAD SESSION LIFECYCLE (resumable / TUS)
--     A reserved source whose bytes never arrive must be reclaimable, and a
--     resumed upload must find its own session again.
--     Wired into: routes/upload.ts (create / finalize / abort / cleanup).
-- ---------------------------------------------------------------------
alter table public.sources add column if not exists upload_protocol   text;   -- tus | signed | multipart
alter table public.sources add column if not exists upload_expires_at timestamptz;
alter table public.sources add column if not exists upload_started_at timestamptz;

-- Remove reservations that were never finalized. Returns how many it freed.
create or replace function public.cleanup_abandoned_uploads(
  p_user_id uuid,
  p_older_than_minutes int default 120
) returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  delete from public.sources s
   where s.user_id = p_user_id
     and s.status  = 'uploading'
     and s.created_at < now() - make_interval(mins => p_older_than_minutes);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- 13. PER-USER ABUSE COUNTERS
--     Bounds concurrent chat requests, active uploads and OCR spend per
--     user without needing an external rate-limit service.
--     Wired into: services/limits.ts + routes/chat.ts, upload.ts.
-- ---------------------------------------------------------------------
create table if not exists public.user_usage_counters (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  metric      text not null,          -- ocr_pages | chat_requests | uploads
  window_start timestamptz not null,
  count       int  not null default 0,
  primary key (user_id, metric, window_start)
);
create index if not exists user_usage_counters_window_idx on public.user_usage_counters (window_start);

-- Increment a rolling window counter and report whether the user is still
-- under the limit. One statement, so concurrent requests cannot both slip past.
create or replace function public.bump_usage_counter(
  p_user_id uuid,
  p_metric  text,
  p_limit   int,
  p_window_seconds int default 3600
) returns table (allowed boolean, current_count int)
language plpgsql security definer set search_path = public as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count  int;
begin
  insert into public.user_usage_counters (user_id, metric, window_start, count)
  values (p_user_id, p_metric, v_window, 1)
  on conflict (user_id, metric, window_start)
    do update set count = public.user_usage_counters.count + 1
  returning public.user_usage_counters.count into v_count;

  return query select (v_count <= p_limit), v_count;
end $$;

-- ---------------------------------------------------------------------
-- 14. MANUAL PRINTED-PAGE CORRECTION + REQUEST FAILURE CLASS
-- ---------------------------------------------------------------------
-- source_page_map already carries printed_label / printed_number / confidence
-- and a verified_by discriminator ('ocr' | 'user' | 'inferred') from 008, so a
-- user correction is simply the highest-trust row for that PDF page.

-- Lets the client answer "this is actually printed page N" and have every
-- later lookup trust that anchor over an inferred one.
create or replace function public.set_printed_page_anchor(
  p_user_id     uuid,
  p_source_id   uuid,
  p_pdf_page    int,
  p_printed     int
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.sources where id = p_source_id and user_id = p_user_id) then
    return false;
  end if;
  insert into public.source_page_map (source_id, pdf_page_index, printed_label, printed_number, confidence, verified_by)
  values (p_source_id, p_pdf_page, p_printed::text, p_printed, 1, 'user')
  on conflict (source_id, pdf_page_index)
    do update set printed_label  = excluded.printed_label,
                  printed_number = excluded.printed_number,
                  confidence     = 1,
                  verified_by    = 'user';
  return true;
end $$;

alter table public.chat_requests add column if not exists failure_class text;  -- validation | provider | quota | internal
alter table public.chat_requests add column if not exists retryable boolean not null default true;

-- ---------------------------------------------------------------------
-- 15. GRANTS — every new mutation RPC is trusted-backend only
-- ---------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.claim_ocr_page(uuid,uuid,text,int)',
    'public.complete_ocr_page(uuid,uuid,text,real,text,text,text)',
    'public.prioritize_ocr_pages(uuid,uuid,int,int,int)',
    'public.cleanup_abandoned_uploads(uuid,int)',
    'public.bump_usage_counter(uuid,text,int,int)',
    'public.set_printed_page_anchor(uuid,uuid,int,int)'
  ] loop
    begin
      execute format('revoke all on function %s from public, anon, authenticated', fn);
      execute format('grant execute on function %s to service_role', fn);
    exception when undefined_function then
      raise notice 'skip grants for missing function %', fn;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 16. RLS ON NEW TABLES — owner may read; writes stay with the backend
-- ---------------------------------------------------------------------
alter table public.source_toc_entries   enable row level security;
alter table public.source_page_items    enable row level security;
alter table public.user_usage_counters  enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='source_toc_entries' and policyname='source_toc_entries_own') then
    create policy source_toc_entries_own on public.source_toc_entries
      for select using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename='source_page_items' and policyname='source_page_items_own') then
    create policy source_page_items_own on public.source_page_items
      for select using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename='user_usage_counters' and policyname='user_usage_counters_own') then
    create policy user_usage_counters_own on public.user_usage_counters
      for select using (user_id = auth.uid());
  end if;
end $$;

-- =====================================================================
-- migration-010 complete (State A and State B both converged).
-- Verify with:  MIGRATION_VERIFY_V10.sql
-- =====================================================================
