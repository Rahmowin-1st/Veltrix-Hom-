-- Veltrix Hom Backend Part 2 integrity hardening.
-- Required delta only: strengthen owner consistency and make relationship RPCs idempotent at quota boundaries.

-- Composite identity keys let child relations prove owner consistency at the database layer.
create unique index if not exists vh_projects_id_owner_uq on public.vh_projects(id, account_id);
create unique index if not exists vh_library_assets_id_owner_uq on public.vh_library_assets(id, account_id);
create unique index if not exists vh_library_tags_id_owner_uq on public.vh_library_tags(id, account_id);
create unique index if not exists vh_library_collections_id_owner_uq on public.vh_library_collections(id, account_id);
create unique index if not exists vh_notebooks_id_owner_uq on public.vh_notebooks(id, account_id);
create unique index if not exists vh_research_sessions_id_owner_uq on public.vh_research_sessions(id, account_id);

-- Relationship tables cannot accidentally cross owners even under service-role access.
do $$
begin
  if not exists (select 1 from pg_constraint where conname='vh_project_references_project_owner_fk') then
    alter table public.vh_project_references add constraint vh_project_references_project_owner_fk
      foreign key(project_id,account_id) references public.vh_projects(id,account_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='vh_project_references_asset_owner_fk') then
    alter table public.vh_project_references add constraint vh_project_references_asset_owner_fk
      foreign key(asset_id,account_id) references public.vh_library_assets(id,account_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname='vh_asset_usages_asset_owner_fk') then
    alter table public.vh_asset_usages add constraint vh_asset_usages_asset_owner_fk
      foreign key(asset_id,account_id) references public.vh_library_assets(id,account_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='vh_library_asset_tags_asset_owner_fk') then
    alter table public.vh_library_asset_tags add constraint vh_library_asset_tags_asset_owner_fk
      foreign key(asset_id,account_id) references public.vh_library_assets(id,account_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='vh_library_asset_tags_tag_owner_fk') then
    alter table public.vh_library_asset_tags add constraint vh_library_asset_tags_tag_owner_fk
      foreign key(tag_id,account_id) references public.vh_library_tags(id,account_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='vh_collection_assets_collection_owner_fk') then
    alter table public.vh_collection_assets add constraint vh_collection_assets_collection_owner_fk
      foreign key(collection_id,account_id) references public.vh_library_collections(id,account_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='vh_collection_assets_asset_owner_fk') then
    alter table public.vh_collection_assets add constraint vh_collection_assets_asset_owner_fk
      foreign key(asset_id,account_id) references public.vh_library_assets(id,account_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='vh_project_notebooks_project_owner_fk') then
    alter table public.vh_project_notebooks add constraint vh_project_notebooks_project_owner_fk
      foreign key(project_id,account_id) references public.vh_projects(id,account_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='vh_project_notebooks_notebook_owner_fk') then
    alter table public.vh_project_notebooks add constraint vh_project_notebooks_notebook_owner_fk
      foreign key(notebook_id,account_id) references public.vh_notebooks(id,account_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='vh_notebook_sources_notebook_owner_fk') then
    alter table public.vh_notebook_sources add constraint vh_notebook_sources_notebook_owner_fk
      foreign key(notebook_id,account_id) references public.vh_notebooks(id,account_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='vh_notebook_sources_asset_owner_fk') then
    alter table public.vh_notebook_sources add constraint vh_notebook_sources_asset_owner_fk
      foreign key(asset_id,account_id) references public.vh_library_assets(id,account_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname='vh_source_chunks_asset_owner_fk') then
    alter table public.vh_source_chunks add constraint vh_source_chunks_asset_owner_fk
      foreign key(asset_id,account_id) references public.vh_library_assets(id,account_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='vh_research_sessions_notebook_owner_fk') then
    alter table public.vh_research_sessions add constraint vh_research_sessions_notebook_owner_fk
      foreign key(notebook_id,account_id) references public.vh_notebooks(id,account_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='vh_research_candidates_session_owner_fk') then
    alter table public.vh_research_candidates add constraint vh_research_candidates_session_owner_fk
      foreign key(research_session_id,account_id) references public.vh_research_sessions(id,account_id) on delete cascade;
  end if;
end $$;

-- Search index used by Library title/file-name search without scanning every owner row.
alter table public.vh_library_assets
  add column if not exists search_vector tsvector generated always as
    (to_tsvector('simple', coalesce(display_title,'') || ' ' || coalesce(original_filename,''))) stored;
