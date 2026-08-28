-- Veltrix Hom Backend Part 4: event-driven notifications + Library 900 MiB attention.
-- Additive over Part4 foundation tables created in migration 123.

create table if not exists public.vh_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  notification_id uuid not null references public.vh_notifications(id) on delete cascade,
  device_token_id uuid not null references public.vh_device_tokens(id) on delete cascade,
  provider text not null check (provider in ('FCM','OTHER')),
  state text not null default 'QUEUED' check (state in ('QUEUED','SENT','FAILED','SKIPPED')),
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 25),
  safe_error_code text,
  provider_message_id text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(notification_id,device_token_id)
);
create index if not exists vh_notification_deliveries_owner_state_idx
  on public.vh_notification_deliveries(account_id,state,queued_at,id);
alter table public.vh_notification_deliveries enable row level security;

create or replace function public.vh_set_notification_preference(
  p_account_id uuid,
  p_category text,
  p_inside_enabled boolean,
  p_outside_enabled boolean
) returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if char_length(btrim(coalesce(p_category,''))) not between 1 and 80 then
    raise exception 'notification_category_invalid' using errcode='22023';
  end if;
  insert into public.vh_notification_preferences(account_id,category,inside_enabled,outside_enabled,updated_at)
  values(p_account_id,btrim(p_category),p_inside_enabled,p_outside_enabled,now())
  on conflict(account_id,category) do update set
    inside_enabled=excluded.inside_enabled,
    outside_enabled=excluded.outside_enabled,
    updated_at=now();
  return true;
