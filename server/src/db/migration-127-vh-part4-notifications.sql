-- Veltrix Hom Backend Part 4 Stage80: notifications + Library 900 MiB attention.
-- Additive over migrations 123-126. Service-role-only mutation functions preserve owner isolation.

create or replace function public.vh_set_notification_preference(
  p_account_id uuid,
  p_category text,
  p_inside_enabled boolean,
  p_outside_enabled boolean
) returns public.vh_notification_preferences
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare outrow public.vh_notification_preferences%rowtype;
begin
  if p_category is null or p_category !~ '^[a-z][a-z0-9_.-]{0,79}$' then
    raise exception 'notification_category_invalid' using errcode='22023';
  end if;
  insert into public.vh_notification_preferences(account_id,category,inside_enabled,outside_enabled,updated_at)
  values(p_account_id,p_category,p_inside_enabled,p_outside_enabled,now())
  on conflict(account_id,category) do update set
    inside_enabled=excluded.inside_enabled,
    outside_enabled=excluded.outside_enabled,
    updated_at=excluded.updated_at
  returning * into outrow;
  return outrow;
end;
$$;
revoke all on function public.vh_set_notification_preference(uuid,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.vh_set_notification_preference(uuid,text,boolean,boolean) to service_role;

create or replace function public.vh_emit_notification(
  p_account_id uuid,
  p_event_type text,
  p_category text,
  p_severity text,
  p_title_key text,
  p_body_data jsonb default '{}'::jsonb,
  p_target jsonb default '{}'::jsonb,
  p_priority text default 'NORMAL',
  p_outside_payload jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  pref_inside boolean := true;
  pref_outside boolean := false;
  outid uuid;
begin
  if p_event_type is null or char_length(p_event_type) not between 1 and 120 then raise exception 'notification_event_type_invalid' using errcode='22023'; end if;
  if p_category is null or p_category !~ '^[a-z][a-z0-9_.-]{0,79}$' then raise exception 'notification_category_invalid' using errcode='22023'; end if;
  if p_severity not in ('info','success','warning','error','progress','action-needed') then raise exception 'notification_severity_invalid' using errcode='22023'; end if;
  if p_priority not in ('LOW','NORMAL','HIGH') then raise exception 'notification_priority_invalid' using errcode='22023'; end if;
  if p_title_key is null or char_length(p_title_key) not between 1 and 160 then raise exception 'notification_title_key_invalid' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_body_data,'{}'::jsonb))<>'object' or jsonb_typeof(coalesce(p_target,'{}'::jsonb))<>'object' or jsonb_typeof(coalesce(p_outside_payload,'{}'::jsonb))<>'object' then
    raise exception 'notification_payload_invalid' using errcode='22023';
  end if;
  -- Push payload is deliberately metadata-only; full user content stays server-side/in-app.
  if exists(
    select 1 from jsonb_object_keys(coalesce(p_outside_payload,'{}'::jsonb)) k
    where k not in ('deepLink','imageUrl','progress','collapseKey','attentionKey')
  ) then raise exception 'notification_outside_payload_field_invalid' using errcode='22023'; end if;

  select inside_enabled,outside_enabled into pref_inside,pref_outside
  from public.vh_notification_preferences
  where account_id=p_account_id and category=p_category;
  if not found then pref_inside:=true; pref_outside:=false; end if;

  insert into public.vh_notifications(
    account_id,event_type,category,severity,title_key,body_data,target,priority,
    inside_state,outside_state,outside_payload,created_at,outside_updated_at
  ) values(
    p_account_id,p_event_type,p_category,p_severity,p_title_key,
    coalesce(p_body_data,'{}'::jsonb),coalesce(p_target,'{}'::jsonb),p_priority,
    case when pref_inside then 'VISIBLE' else 'SUPPRESSED' end,
    case when pref_outside then 'QUEUED' else 'SUPPRESSED' end,
    coalesce(p_outside_payload,'{}'::jsonb),now(),now()
  ) returning id into outid;
  return outid;
