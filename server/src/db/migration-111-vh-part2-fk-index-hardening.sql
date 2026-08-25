-- Veltrix Hom Backend Part 2: canonical relation FK covering indexes.
-- Part 1 contracts are intentionally untouched.

create index if not exists vh_asset_usages_asset_owner_fk_idx
  on public.vh_asset_usages(asset_id, account_id);
create index if not exists vh_collection_assets_asset_owner_fk_idx
  on public.vh_collection_assets(asset_id, account_id);
create index if not exists vh_collection_assets_collection_owner_fk_idx
  on public.vh_collection_assets(collection_id, account_id);
create index if not exists vh_ingest_sessions_asset_fk_idx
  on public.vh_ingest_sessions(asset_id);
create index if not exists vh_ingest_sessions_quota_reservation_fk_idx
  on public.vh_ingest_sessions(quota_reservation_id);
create index if not exists vh_ingest_sessions_storage_object_fk_idx
  on public.vh_ingest_sessions(storage_object_id);
create index if not exists vh_library_asset_tags_asset_owner_fk_idx
  on public.vh_library_asset_tags(asset_id, account_id);
create index if not exists vh_library_asset_tags_tag_owner_fk_idx
  on public.vh_library_asset_tags(tag_id, account_id);
create index if not exists vh_notebook_sources_asset_owner_fk_idx
  on public.vh_notebook_sources(asset_id, account_id);
create index if not exists vh_notebook_sources_notebook_owner_fk_idx
  on public.vh_notebook_sources(notebook_id, account_id);
create index if not exists vh_project_notebooks_notebook_owner_fk_idx
  on public.vh_project_notebooks(notebook_id, account_id);
create index if not exists vh_project_notebooks_project_owner_fk_idx
  on public.vh_project_notebooks(project_id, account_id);
create index if not exists vh_project_references_asset_owner_fk_idx
  on public.vh_project_references(asset_id, account_id);
create index if not exists vh_project_references_project_owner_fk_idx
  on public.vh_project_references(project_id, account_id);
create index if not exists vh_research_candidates_accepted_asset_fk_idx
  on public.vh_research_candidates(accepted_asset_id);
create index if not exists vh_research_candidates_session_owner_fk_idx
  on public.vh_research_candidates(research_session_id, account_id);
create index if not exists vh_research_sessions_notebook_owner_fk_idx
  on public.vh_research_sessions(notebook_id, account_id);
create index if not exists vh_source_chunks_asset_owner_fk_idx
  on public.vh_source_chunks(asset_id, account_id);