end;
$$;
revoke all on function public.vh_set_notification_preference(uuid,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.vh_set_notification_preference(uuid,text,boolean,boolean) to service_role;

-- Notification emission applies category preferences at creation time.
-- Outside payload receives only a compact safe deep-link locator and explicitly allowed metadata.
create or replace function public.vh_emit_notification(
  p_account_id uuid,
  p_event_type text,
  p_category text,
  p_severity text,
  p_title_key text,
  p_body_data jsonb default '{}'::jsonb,
  p_target jsonb default '{}'::jsonb,
  p_priority text default 'NORMAL',
  p_safe_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_id uuid;
  v_inside boolean := true;
  v_outside boolean := false;
  v_has_token boolean := false;
  v_inside_state text;
  v_outside_state text;
  v_safe_target jsonb;
  v_safe jsonb;
begin
  if char_length(btrim(coalesce(p_event_type,''))) not between 1 and 120
     or char_length(btrim(coalesce(p_category,''))) not between 1 and 80
     or char_length(btrim(coalesce(p_title_key,''))) not between 1 and 160 then
    raise exception 'notification_identity_invalid' using errcode='22023';
  end if;
  if p_severity not in ('info','success','warning','error','progress','action-needed')
     or p_priority not in ('LOW','NORMAL','HIGH') then
    raise exception 'notification_class_invalid' using errcode='22023';
  end if;
  if jsonb_typeof(coalesce(p_body_data,'{}'::jsonb))<>'object'
     or jsonb_typeof(coalesce(p_target,'{}'::jsonb))<>'object'
     or jsonb_typeof(coalesce(p_safe_metadata,'{}'::jsonb))<>'object' then
    raise exception 'notification_payload_invalid' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_object_keys(coalesce(p_safe_metadata,'{}'::jsonb)) k
            where k not in ('progress','imageObjectId')) then
    raise exception 'notification_safe_metadata_invalid' using errcode='22023';
  end if;

  select inside_enabled,outside_enabled into v_inside,v_outside
  from public.vh_notification_preferences
  where account_id=p_account_id and category=btrim(p_category);
  if not found then v_inside:=true; v_outside:=false; end if;

  select exists(select 1 from public.vh_device_tokens
    where account_id=p_account_id and active=true and revoked_at is null) into v_has_token;

  v_inside_state:=case when v_inside then 'VISIBLE' else 'SUPPRESSED' end;
  v_outside_state:=case
    when not v_outside then 'SUPPRESSED'
    when v_has_token then 'QUEUED'
    else 'NOT_ELIGIBLE'
  end;

  v_safe_target:=jsonb_strip_nulls(jsonb_build_object(
    'route',p_target->'route',
    'entityType',p_target->'entityType',
    'entityId',p_target->'entityId',
    'action',p_target->'action'
  ));
  v_safe:=jsonb_build_object(
    'eventType',btrim(p_event_type),
    'category',btrim(p_category),
    'titleKey',btrim(p_title_key),
    'target',v_safe_target,
    'priority',p_priority
  ) || coalesce(p_safe_metadata,'{}'::jsonb);

  insert into public.vh_notifications(
    account_id,event_type,category,severity,title_key,body_data,target,priority,
    inside_state,outside_state,outside_payload,created_at,outside_updated_at
  ) values(
    p_account_id,btrim(p_event_type),btrim(p_category),p_severity,btrim(p_title_key),
    coalesce(p_body_data,'{}'::jsonb),coalesce(p_target,'{}'::jsonb),p_priority,
    v_inside_state,v_outside_state,v_safe,now(),case when v_outside_state='QUEUED' then now() else null end
  ) returning id into v_id;

  update public.vh_notifications
  set outside_payload=outside_payload || jsonb_build_object('notificationId',v_id)
  where id=v_id;
  return v_id;
end;
$$;
revoke all on function public.vh_emit_notification(uuid,text,text,text,text,jsonb,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.vh_emit_notification(uuid,text,text,text,text,jsonb,jsonb,text,jsonb) to service_role;

-- Threshold-crossing state machine. Returns a new notification id only when a notification is due.
create or replace function public.vh_update_library_attention(
  p_account_id uuid,
  p_bytes_used bigint,
  p_warning_bytes bigint,
  p_cooldown_seconds integer default 604800
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  a public.vh_attention_states%rowtype;
  v_notify boolean := false;
  v_notification uuid;
begin
  if p_bytes_used<0 or p_warning_bytes<=0 or p_cooldown_seconds<3600 then
    raise exception 'library_attention_input_invalid' using errcode='22023';
  end if;

  insert into public.vh_attention_states(account_id,attention_key,active,state,updated_at)
  values(p_account_id,'library.storage.warning',false,'{}'::jsonb,now())
  on conflict(account_id,attention_key) do nothing;

  select * into a from public.vh_attention_states
  where account_id=p_account_id and attention_key='library.storage.warning' for update;

  if p_bytes_used < p_warning_bytes then
    update public.vh_attention_states set
      active=false,
      state=jsonb_build_object('bytesUsed',p_bytes_used,'warningBytes',p_warning_bytes),
      cleared_at=case when a.active then now() else cleared_at end,
      updated_at=now()
    where account_id=p_account_id and attention_key='library.storage.warning';
    return null;
  end if;

  if not a.active then
    v_notify:=true;
  elsif a.last_notified_at is null or a.last_notified_at <= now() - make_interval(secs=>p_cooldown_seconds) then
    v_notify:=true;
  end if;

  update public.vh_attention_states set
    active=true,
    state=jsonb_build_object('bytesUsed',p_bytes_used,'warningBytes',p_warning_bytes),
    activated_at=case when not a.active then now() else activated_at end,
    cleared_at=null,
    updated_at=now()
  where account_id=p_account_id and attention_key='library.storage.warning';

  if v_notify then
    v_notification:=public.vh_emit_notification(
      p_account_id,
      'library.storage.warning',
      'library_attention',
      'warning',
      'library.storage.warning',
      jsonb_build_object('bytesUsed',p_bytes_used,'warningBytes',p_warning_bytes),
      jsonb_build_object('route','library'),
      'HIGH',
      '{}'::jsonb
    );
    update public.vh_attention_states set last_notified_at=now(),updated_at=now()
    where account_id=p_account_id and attention_key='library.storage.warning';
  end if;
  return v_notification;
end;
$$;
revoke all on function public.vh_update_library_attention(uuid,bigint,bigint,integer) from public,anon,authenticated;
grant execute on function public.vh_update_library_attention(uuid,bigint,bigint,integer) to service_role;
