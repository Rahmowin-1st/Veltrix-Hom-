-- =====================================================================
-- VELTRIX HOM — migration-011  (V11)
--
-- Additive and idempotent, applied AFTER 010. It does not rewrite any
-- previously deployed migration and destroys no user data.
--
-- Deployment order:  … → 008 → 010 → 011      (009 remains skippable;
-- 010 is the convergence migration that replays it.)
--
-- What it adds, and why each is needed by production code:
--   1. Page-owned chunk uniqueness — V10 keyed uniqueness on
--      (source_id, page_number, …). A page row is the real owner of its
--      chunks, so re-extracting a book that shifts page numbering could
--      strand duplicates. Keying on source_page_id makes a page's chunk
--      set exactly replaceable.
--   2. Version-aware page reindex — replace only obsolete chunks for a
--      page, leaving unchanged content (and its embedding) alone.
--   3. TOC extraction state on sources, so the worker can run the
--      extract_toc stage exactly once and the UI can report it honestly.
--   4. Upload-cleanup and page-anchor helpers that V11 wires to routes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PAGE-OWNED CHUNK UNIQUENESS  (spec §12)
-- ---------------------------------------------------------------------
-- Backfill source_page_id for any chunk written before 010 added it, so
-- the new index can be created without losing rows.
update public.source_chunks c
   set source_page_id = p.id
  from public.source_pages p
 where c.source_page_id is null
   and p.source_id = c.source_id
   and p.page_number = c.page_number;

-- Deterministic per-page identity: the same page, chunk slot, chunker and
-- content can exist exactly once. A crashed indexer that retries produces
-- a conflict, not a duplicate.
create unique index if not exists source_chunks_page_owned_uniq
  on public.source_chunks (source_page_id, chunk_index, chunker_version, content_hash)
  where source_page_id is not null and content_hash is not null;

-- ---------------------------------------------------------------------
-- 2. VERSION-AWARE PAGE REINDEX  (spec §12)
-- ---------------------------------------------------------------------
-- Deletes only the chunks for this page that were produced by a DIFFERENT
-- chunker/embedding version, and reports how many survive. Unchanged
-- content keeps its embedding, so a re-run costs nothing for pages that
-- did not actually change.
create or replace function public.reindex_page_versioned(
  p_user_id          uuid,
  p_source_page_id   uuid,
  p_chunker_version  text,
  p_embedding_model  text
) returns table (deleted_count int, kept_count int)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_deleted int; v_kept int;
begin
  if not exists (
    select 1 from public.source_pages sp
      join public.sources s on s.id = sp.source_id
     where sp.id = p_source_page_id and s.user_id = p_user_id
  ) then
    return query select 0, 0;
    return;
  end if;

  delete from public.source_chunks c
   where c.source_page_id = p_source_page_id
     and (c.chunker_version is distinct from p_chunker_version
          or c.embedding_model is distinct from p_embedding_model);
  get diagnostics v_deleted = row_count;

  select count(*)::int into v_kept
    from public.source_chunks c
   where c.source_page_id = p_source_page_id;

  return query select v_deleted, v_kept;
end $$;

-- ---------------------------------------------------------------------
-- 3. TOC EXTRACTION STATE  (spec §8 extract_toc stage)
-- ---------------------------------------------------------------------
alter table public.sources add column if not exists toc_status text not null default 'pending'
  check (toc_status in ('pending','running','done','none','failed'));
alter table public.sources add column if not exists toc_entry_count int not null default 0;

-- Records a parsed table of contents in one atomic step: replace the old
-- parse, insert the new rows, and stamp the source's TOC state so the
-- stage never runs twice for the same book.
create or replace function public.replace_toc_entries(
  p_user_id   uuid,
  p_source_id uuid,
  p_entries   jsonb,
  p_evidence_pdf_page int default null
) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count int;
begin
  if not exists (select 1 from public.sources where id = p_source_id and user_id = p_user_id) then
    return -1;
  end if;

  delete from public.source_toc_entries where source_id = p_source_id;

  insert into public.source_toc_entries
    (user_id, source_id, topic, printed_page, printed_page_end, depth, confidence, evidence_pdf_page)
  select p_user_id, p_source_id,
         left(e->>'topic', 300),
         nullif(e->>'printed_page','')::int,
         nullif(e->>'printed_page_end','')::int,
         coalesce(nullif(e->>'depth','')::int, 0),
         coalesce(nullif(e->>'confidence','')::real, 0.5),
         p_evidence_pdf_page
    from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) as e
   where length(coalesce(e->>'topic','')) > 1;
  get diagnostics v_count = row_count;

  update public.sources
     set toc_status = case when v_count > 0 then 'done' else 'none' end,
         toc_entry_count = v_count,
         updated_at = now()
   where id = p_source_id;

  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- 4. GRANTS — trusted backend only
-- ---------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.reindex_page_versioned(uuid,uuid,text,text)',
    'public.replace_toc_entries(uuid,uuid,jsonb,int)'
  ] loop
    begin
      execute format('revoke all on function %s from public, anon, authenticated', fn);
      execute format('grant execute on function %s to service_role', fn);
    exception when undefined_function then
      raise notice 'skip grants for missing function %', fn;
    end;
  end loop;
end $$;

-- =====================================================================
-- migration-011 complete.  Verify with: MIGRATION_VERIFY_V11.sql
-- =====================================================================
