-- Veltrix Hom Backend Part 2: Projects, Library, Notebooks, Research, Knowledge Index
-- Additive canonical vh_* schema. Part 1 tables/contracts are intentionally preserved.

create extension if not exists pgcrypto;

create table if not exists public.vh_projects (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  icon text check (icon is null or char_length(icon) <= 64),
  accent text check (accent is null or char_length(accent) <= 64),
  purpose text check (purpose is null or char_length(purpose) <= 2000),
  archived_at timestamptz,
  trashed_at timestamptz,
  purge_after timestamptz,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((trashed_at is null and purge_after is null) or (trashed_at is not null and purge_after is not null))
);
create index if not exists vh_projects_owner_list_idx on public.vh_projects(account_id, trashed_at, archived_at, updated_at desc, id desc);

create table if not exists public.vh_library_assets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  storage_object_id uuid references public.vh_storage_objects(id) on delete restrict,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  display_title text not null check (char_length(btrim(display_title)) between 1 and 255),
  declared_mime text,
  detected_mime text,
  source_kind text not null check (source_kind in ('pdf','document','pptx','text','spreadsheet','epub','image','audio','video','web','pasted','scanned','other')),
  asset_class text not null check (asset_class in ('file','image','web','text')),
  original_size_bytes bigint not null check (original_size_bytes >= 0),
  uploaded_at timestamptz not null default now(),
  origin_surface text not null check (char_length(origin_surface) between 1 and 80),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  processing_status text not null default 'UPLOADED' check (processing_status in ('UPLOADED','QUEUED','PROCESSING','READY','FAILED','UNSUPPORTED')),
  extraction_status text not null default 'PENDING' check (extraction_status in ('PENDING','PROCESSING','READY','FAILED','UNSUPPORTED','NOT_REQUIRED')),
  safe_failure_code text,
  source_revision bigint not null default 1 check (source_revision > 0),
  favorite boolean not null default false,
  provenance jsonb not null default '{}'::jsonb,
  last_used_at timestamptz,
  archived_at timestamptz,
  trashed_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, content_sha256),
  unique(storage_object_id),
  check ((trashed_at is null and purge_after is null) or (trashed_at is not null and purge_after is not null))
);
create index if not exists vh_library_assets_owner_recent_idx on public.vh_library_assets(account_id, trashed_at, archived_at, created_at desc, id desc);
create index if not exists vh_library_assets_owner_title_idx on public.vh_library_assets(account_id, lower(display_title), id);
create index if not exists vh_library_assets_owner_size_idx on public.vh_library_assets(account_id, original_size_bytes, id);
create index if not exists vh_library_assets_owner_status_idx on public.vh_library_assets(account_id, processing_status, id);
create index if not exists vh_library_assets_owner_origin_idx on public.vh_library_assets(account_id, origin_surface, id);

