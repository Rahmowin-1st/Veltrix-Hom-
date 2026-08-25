-- Veltrix Hom Backend Part 2: selected-source-aware Notebook retrieval.
-- Source selection is applied inside retrieval, never as a post-filter after top-K.

create or replace function public.vh_search_notebook_chunks_scoped(
  p_account_id uuid,
  p_notebook_id uuid,
  p_query text,
  p_source_ids uuid[] default null,
  p_limit integer default 12
)
returns table(
  chunk_id uuid,
  asset_id uuid,
  source_revision bigint,
  chunk_index integer,
  content text,
  locator jsonb,
  content_hash text,
  extraction_version text,
  rank real
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id,
    c.asset_id,
    c.source_revision,
    c.chunk_index,
    c.content,
    c.locator,
    c.content_hash,
    c.extraction_version,
    ts_rank_cd(c.search_vector, websearch_to_tsquery('simple', p_query))::real as rank
  from public.vh_source_chunks c
  join public.vh_notebook_sources ns
    on ns.asset_id = c.asset_id
   and ns.account_id = p_account_id
   and ns.notebook_id = p_notebook_id
   and ns.enabled
  join public.vh_notebooks n
    on n.id = ns.notebook_id
   and n.account_id = p_account_id
   and n.trashed_at is null
  join public.vh_library_assets a
    on a.id = c.asset_id
   and a.account_id = p_account_id
   and a.trashed_at is null
   and a.processing_status = 'READY'
  where c.account_id = p_account_id
    and (p_source_ids is null or c.asset_id = any(p_source_ids))
    and c.search_vector @@ websearch_to_tsquery('simple', p_query)
  order by rank desc, c.id
  limit least(greatest(coalesce(p_limit, 12), 1), 100);
$$;

revoke all on function public.vh_search_notebook_chunks_scoped(uuid,uuid,text,uuid[],integer) from public, anon, authenticated;
grant execute on function public.vh_search_notebook_chunks_scoped(uuid,uuid,text,uuid[],integer) to service_role;
