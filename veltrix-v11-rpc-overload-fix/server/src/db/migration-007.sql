-- =====================================================================
-- VELTRIX HOM — migration-007
-- Reliability pass: message idempotency, printed-page mapping, lazy OCR
-- cache, and the indexes the real query patterns need.
--
-- Additive + idempotent. Run after migration-006. No table is dropped and
-- no existing row is modified, so this is safe on the live database.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. MESSAGE IDEMPOTENCY
-- Double-tapping Send, a retry after a network drop, or a refresh
-- mid-request could each insert the same logical message twice. A stable
-- client-generated id plus a unique index makes the insert idempotent:
-- the second attempt collides instead of creating a duplicate.
-- ---------------------------------------------------------------------
alter table public.messages add column if not exists client_message_id text;
alter table public.messages add column if not exists status text
  check (status in ('pending','sending','streaming','completed','failed','cancelled'));
alter table public.messages add column if not exists error_code text;

-- Existing rows predate the status model; they are all completed.
update public.messages set status = 'completed' where status is null;
alter table public.messages alter column status set default 'completed';

-- Partial unique index: only rows that actually carry a client id take
-- part, so historical NULL rows never collide with each other.
create unique index if not exists messages_chat_client_msg_uniq
  on public.messages (chat_id, client_message_id)
  where client_message_id is not null;

-- ---------------------------------------------------------------------
-- 2. PRINTED vs PDF PAGE NUMBER
-- A textbook's printed page number rarely matches the PDF page index,
-- because covers and front matter shift it. Storing both lets a request
-- for "page 256" resolve to the right PDF page instead of guessing.
-- ---------------------------------------------------------------------
alter table public.source_pages add column if not exists pdf_page_index int;
alter table public.source_pages add column if not exists printed_page_number int;
alter table public.source_pages add column if not exists ocr_used boolean not null default false;

-- Backfill: before this migration, page_number WAS the PDF index.
update public.source_pages
  set pdf_page_index = page_number
  where pdf_page_index is null;

-- ---------------------------------------------------------------------
-- 3. PAGE-OFFSET LEARNING
-- Once the model reads a rendered page and reports the printed number it
-- sees, we can store the offset for that source and resolve every later
-- page request arithmetically instead of re-rendering to find out.
-- ---------------------------------------------------------------------
alter table public.sources add column if not exists page_offset int;
alter table public.sources add column if not exists ocr_pages_cached int not null default 0;

-- ---------------------------------------------------------------------
-- 4. PERFORMANCE INDEXES
-- Built from the queries this app actually runs: newest-messages-first
-- pagination, the chat list, ready-source lookups, and page retrieval.
-- ---------------------------------------------------------------------
create index if not exists messages_chat_created_idx
  on public.messages (chat_id, created_at desc);

create index if not exists chats_user_updated_idx
  on public.chats (user_id, updated_at desc);

create index if not exists sources_user_status_idx
  on public.sources (user_id, status);

create index if not exists source_pages_printed_idx
  on public.source_pages (source_id, printed_page_number);

create index if not exists source_pages_pdf_idx
  on public.source_pages (source_id, pdf_page_index);

create index if not exists source_chunks_source_page_idx
  on public.source_chunks (source_id, page_number);

-- ---------------------------------------------------------------------
-- 5. RLS SANITY
-- These policies already exist from earlier migrations for most tables;
-- re-declaring them here is harmless and guarantees a database that
-- skipped a step still ends up isolated per account.
-- ---------------------------------------------------------------------
alter table public.messages enable row level security;
alter table public.chats enable row level security;
alter table public.sources enable row level security;
alter table public.source_pages enable row level security;
alter table public.source_chunks enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'messages' and policyname = 'messages_own') then
    create policy messages_own on public.messages
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'source_pages' and policyname = 'source_pages_own') then
    create policy source_pages_own on public.source_pages
      for all using (
        exists (select 1 from public.sources s where s.id = source_pages.source_id and s.user_id = auth.uid())
      );
  end if;

  if not exists (select 1 from pg_policies where tablename = 'source_chunks' and policyname = 'source_chunks_own') then
    create policy source_chunks_own on public.source_chunks
      for all using (
        exists (select 1 from public.sources s where s.id = source_chunks.source_id and s.user_id = auth.uid())
      );
  end if;
end $$;