create table if not exists public.vh_asset_usages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  asset_id uuid not null references public.vh_library_assets(id) on delete cascade,
  origin_surface text not null check (char_length(origin_surface) between 1 and 80),
  context_kind text,
  context_id uuid,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists vh_asset_usages_dedup_idx on public.vh_asset_usages(account_id, asset_id, origin_surface, coalesce(context_kind,''), coalesce(context_id,'00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists vh_asset_usages_asset_idx on public.vh_asset_usages(account_id, asset_id, created_at desc);

create table if not exists public.vh_ingest_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  storage_object_id uuid not null references public.vh_storage_objects(id) on delete cascade,
  quota_reservation_id uuid not null references public.vh_quota_reservations(id) on delete cascade,
  original_filename text not null,
  display_title text not null,
  declared_mime text not null,
  declared_size_bytes bigint not null check (declared_size_bytes > 0),
  client_sha256 text check (client_sha256 is null or client_sha256 ~ '^[0-9a-f]{64}$'),
  origin_surface text not null,
  context_kind text,
  context_id uuid,
  status text not null default 'UPLOADING' check (status in ('UPLOADING','VERIFY_QUEUED','VERIFYING','COMPLETED','FAILED','DEDUP_REUSED')),
  asset_id uuid references public.vh_library_assets(id) on delete set null,
  safe_failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists vh_ingest_sessions_owner_idx on public.vh_ingest_sessions(account_id, status, created_at desc);

create table if not exists public.vh_project_references (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  project_id uuid not null references public.vh_projects(id) on delete cascade,
  asset_id uuid not null references public.vh_library_assets(id) on delete restrict,
  source_size_bytes bigint not null check (source_size_bytes >= 0),
  created_at timestamptz not null default now(),
  unique(project_id, asset_id)
);
create index if not exists vh_project_references_owner_project_idx on public.vh_project_references(account_id, project_id, created_at, id);
create index if not exists vh_project_references_asset_idx on public.vh_project_references(account_id, asset_id);

create table if not exists public.vh_library_tags (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  normalized_name text not null check (char_length(normalized_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, normalized_name)
);
create index if not exists vh_library_tags_owner_idx on public.vh_library_tags(account_id, normalized_name, id);

create table if not exists public.vh_library_asset_tags (
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  asset_id uuid not null references public.vh_library_assets(id) on delete cascade,
  tag_id uuid not null references public.vh_library_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(asset_id, tag_id)
);
create index if not exists vh_library_asset_tags_owner_tag_idx on public.vh_library_asset_tags(account_id, tag_id, asset_id);

create table if not exists public.vh_library_collections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  cover text check (cover is null or char_length(cover) <= 255),
  description text check (description is null or char_length(description) <= 2000),
  archived_at timestamptz,
  trashed_at timestamptz,
  purge_after timestamptz,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((trashed_at is null and purge_after is null) or (trashed_at is not null and purge_after is not null))
);
create index if not exists vh_library_collections_owner_idx on public.vh_library_collections(account_id, trashed_at, archived_at, updated_at desc, id desc);

create table if not exists public.vh_collection_assets (
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  collection_id uuid not null references public.vh_library_collections(id) on delete cascade,
  asset_id uuid not null references public.vh_library_assets(id) on delete cascade,
  manual_order bigint not null default 0,
  created_at timestamptz not null default now(),
  primary key(collection_id, asset_id)
);
create index if not exists vh_collection_assets_owner_order_idx on public.vh_collection_assets(account_id, collection_id, manual_order, asset_id);

create table if not exists public.vh_notebooks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  description text check (description is null or char_length(description) <= 4000),
  icon text check (icon is null or char_length(icon) <= 64),
  accent text check (accent is null or char_length(accent) <= 64),
  ai_config jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  trashed_at timestamptz,
  purge_after timestamptz,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((trashed_at is null and purge_after is null) or (trashed_at is not null and purge_after is not null))
);
create index if not exists vh_notebooks_owner_idx on public.vh_notebooks(account_id, trashed_at, archived_at, updated_at desc, id desc);

create table if not exists public.vh_project_notebooks (
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  project_id uuid not null references public.vh_projects(id) on delete cascade,
  notebook_id uuid not null references public.vh_notebooks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(project_id, notebook_id)
);
create index if not exists vh_project_notebooks_owner_notebook_idx on public.vh_project_notebooks(account_id, notebook_id, project_id);

create table if not exists public.vh_notebook_sources (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  notebook_id uuid not null references public.vh_notebooks(id) on delete cascade,
  asset_id uuid not null references public.vh_library_assets(id) on delete restrict,
  enabled boolean not null default true,
  source_size_bytes bigint not null check (source_size_bytes >= 0),
  group_key text,
  manual_order bigint not null default 0,
  added_via text not null default 'library' check (added_via in ('library','upload','research')),
  discovery_provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(notebook_id, asset_id)
);
create index if not exists vh_notebook_sources_owner_notebook_idx on public.vh_notebook_sources(account_id, notebook_id, enabled, manual_order, id);
create index if not exists vh_notebook_sources_asset_idx on public.vh_notebook_sources(account_id, asset_id);

create table if not exists public.vh_source_chunks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  asset_id uuid not null references public.vh_library_assets(id) on delete cascade,
  source_revision bigint not null check (source_revision > 0),
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  locator jsonb not null default '{}'::jsonb,
  text_range jsonb not null default '{}'::jsonb,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  extraction_version text not null,
  embedding_model text,
  embedding jsonb,
  search_vector tsvector generated always as (to_tsvector('simple', coalesce(content,''))) stored,
  created_at timestamptz not null default now(),
  unique(asset_id, source_revision, chunk_index, extraction_version, content_hash)
);
create index if not exists vh_source_chunks_owner_asset_idx on public.vh_source_chunks(account_id, asset_id, source_revision, chunk_index);
create index if not exists vh_source_chunks_fts_idx on public.vh_source_chunks using gin(search_vector);