end;
$$;
revoke all on function public.vh_emit_notification(uuid,text,text,text,text,jsonb,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.vh_emit_notification(uuid,text,text,text,text,jsonb,jsonb,text,jsonb) to service_role;

create or replace function public.vh_register_device_token(
  p_account_id uuid,
  p_provider text,
  p_token_digest text,
  p_encrypted_token text,
  p_device_label text default null,
  p_previous_digest text default null
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare outid uuid;
begin
  if p_provider not in ('FCM','OTHER') then raise exception 'push_provider_invalid' using errcode='22023'; end if;
  if p_token_digest !~ '^[0-9a-f]{64}$' then raise exception 'push_token_digest_invalid' using errcode='22023'; end if;
  if char_length(coalesce(p_encrypted_token,'')) not between 1 and 8192 then raise exception 'push_token_ciphertext_invalid' using errcode='22023'; end if;
  if p_device_label is not null and char_length(p_device_label)>240 then raise exception 'push_device_label_invalid' using errcode='22023'; end if;

  if p_previous_digest is not null and p_previous_digest<>p_token_digest then
    update public.vh_device_tokens set active=false,revoked_at=now(),updated_at=now()
    where account_id=p_account_id and provider=p_provider and token_digest=p_previous_digest and active=true;
  end if;

  insert into public.vh_device_tokens(account_id,provider,token_digest,encrypted_token,device_label,active,last_seen_at,revoked_at,updated_at)
  values(p_account_id,p_provider,p_token_digest,p_encrypted_token,p_device_label,true,now(),null,now())
  on conflict(account_id,provider,token_digest) do update set
    encrypted_token=excluded.encrypted_token,
    device_label=excluded.device_label,
    active=true,
    last_seen_at=now(),
    revoked_at=null,
    updated_at=now()
  returning id into outid;
  return outid;
end;
$$;
revoke all on function public.vh_register_device_token(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.vh_register_device_token(uuid,text,text,text,text,text) to service_role;

create or replace function public.vh_revoke_device_token(
  p_account_id uuid,
  p_provider text,
  p_token_digest text
) returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  update public.vh_device_tokens set active=false,revoked_at=now(),updated_at=now()
  where account_id=p_account_id and provider=p_provider and token_digest=p_token_digest and active=true;
  return found;
end;
$$;
revoke all on function public.vh_revoke_device_token(uuid,text,text) from public,anon,authenticated;
grant execute on function public.vh_revoke_device_token(uuid,text,text) to service_role;

create or replace function public.vh_reconcile_library_attention(
  p_account_id uuid,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  used_bytes bigint := 0;
  reserved_bytes bigint := 0;
  warning_bytes bigint := 943718400; -- 900 MiB
  hard_bytes bigint := 1073741824;   -- 1 GiB
  total_bytes bigint;
  att public.vh_attention_states%rowtype;
  should_notify boolean := false;
  event_id uuid := null;
begin
  select coalesce(bytes_used,0),coalesce(bytes_reserved,0) into used_bytes,reserved_bytes
  from public.vh_quota_usage where account_id=p_account_id and scope='library';
  if not found then used_bytes:=0; reserved_bytes:=0; end if;

  select coalesce(o.warning_bytes,p.warning_bytes,943718400),coalesce(o.hard_bytes,p.hard_bytes,1073741824)
    into warning_bytes,hard_bytes
  from public.vh_quota_policies p
  left join public.vh_quota_overrides o on o.account_id=p_account_id and o.policy_key=p.policy_key and (o.expires_at is null or o.expires_at>p_now)
  where p.policy_key='library.storage';
  if not found then warning_bytes:=943718400; hard_bytes:=1073741824; end if;
  warning_bytes:=coalesce(warning_bytes,943718400);
  hard_bytes:=coalesce(hard_bytes,1073741824);
  total_bytes:=used_bytes+reserved_bytes;

  insert into public.vh_attention_states(account_id,attention_key,active,state,updated_at)
  values(p_account_id,'library.storage.warning',false,'{}'::jsonb,p_now)
  on conflict(account_id,attention_key) do nothing;

  select * into att from public.vh_attention_states
  where account_id=p_account_id and attention_key='library.storage.warning' for update;

  if total_bytes>=warning_bytes then
    should_notify := (not att.active) or att.last_notified_at is null or att.last_notified_at<=p_now-interval '7 days';
    update public.vh_attention_states set
      active=true,
      activated_at=case when not att.active then p_now else activated_at end,
      cleared_at=null,
      state=jsonb_build_object('bytesUsed',used_bytes,'bytesReserved',reserved_bytes,'totalBytes',total_bytes,'warningAtBytes',warning_bytes,'hardLimitBytes',hard_bytes),
      updated_at=p_now
    where account_id=p_account_id and attention_key='library.storage.warning';

    if should_notify then
      event_id:=public.vh_emit_notification(
        p_account_id,
        'library.storage.warning',
        'library',
        'warning',
        'library.storage.warning',
        jsonb_build_object('bytesUsed',used_bytes,'bytesReserved',reserved_bytes,'warningAtBytes',warning_bytes,'hardLimitBytes',hard_bytes),
        jsonb_build_object('route','library'),
        'HIGH',
        jsonb_build_object('deepLink',jsonb_build_object('route','library'),'attentionKey','library.storage.warning')
      );
      update public.vh_attention_states set last_notified_at=p_now,updated_at=p_now
      where account_id=p_account_id and attention_key='library.storage.warning';
    end if;
  else
    update public.vh_attention_states set
      active=false,
      cleared_at=case when att.active then p_now else cleared_at end,
      state=jsonb_build_object('bytesUsed',used_bytes,'bytesReserved',reserved_bytes,'totalBytes',total_bytes,'warningAtBytes',warning_bytes,'hardLimitBytes',hard_bytes),
      updated_at=p_now
    where account_id=p_account_id and attention_key='library.storage.warning';
  end if;

  return jsonb_build_object(
    'active',total_bytes>=warning_bytes,
    'bytesUsed',used_bytes,
    'bytesReserved',reserved_bytes,
    'totalBytes',total_bytes,
    'warningAtBytes',warning_bytes,
    'hardLimitBytes',hard_bytes,
    'notificationId',event_id,
    'cooldownSeconds',604800
  );
end;
$$;
revoke all on function public.vh_reconcile_library_attention(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.vh_reconcile_library_attention(uuid,timestamptz) to service_role;

create or replace function public.vh_library_attention_quota_trigger() returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.scope='library' then perform public.vh_reconcile_library_attention(new.account_id,now()); end if;
  return new;
end;
$$;

drop trigger if exists vh_quota_usage_library_attention_trg on public.vh_quota_usage;
create trigger vh_quota_usage_library_attention_trg
after insert or update of bytes_used,bytes_reserved on public.vh_quota_usage
for each row execute function public.vh_library_attention_quota_trigger();

-- Backfill attention state for accounts that already have Library usage when this migration lands.
do $$
declare r record;
begin
  for r in select account_id from public.vh_quota_usage where scope='library' loop
    perform public.vh_reconcile_library_attention(r.account_id,now());
  end loop;
end $$;
