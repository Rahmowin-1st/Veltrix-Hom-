-- ============================================================================
-- VELTRIX HOM — migration-011 FIXED
-- Apply AFTER migration-010-fixed.sql.
-- Safe after a failed or partial original 011 and safe to rerun.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. PREFLIGHT
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.source_chunks') is null
     or to_regclass('public.source_pages') is null
     or to_regclass('public.sources') is null
     or to_regclass('public.source_toc_entries') is null then
    raise exception 'migration-011 requires migration-010-fixed first';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. PAGE-OWNED CHUNK UNIQUENESS
-- ---------------------------------------------------------------------------
alter table public.source_chunks add column if not exists source_page_id uuid references public.source_pages on delete cascade;
alter table public.source_chunks add column if not exists chunker_version text not null default 'v9-900-150';
alter table public.source_chunks add column if not exists embedding_model text;

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

-- Remove exact duplicates before building the unique index.
delete from public.source_chunks a
using public.source_chunks b
where a.ctid > b.ctid
  and a.source_page_id = b.source_page_id
  and a.chunk_index is not distinct from b.chunk_index
  and a.chunker_version is not distinct from b.chunker_version
  and a.content_hash is not distinct from b.content_hash
  and a.source_page_id is not null
  and a.content_hash is not null;

create unique index if not exists source_chunks_page_owned_uniq
  on public.source_chunks (source_page_id, chunk_index, chunker_version, content_hash)
  where source_page_id is not null and content_hash is not null;

-- ---------------------------------------------------------------------------
-- 2. VERSION-AWARE REINDEX RPC
-- ---------------------------------------------------------------------------
drop function if exists public.reindex_page_versioned(uuid,uuid,text,text);
create function public.reindex_page_versioned(
  p_user_id uuid,
  p_source_page_id uuid,
  p_chunker_version text,
  p_embedding_model text
)
returns table (deleted_count int, kept_count int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted int;
  v_kept int;
begin
  if not exists (
    select 1
      from public.source_pages sp
      join public.sources s on s.id = sp.source_id
     where sp.id = p_source_page_id
       and s.user_id = p_user_id
  ) then
    return query select 0, 0;
    return;
  end if;

  delete from public.source_chunks c
   where c.source_page_id = p_source_page_id
     and (
       c.chunker_version is distinct from p_chunker_version
       or c.embedding_model is distinct from p_embedding_model
     );

  get diagnostics v_deleted = row_count;

  select count(*)::int
    into v_kept
    from public.source_chunks c
   where c.source_page_id = p_source_page_id;

  return query select v_deleted, v_kept;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. TOC STATE + ATOMIC REPLACE
-- ---------------------------------------------------------------------------
alter table public.sources add column if not exists toc_status text;
alter table public.sources add column if not exists toc_entry_count int not null default 0;

update public.sources
   set toc_status = 'pending'
 where toc_status is null;

alter table public.sources alter column toc_status set default 'pending';
alter table public.sources alter column toc_status set not null;

do $$
declare
  r record;
begin
  for r in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.sources'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%toc_status%'
  loop
    execute format('alter table public.sources drop constraint %I', r.conname);
  end loop;

  alter table public.sources
    add constraint sources_toc_status_check
    check (toc_status in ('pending','running','done','none','failed')) not valid;
end $$;

drop function if exists public.replace_toc_entries(uuid,uuid,jsonb,int);
create function public.replace_toc_entries(
  p_user_id uuid,
  p_source_id uuid,
  p_entries jsonb,
  p_evidence_pdf_page int default null
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  if not exists (
    select 1 from public.sources
     where id = p_source_id and user_id = p_user_id
  ) then
    return -1;
  end if;

  delete from public.source_toc_entries
   where source_id = p_source_id;

  insert into public.source_toc_entries (
    user_id,
    source_id,
    topic,
    printed_page,
    printed_page_end,
    depth,
    confidence,
    evidence_pdf_page
  )
  select
    p_user_id,
    p_source_id,
    left(trim(e->>'topic'), 300),
    case when coalesce(e->>'printed_page', '') ~ '^-?[0-9]+$'
         then (e->>'printed_page')::int else null end,
    case when coalesce(e->>'printed_page_end', '') ~ '^-?[0-9]+$'
         then (e->>'printed_page_end')::int else null end,
    case when coalesce(e->>'depth', '') ~ '^-?[0-9]+$'
         then greatest((e->>'depth')::int, 0) else 0 end,
    case when coalesce(e->>'confidence', '') ~ '^[0-9]+([.][0-9]+)?$'
         then least(greatest((e->>'confidence')::real, 0), 1) else 0.5 end,
    p_evidence_pdf_page
  from jsonb_array_elements(
    case when jsonb_typeof(coalesce(p_entries, '[]'::jsonb)) = 'array'
         then coalesce(p_entries, '[]'::jsonb)
         else '[]'::jsonb end
  ) as e
  where length(trim(coalesce(e->>'topic', ''))) > 1;

  get diagnostics v_count = row_count;

  update public.sources
     set toc_status = case when v_count > 0 then 'done' else 'none' end,
         toc_entry_count = v_count,
         updated_at = now()
   where id = p_source_id and user_id = p_user_id;

  return v_count;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. GRANTS
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.reindex_page_versioned(uuid,uuid,text,text)',
    'public.replace_toc_entries(uuid,uuid,jsonb,integer)'
  ] loop
    if to_regprocedure(fn) is not null then
      begin
        execute format('revoke all on function %s from public, anon, authenticated', fn);
        execute format('grant execute on function %s to service_role', fn);
      exception when undefined_object then
        raise notice 'Supabase API roles unavailable; skipped grants for %', fn;
      end;
    end if;
  end loop;
end $$;

commit;

-- migration-011-fixed complete.