create table if not exists public.vh_research_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  notebook_id uuid not null references public.vh_notebooks(id) on delete cascade,
  kind text not null check (kind in ('fast','deep')),
  title text,
  query text not null check (char_length(btrim(query)) between 1 and 10000),
  goal text,
  plan jsonb,
  status text not null default 'queued' check (status in ('queued','running','review','succeeded','failed','cancelled')),
  job_id uuid references public.vh_jobs(id) on delete set null,
  report text,
  provenance jsonb not null default '{}'::jsonb,
  safe_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists vh_research_sessions_owner_notebook_idx on public.vh_research_sessions(account_id, notebook_id, created_at desc, id desc);
create index if not exists vh_research_sessions_job_idx on public.vh_research_sessions(job_id) where job_id is not null;

create table if not exists public.vh_research_candidates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  research_session_id uuid not null references public.vh_research_sessions(id) on delete cascade,
  source_url text not null check (char_length(source_url) between 1 and 8192),
  source_identity_hash text not null check (source_identity_hash ~ '^[0-9a-f]{64}$'),
  title text,
  domain text,
  snippet text,
  discovered_at timestamptz not null default now(),
  rank_score double precision,
  fetch_status text not null default 'candidate' check (fetch_status in ('candidate','verified','failed','unsupported')),
  accepted_asset_id uuid references public.vh_library_assets(id) on delete set null,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(research_session_id, source_identity_hash)
);
create index if not exists vh_research_candidates_owner_session_idx on public.vh_research_candidates(account_id, research_session_id, rank_score desc nulls last, id);

-- Atomic Project Reference enforcement: 20 sources / 50 MiB total.
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

  select original_size_bytes into v_size
  from public.vh_library_assets
  where id=p_asset_id and account_id=p_account_id and trashed_at is null and processing_status <> 'FAILED';
  if not found then raise exception 'asset_not_found' using errcode='P0002'; end if;

  select count(*)::int, coalesce(sum(source_size_bytes),0)::bigint into v_count, v_bytes
  from public.vh_project_references where project_id=p_project_id;

  if v_count >= 20 then raise exception 'project_reference_count_exceeded' using errcode='P0001'; end if;
  if v_bytes + v_size > 50 * 1024 * 1024 then raise exception 'project_reference_bytes_exceeded' using errcode='P0001'; end if;

  insert into public.vh_project_references(account_id, project_id, asset_id, source_size_bytes)
  values (p_account_id,p_project_id,p_asset_id,v_size)
  on conflict(project_id,asset_id) do update set asset_id=excluded.asset_id
  returning id into v_id;
  return v_id;
end;
$$;

