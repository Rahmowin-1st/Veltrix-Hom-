-- Veltrix Hom Backend Part 3: Conversation foundation hardening.
-- Additive over migration-115; accepted Part 1/2 contracts remain unchanged.

-- Conversation -> Project must be owner-coherent even for direct service writes.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname='vh_conversations_project_owner_fk'
      and conrelid='public.vh_conversations'::regclass
  ) then
    alter table public.vh_conversations
      add constraint vh_conversations_project_owner_fk
      foreign key(project_id,account_id)
      references public.vh_projects(id,account_id)
      on delete set null (project_id);
  end if;
end $$;

-- Permanent Reference identity is immutable after first set. A Library purge may only
-- degrade the same identity to a tombstone; it never re-opens the Reference slot.
create or replace function public.vh_guard_conversation_reference_identity()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if old.permanent_reference_set_at is not null then
    if new.permanent_reference_set_at is distinct from old.permanent_reference_set_at then
      raise exception 'conversation_reference_immutable' using errcode='23514';
    end if;
    if old.permanent_reference_asset_id is null and new.permanent_reference_asset_id is not null then
      raise exception 'conversation_reference_immutable' using errcode='23514';
    end if;
    if old.permanent_reference_asset_id is not null and new.permanent_reference_asset_id is distinct from old.permanent_reference_asset_id then
      if new.permanent_reference_asset_id is not null
         or coalesce(new.permanent_reference_tombstone->>'status','') <> 'PURGED'
         or coalesce(new.permanent_reference_tombstone->>'assetId','') <> old.permanent_reference_asset_id::text then
        raise exception 'conversation_reference_immutable' using errcode='23514';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists vh_conversations_reference_identity_guard on public.vh_conversations;
create trigger vh_conversations_reference_identity_guard
before update of permanent_reference_asset_id,permanent_reference_set_at,permanent_reference_tombstone
on public.vh_conversations
for each row execute function public.vh_guard_conversation_reference_identity();

