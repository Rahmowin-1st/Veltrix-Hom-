-- Veltrix Hom Backend Part 2: active Library keyset indexes.
-- These indexes align directly with the canonical active-asset sort keys.

create index if not exists vh_library_assets_active_created_idx
  on public.vh_library_assets(account_id, created_at desc, id desc)
  where trashed_at is null;
create index if not exists vh_library_assets_active_updated_idx
  on public.vh_library_assets(account_id, updated_at desc, id desc)
  where trashed_at is null;
create index if not exists vh_library_assets_active_recent_idx
  on public.vh_library_assets(account_id, (coalesce(last_used_at, created_at)) desc, id desc)
  where trashed_at is null;
create index if not exists vh_library_assets_active_title_idx
  on public.vh_library_assets(account_id, lower(display_title), id)
  where trashed_at is null;
create index if not exists vh_library_assets_active_size_idx
  on public.vh_library_assets(account_id, original_size_bytes, id)
  where trashed_at is null;