-- Atomic Notebook source quota. Limits are resolved from Part 1 notebook.plan policy and passed in.
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

  select original_size_bytes into v_size from public.vh_library_assets
  where id=p_asset_id and account_id=p_account_id and trashed_at is null and processing_status <> 'FAILED';
  if not found then raise exception 'asset_not_found' using errcode='P0002'; end if;

  select count(*)::int, coalesce(sum(source_size_bytes),0)::bigint into v_count,v_bytes
  from public.vh_notebook_sources where notebook_id=p_notebook_id;
  if p_max_sources is not null and v_count >= p_max_sources then raise exception 'notebook_source_count_exceeded' using errcode='P0001'; end if;
  if p_max_bytes is not null and v_bytes + v_size > p_max_bytes then raise exception 'notebook_source_bytes_exceeded' using errcode='P0001'; end if;

  insert into public.vh_notebook_sources(account_id,notebook_id,asset_id,source_size_bytes,added_via,discovery_provenance)
  values(p_account_id,p_notebook_id,p_asset_id,v_size,p_added_via,coalesce(p_provenance,'{}'::jsonb))
  on conflict(notebook_id,asset_id) do update set updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.vh_add_collection_asset(
  p_account_id uuid,
  p_collection_id uuid,
  p_asset_id uuid,
  p_manual_order bigint default 0
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_class text;
begin
  perform 1 from public.vh_library_collections where id=p_collection_id and account_id=p_account_id and trashed_at is null;
  if not found then raise exception 'collection_not_found' using errcode='P0002'; end if;
  select asset_class into v_class from public.vh_library_assets where id=p_asset_id and account_id=p_account_id and trashed_at is null;
  if not found then raise exception 'asset_not_found' using errcode='P0002'; end if;
  if v_class not in ('file','image') then raise exception 'collection_asset_type_not_allowed' using errcode='P0001'; end if;
  insert into public.vh_collection_assets(account_id,collection_id,asset_id,manual_order)
  values(p_account_id,p_collection_id,p_asset_id,p_manual_order)
  on conflict(collection_id,asset_id) do update set manual_order=excluded.manual_order;
  return true;
end;
$$;

create or replace function public.vh_search_notebook_chunks(
  p_account_id uuid,
  p_notebook_id uuid,
  p_query text,
  p_limit integer default 12
) returns table(
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
  select c.id,c.asset_id,c.source_revision,c.chunk_index,c.content,c.locator,c.content_hash,c.extraction_version,
         ts_rank_cd(c.search_vector, websearch_to_tsquery('simple', p_query))::real as rank
  from public.vh_source_chunks c
  join public.vh_notebook_sources ns on ns.asset_id=c.asset_id and ns.account_id=p_account_id and ns.notebook_id=p_notebook_id and ns.enabled
  join public.vh_notebooks n on n.id=ns.notebook_id and n.account_id=p_account_id and n.trashed_at is null
  join public.vh_library_assets a on a.id=c.asset_id and a.account_id=p_account_id and a.trashed_at is null and a.processing_status='READY'
  where c.account_id=p_account_id and c.search_vector @@ websearch_to_tsquery('simple', p_query)
  order by rank desc, c.id
  limit least(greatest(coalesce(p_limit,12),1),50);
$$;

create or replace function public.vh_search_project_chunks(
  p_account_id uuid,
  p_project_id uuid,
  p_query text,
  p_limit integer default 12
) returns table(chunk_id uuid, asset_id uuid, content text, locator jsonb, rank real)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with allowed_assets as (
    select pr.asset_id from public.vh_project_references pr where pr.account_id=p_account_id and pr.project_id=p_project_id
    union
    select ns.asset_id
    from public.vh_project_notebooks pn
    join public.vh_notebook_sources ns on ns.account_id=p_account_id and ns.notebook_id=pn.notebook_id and ns.enabled
    where pn.account_id=p_account_id and pn.project_id=p_project_id
  )
  select c.id,c.asset_id,c.content,c.locator,
         ts_rank_cd(c.search_vector, websearch_to_tsquery('simple', p_query))::real as rank
  from public.vh_source_chunks c
  join allowed_assets aa on aa.asset_id=c.asset_id
  join public.vh_library_assets a on a.id=c.asset_id and a.account_id=p_account_id and a.trashed_at is null and a.processing_status='READY'
  where c.account_id=p_account_id and c.search_vector @@ websearch_to_tsquery('simple', p_query)
  order by rank desc,c.id
  limit least(greatest(coalesce(p_limit,12),1),50);
$$;

-- No direct client policies: canonical opaque sessions are enforced at the API layer.
do $$
declare t text;
begin
  foreach t in array array[
    'vh_projects','vh_library_assets','vh_asset_usages','vh_ingest_sessions','vh_project_references',
    'vh_library_tags','vh_library_asset_tags','vh_library_collections','vh_collection_assets','vh_notebooks',
    'vh_project_notebooks','vh_notebook_sources','vh_source_chunks','vh_research_sessions','vh_research_candidates'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select,insert,update,delete on table public.%I to service_role', t);
  end loop;
end $$;

revoke all on function public.vh_add_project_reference(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.vh_add_project_reference(uuid,uuid,uuid) to service_role;
revoke all on function public.vh_add_notebook_source(uuid,uuid,uuid,integer,bigint,text,jsonb) from public, anon, authenticated;
grant execute on function public.vh_add_notebook_source(uuid,uuid,uuid,integer,bigint,text,jsonb) to service_role;
revoke all on function public.vh_add_collection_asset(uuid,uuid,uuid,bigint) from public, anon, authenticated;
grant execute on function public.vh_add_collection_asset(uuid,uuid,uuid,bigint) to service_role;
revoke all on function public.vh_search_notebook_chunks(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.vh_search_notebook_chunks(uuid,uuid,text,integer) to service_role;
revoke all on function public.vh_search_project_chunks(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.vh_search_project_chunks(uuid,uuid,text,integer) to service_role;
