-- Veltrix Hom Backend Part 2: relationship-aware permanent metadata cleanup.
-- Physical Storage removal is performed by the backend before this RPC.

create or replace function public.vh_delete_part2_metadata(
  p_account_id uuid,
  p_kind text,
  p_object_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_storage_id uuid;
begin
  if p_kind = 'project' then
    perform 1 from public.vh_projects where id=p_object_id and account_id=p_account_id and trashed_at is not null for update;
    if not found then return false; end if;
    delete from public.vh_projects where id=p_object_id and account_id=p_account_id;
    return true;
  elsif p_kind = 'notebook' then
    perform 1 from public.vh_notebooks where id=p_object_id and account_id=p_account_id and trashed_at is not null for update;
    if not found then return false; end if;
    delete from public.vh_notebooks where id=p_object_id and account_id=p_account_id;
    return true;
  elsif p_kind = 'collection' then
    perform 1 from public.vh_library_collections where id=p_object_id and account_id=p_account_id and trashed_at is not null for update;
    if not found then return false; end if;
    delete from public.vh_library_collections where id=p_object_id and account_id=p_account_id;
    return true;
  elsif p_kind = 'asset' then
    select storage_object_id into v_storage_id
    from public.vh_library_assets
    where id=p_object_id and account_id=p_account_id and trashed_at is not null
    for update;
    if not found then return false; end if;

    delete from public.vh_project_references where account_id=p_account_id and asset_id=p_object_id;
    delete from public.vh_notebook_sources where account_id=p_account_id and asset_id=p_object_id;
    delete from public.vh_library_assets where id=p_object_id and account_id=p_account_id;
    if v_storage_id is not null then
      delete from public.vh_storage_objects where id=v_storage_id and account_id=p_account_id;
    end if;
    return true;
  end if;
  raise exception 'invalid_part2_trash_kind' using errcode='22023';
end;
$$;

revoke all on function public.vh_delete_part2_metadata(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.vh_delete_part2_metadata(uuid,text,uuid) to service_role;