-- Override the Part-3 setter with a durable source snapshot. Same asset retry is idempotent;
-- any replacement after first set conflicts, including after purge.
create or replace function public.vh_set_conversation_reference(p_account_id uuid,p_conversation_id uuid,p_asset_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_existing uuid;
  v_set_at timestamptz;
  v_asset public.vh_library_assets%rowtype;
  v_snapshot jsonb;
begin
  select permanent_reference_asset_id,permanent_reference_set_at
    into v_existing,v_set_at
  from public.vh_conversations
  where id=p_conversation_id and account_id=p_account_id and trashed_at is null
  for update;
  if not found then raise exception 'conversation_not_found' using errcode='P0002'; end if;

  if v_set_at is not null then
    if v_existing=p_asset_id then return p_asset_id; end if;
    raise exception 'conversation_reference_immutable' using errcode='23514';
  end if;

  select * into v_asset
  from public.vh_library_assets
  where id=p_asset_id
    and account_id=p_account_id
    and trashed_at is null
    and processing_status not in ('FAILED','UNSUPPORTED')
  for share;
  if not found then raise exception 'asset_not_found' using errcode='P0002'; end if;
  if v_asset.original_size_bytes > 20*1024*1024 then
    raise exception 'conversation_reference_bytes_exceeded' using errcode='22001';
  end if;

  v_snapshot := jsonb_build_object(
    'status','ACTIVE',
    'assetId',v_asset.id::text,
    'title',v_asset.display_title,
    'sourceKind',v_asset.source_kind,
    'sizeBytes',v_asset.original_size_bytes,
    'contentSha256',v_asset.content_sha256,
    'sourceRevision',v_asset.source_revision,
    'detectedMime',v_asset.detected_mime
  );

  update public.vh_conversations
  set permanent_reference_asset_id=v_asset.id,
      permanent_reference_set_at=now(),
      permanent_reference_tombstone=v_snapshot,
      updated_at=now(),
      revision=revision+1
  where id=p_conversation_id;
  return v_asset.id;
end $$;

-- Library Trash/restore changes availability only. Permanent purge leaves a durable
-- tombstone and clears only the FK pointer so the Library row can be deleted.
create or replace function public.vh_sync_conversation_reference_asset_state()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if tg_op='UPDATE' and new.trashed_at is distinct from old.trashed_at then
    update public.vh_conversations
      set permanent_reference_tombstone = coalesce(permanent_reference_tombstone,'{}'::jsonb)
          || jsonb_build_object('status',case when new.trashed_at is null then 'ACTIVE' else 'TRASHED' end,
                                'assetId',new.id::text,
                                'trashedAt',case when new.trashed_at is null then null else new.trashed_at end),
          updated_at=now()
      where permanent_reference_asset_id=new.id and permanent_reference_set_at is not null;
    return new;
  elsif tg_op='DELETE' then
    update public.vh_conversations
      set permanent_reference_asset_id=null,
          permanent_reference_tombstone = coalesce(permanent_reference_tombstone,'{}'::jsonb)
            || jsonb_build_object('status','PURGED','assetId',old.id::text,'purgedAt',now()),
          updated_at=now()
      where permanent_reference_asset_id=old.id and permanent_reference_set_at is not null;
    return old;
  end if;
  return coalesce(new,old);
end $$;

drop trigger if exists vh_library_assets_conversation_reference_trash on public.vh_library_assets;
create trigger vh_library_assets_conversation_reference_trash
after update of trashed_at on public.vh_library_assets
for each row execute function public.vh_sync_conversation_reference_asset_state();

drop trigger if exists vh_library_assets_conversation_reference_purge on public.vh_library_assets;
create trigger vh_library_assets_conversation_reference_purge
before delete on public.vh_library_assets
for each row execute function public.vh_sync_conversation_reference_asset_state();

-- Message/Fast Ask attachment aggregate limits must remain true under concurrency and
-- direct service writes, not only through the helper RPCs.
create or replace function public.vh_guard_part3_attachment_insert()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_count integer;
  v_bytes bigint;
  v_actual_size bigint;
begin
  select original_size_bytes into v_actual_size
  from public.vh_library_assets
  where id=new.asset_id and account_id=new.account_id and trashed_at is null;
  if not found then raise exception 'asset_not_found' using errcode='P0002'; end if;
  if v_actual_size <> new.source_size_bytes then
    raise exception 'attachment_size_mismatch' using errcode='23514';
  end if;

  if tg_table_name='vh_message_attachments' then
    perform 1 from public.vh_conversation_messages
      where id=new.message_id and account_id=new.account_id for update;
    if not found then raise exception 'message_not_found' using errcode='P0002'; end if;
    select count(*)::int,coalesce(sum(source_size_bytes),0)::bigint
      into v_count,v_bytes from public.vh_message_attachments where message_id=new.message_id;
  else
    perform 1 from public.vh_fast_ask_sessions
      where id=new.fast_ask_id and account_id=new.account_id and status not in ('EXPIRED','CONVERTED') for update;
    if not found then raise exception 'fast_ask_not_found' using errcode='P0002'; end if;
    select count(*)::int,coalesce(sum(source_size_bytes),0)::bigint
      into v_count,v_bytes from public.vh_fast_ask_attachments where fast_ask_id=new.fast_ask_id;
  end if;

  if v_count >= 5 then raise exception 'attachment_count_exceeded' using errcode='22023'; end if;
  if v_bytes + new.source_size_bytes > 10*1024*1024 then
    raise exception 'attachment_bytes_exceeded' using errcode='22001';
  end if;
  return new;
end $$;

drop trigger if exists vh_message_attachments_limit_guard on public.vh_message_attachments;
create trigger vh_message_attachments_limit_guard
before insert on public.vh_message_attachments
for each row execute function public.vh_guard_part3_attachment_insert();

drop trigger if exists vh_fast_ask_attachments_limit_guard on public.vh_fast_ask_attachments;
create trigger vh_fast_ask_attachments_limit_guard
before insert on public.vh_fast_ask_attachments
for each row execute function public.vh_guard_part3_attachment_insert();

create or replace function public.vh_guard_part3_attachment_identity()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if tg_table_name='vh_message_attachments' then
    if new.account_id is distinct from old.account_id
       or new.message_id is distinct from old.message_id
       or new.asset_id is distinct from old.asset_id
       or new.source_size_bytes is distinct from old.source_size_bytes then
      raise exception 'attachment_identity_immutable' using errcode='23514';
    end if;
  else
    if new.account_id is distinct from old.account_id
       or new.fast_ask_id is distinct from old.fast_ask_id
       or new.asset_id is distinct from old.asset_id
       or new.source_size_bytes is distinct from old.source_size_bytes then
      raise exception 'attachment_identity_immutable' using errcode='23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists vh_message_attachments_identity_guard on public.vh_message_attachments;
create trigger vh_message_attachments_identity_guard
before update on public.vh_message_attachments
for each row execute function public.vh_guard_part3_attachment_identity();

drop trigger if exists vh_fast_ask_attachments_identity_guard on public.vh_fast_ask_attachments;
create trigger vh_fast_ask_attachments_identity_guard
before update on public.vh_fast_ask_attachments
for each row execute function public.vh_guard_part3_attachment_identity();

-- Trigger helpers are not public execution surfaces.
revoke all on function public.vh_guard_conversation_reference_identity() from public,anon,authenticated;
revoke all on function public.vh_sync_conversation_reference_asset_state() from public,anon,authenticated;
revoke all on function public.vh_guard_part3_attachment_insert() from public,anon,authenticated;
revoke all on function public.vh_guard_part3_attachment_identity() from public,anon,authenticated;
revoke all on function public.vh_set_conversation_reference(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.vh_set_conversation_reference(uuid,uuid,uuid) to service_role;