create index if not exists vh_library_assets_search_idx on public.vh_library_assets using gin(search_vector);

-- Duplicate relation adds are idempotent even when the Project is already at its limit.
create or replace function public.vh_add_project_reference(
  p_account_id uuid,
  p_project_id uuid,
  p_asset_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_size bigint;
  v_count integer;
  v_bytes bigint;
  v_id uuid;
begin
  perform 1 from public.vh_projects where id=p_project_id and account_id=p_account_id and trashed_at is null for update;
  if not found then raise exception 'project_not_found' using errcode='P0002'; end if;

  select id into v_id from public.vh_project_references
  where project_id=p_project_id and asset_id=p_asset_id and account_id=p_account_id;
  if found then return v_id; end if;

  select original_size_bytes into v_size
  from public.vh_library_assets
  where id=p_asset_id and account_id=p_account_id and trashed_at is null and processing_status <> 'FAILED';
  if not found then raise exception 'asset_not_found' using errcode='P0002'; end if;

  select count(*)::int, coalesce(sum(source_size_bytes),0)::bigint into v_count, v_bytes
  from public.vh_project_references where project_id=p_project_id and account_id=p_account_id;
  if v_count >= 20 then raise exception 'project_reference_count_exceeded' using errcode='P0001'; end if;
  if v_bytes + v_size > 50 * 1024 * 1024 then raise exception 'project_reference_bytes_exceeded' using errcode='P0001'; end if;

  insert into public.vh_project_references(account_id, project_id, asset_id, source_size_bytes)
  values (p_account_id,p_project_id,p_asset_id,v_size)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.vh_add_notebook_source(
  p_account_id uuid,
  p_notebook_id uuid,
  p_asset_id uuid,
  p_max_sources integer,
  p_max_bytes bigint,
  p_added_via text default 'library',
  p_provenance jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_size bigint;
  v_count integer;
  v_bytes bigint;
  v_id uuid;
begin
  if p_max_sources is not null and p_max_sources <= 0 then raise exception 'invalid_notebook_quota' using errcode='22023'; end if;
  if p_max_bytes is not null and p_max_bytes <= 0 then raise exception 'invalid_notebook_quota' using errcode='22023'; end if;
  if p_added_via not in ('library','upload','research') then raise exception 'invalid_added_via' using errcode='22023'; end if;

  perform 1 from public.vh_notebooks where id=p_notebook_id and account_id=p_account_id and trashed_at is null for update;
  if not found then raise exception 'notebook_not_found' using errcode='P0002'; end if;

  select id into v_id from public.vh_notebook_sources
  where notebook_id=p_notebook_id and asset_id=p_asset_id and account_id=p_account_id;
  if found then
    update public.vh_notebook_sources
      set enabled=true,
          added_via=p_added_via,
          discovery_provenance=coalesce(p_provenance,'{}'::jsonb),
          updated_at=now()
      where id=v_id;
    return v_id;
  end if;

  select original_size_bytes into v_size from public.vh_library_assets
  where id=p_asset_id and account_id=p_account_id and trashed_at is null and processing_status <> 'FAILED';
  if not found then raise exception 'asset_not_found' using errcode='P0002'; end if;

  select count(*)::int, coalesce(sum(source_size_bytes),0)::bigint into v_count,v_bytes
  from public.vh_notebook_sources where notebook_id=p_notebook_id and account_id=p_account_id;
  if p_max_sources is not null and v_count >= p_max_sources then raise exception 'notebook_source_count_exceeded' using errcode='P0001'; end if;
  if p_max_bytes is not null and v_bytes + v_size > p_max_bytes then raise exception 'notebook_source_bytes_exceeded' using errcode='P0001'; end if;

  insert into public.vh_notebook_sources(account_id,notebook_id,asset_id,source_size_bytes,added_via,discovery_provenance)
  values(p_account_id,p_notebook_id,p_asset_id,v_size,p_added_via,coalesce(p_provenance,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.vh_add_project_reference(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.vh_add_project_reference(uuid,uuid,uuid) to service_role;
revoke all on function public.vh_add_notebook_source(uuid,uuid,uuid,integer,bigint,text,jsonb) from public, anon, authenticated;
grant execute on function public.vh_add_notebook_source(uuid,uuid,uuid,integer,bigint,text,jsonb) to service_role;
