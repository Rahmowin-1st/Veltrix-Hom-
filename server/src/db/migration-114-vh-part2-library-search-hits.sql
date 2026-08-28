-- Veltrix Hom Backend Part 2: precompute owner-scoped Library search hits.
-- Avoid correlated full-text EXISTS work once per Library asset.

create or replace function public.vh_query_library_assets(
  p_account_id uuid,
  p_source_kinds text[] default null,
  p_project_id uuid default null,
  p_notebook_id uuid default null,
  p_tag_ids uuid[] default null,
  p_collection_id uuid default null,
  p_favorite boolean default null,
  p_processing_statuses text[] default null,
  p_origins text[] default null,
  p_archived boolean default null,
  p_linked boolean default null,
  p_imported_by_research boolean default null,
  p_unsorted boolean default null,
  p_date_added_from timestamptz default null,
  p_date_added_to timestamptz default null,
  p_date_modified_from timestamptz default null,
  p_date_modified_to timestamptz default null,
  p_q text default null,
  p_sort text default 'created',
  p_dir text default 'desc',
  p_cursor_ts timestamptz default null,
  p_cursor_text text default null,
  p_cursor_num bigint default null,
  p_cursor_id uuid default null,
  p_limit integer default 40
)
returns table(
  id uuid, original_filename text, display_title text, detected_mime text,
  source_kind text, asset_class text, original_size_bytes bigint, uploaded_at timestamptz,
  origin_surface text, processing_status text, extraction_status text, safe_failure_code text,
  favorite boolean, last_used_at timestamptz, archived_at timestamptz, created_at timestamptz,
  updated_at timestamptz, project_link_count bigint, notebook_link_count bigint,
  collection_count bigint, tag_count bigint, usage_count bigint,
  sort_ts timestamptz, sort_text text, sort_num bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with search_hits as materialized (
    select h.asset_id
    from (
      select a0.id as asset_id
      from public.vh_library_assets a0
      where nullif(btrim(coalesce(p_q,'')),'') is not null
        and a0.account_id=p_account_id
        and a0.search_vector @@ websearch_to_tsquery('simple',p_q)
      union all
      select sc.asset_id
      from public.vh_source_chunks sc
      where nullif(btrim(coalesce(p_q,'')),'') is not null
        and sc.account_id=p_account_id
        and sc.search_vector @@ websearch_to_tsquery('simple',p_q)
      union all
      select at.asset_id
      from public.vh_library_asset_tags at
      join public.vh_library_tags t on t.id=at.tag_id and t.account_id=p_account_id
      where nullif(btrim(coalesce(p_q,'')),'') is not null
        and at.account_id=p_account_id
        and to_tsvector('simple',t.name) @@ websearch_to_tsquery('simple',p_q)
      union all
      select pr.asset_id
      from public.vh_project_references pr
      join public.vh_projects p on p.id=pr.project_id and p.account_id=p_account_id
      where nullif(btrim(coalesce(p_q,'')),'') is not null
        and pr.account_id=p_account_id
        and to_tsvector('simple',p.name) @@ websearch_to_tsquery('simple',p_q)
      union all
      select ns.asset_id
      from public.vh_notebook_sources ns
      join public.vh_notebooks n on n.id=ns.notebook_id and n.account_id=p_account_id
      where nullif(btrim(coalesce(p_q,'')),'') is not null
        and ns.account_id=p_account_id
        and to_tsvector('simple',n.name) @@ websearch_to_tsquery('simple',p_q)
    ) h
    group by h.asset_id
  ), filtered as (
    select a.*,
      case p_sort
        when 'created' then a.created_at
        when 'updated' then a.updated_at
        when 'recent' then coalesce(a.last_used_at,a.created_at)
        else null
      end as k_ts,
      case when p_sort='title' then lower(a.display_title) else null end as k_text,
      case when p_sort='size' then a.original_size_bytes else null end as k_num
    from public.vh_library_assets a
    where a.account_id=p_account_id
      and a.trashed_at is null
      and (p_source_kinds is null or cardinality(p_source_kinds)=0 or a.source_kind=any(p_source_kinds))
      and (p_project_id is null or exists(select 1 from public.vh_project_references pr where pr.account_id=p_account_id and pr.asset_id=a.id and pr.project_id=p_project_id))
      and (p_notebook_id is null or exists(select 1 from public.vh_notebook_sources ns where ns.account_id=p_account_id and ns.asset_id=a.id and ns.notebook_id=p_notebook_id))
      and (p_tag_ids is null or cardinality(p_tag_ids)=0 or not exists(
        select 1 from unnest(p_tag_ids) requested(tag_id)
        where not exists(select 1 from public.vh_library_asset_tags at where at.account_id=p_account_id and at.asset_id=a.id and at.tag_id=requested.tag_id)
      ))
      and (p_collection_id is null or exists(select 1 from public.vh_collection_assets ca where ca.account_id=p_account_id and ca.asset_id=a.id and ca.collection_id=p_collection_id))
      and (p_favorite is null or a.favorite=p_favorite)
      and (p_processing_statuses is null or cardinality(p_processing_statuses)=0 or a.processing_status=any(p_processing_statuses))
      and (p_origins is null or cardinality(p_origins)=0 or a.origin_surface=any(p_origins))
      and (p_archived is null or (p_archived and a.archived_at is not null) or (not p_archived and a.archived_at is null))
      and (p_imported_by_research is null or (p_imported_by_research and a.origin_surface='research') or (not p_imported_by_research and a.origin_surface<>'research'))
      and (p_linked is null or
        (p_linked and (
          exists(select 1 from public.vh_project_references pr where pr.account_id=p_account_id and pr.asset_id=a.id)
          or exists(select 1 from public.vh_notebook_sources ns where ns.account_id=p_account_id and ns.asset_id=a.id)
          or exists(select 1 from public.vh_asset_usages au where au.account_id=p_account_id and au.asset_id=a.id and au.context_id is not null)
        ))
        or (not p_linked and not exists(select 1 from public.vh_project_references pr where pr.account_id=p_account_id and pr.asset_id=a.id)
          and not exists(select 1 from public.vh_notebook_sources ns where ns.account_id=p_account_id and ns.asset_id=a.id)
          and not exists(select 1 from public.vh_asset_usages au where au.account_id=p_account_id and au.asset_id=a.id and au.context_id is not null)
        ))
      and (p_unsorted is null or not p_unsorted or (
        not exists(select 1 from public.vh_project_references pr where pr.account_id=p_account_id and pr.asset_id=a.id)
        and not exists(select 1 from public.vh_notebook_sources ns where ns.account_id=p_account_id and ns.asset_id=a.id)
        and not exists(select 1 from public.vh_collection_assets ca where ca.account_id=p_account_id and ca.asset_id=a.id)
        and not exists(select 1 from public.vh_library_asset_tags at where at.account_id=p_account_id and at.asset_id=a.id)
      ))
      and (p_date_added_from is null or a.created_at>=p_date_added_from)
      and (p_date_added_to is null or a.created_at<p_date_added_to)
      and (p_date_modified_from is null or a.updated_at>=p_date_modified_from)
      and (p_date_modified_to is null or a.updated_at<p_date_modified_to)
      and (nullif(btrim(coalesce(p_q,'')),'') is null or exists(select 1 from search_hits sh where sh.asset_id=a.id))
  ), paged as materialized (
    select f.*
    from filtered f
    where p_cursor_id is null or
      (p_sort in ('created','updated','recent') and p_cursor_ts is not null and (
        (p_dir='asc' and (f.k_ts,f.id)>(p_cursor_ts,p_cursor_id)) or
        (p_dir='desc' and (f.k_ts,f.id)<(p_cursor_ts,p_cursor_id))
      )) or
      (p_sort='title' and p_cursor_text is not null and (
        (p_dir='asc' and (f.k_text,f.id)>(p_cursor_text,p_cursor_id)) or
        (p_dir='desc' and (f.k_text,f.id)<(p_cursor_text,p_cursor_id))
      )) or
      (p_sort='size' and p_cursor_num is not null and (
        (p_dir='asc' and (f.k_num,f.id)>(p_cursor_num,p_cursor_id)) or
        (p_dir='desc' and (f.k_num,f.id)<(p_cursor_num,p_cursor_id))
      ))
    order by
      case when p_sort in ('created','updated','recent') and p_dir='asc' then f.k_ts end asc,
      case when p_sort in ('created','updated','recent') and p_dir='desc' then f.k_ts end desc,
      case when p_sort='title' and p_dir='asc' then f.k_text end asc,
      case when p_sort='title' and p_dir='desc' then f.k_text end desc,
      case when p_sort='size' and p_dir='asc' then f.k_num end asc,
      case when p_sort='size' and p_dir='desc' then f.k_num end desc,
      case when p_dir='asc' then f.id end asc,
      case when p_dir='desc' then f.id end desc
    limit least(greatest(coalesce(p_limit,40),1),101)
  )
  select p.id,p.original_filename,p.display_title,p.detected_mime,p.source_kind,p.asset_class,p.original_size_bytes,
         p.uploaded_at,p.origin_surface,p.processing_status,p.extraction_status,p.safe_failure_code,p.favorite,p.last_used_at,
         p.archived_at,p.created_at,p.updated_at,
         (select count(*) from public.vh_project_references pr where pr.account_id=p_account_id and pr.asset_id=p.id),
         (select count(*) from public.vh_notebook_sources ns where ns.account_id=p_account_id and ns.asset_id=p.id),
         (select count(*) from public.vh_collection_assets ca where ca.account_id=p_account_id and ca.asset_id=p.id),
         (select count(*) from public.vh_library_asset_tags at where at.account_id=p_account_id and at.asset_id=p.id),
         (select count(*) from public.vh_asset_usages au where au.account_id=p_account_id and au.asset_id=p.id),
         p.k_ts,p.k_text,p.k_num
  from paged p
  order by
    case when p_sort in ('created','updated','recent') and p_dir='asc' then p.k_ts end asc,
    case when p_sort in ('created','updated','recent') and p_dir='desc' then p.k_ts end desc,
    case when p_sort='title' and p_dir='asc' then p.k_text end asc,
    case when p_sort='title' and p_dir='desc' then p.k_text end desc,
    case when p_sort='size' and p_dir='asc' then p.k_num end asc,
    case when p_sort='size' and p_dir='desc' then p.k_num end desc,
    case when p_dir='asc' then p.id end asc,
    case when p_dir='desc' then p.id end desc;
$function$;

revoke all on function public.vh_query_library_assets(uuid,text[],uuid,uuid,uuid[],uuid,boolean,text[],text[],boolean,boolean,boolean,boolean,timestamptz,timestamptz,timestamptz,timestamptz,text,text,text,timestamptz,text,bigint,uuid,integer) from public, anon, authenticated;
grant execute on function public.vh_query_library_assets(uuid,text[],uuid,uuid,uuid[],uuid,boolean,text[],text[],boolean,boolean,boolean,boolean,timestamptz,timestamptz,timestamptz,timestamptz,text,text,text,timestamptz,text,bigint,uuid,integer) to service_role;
