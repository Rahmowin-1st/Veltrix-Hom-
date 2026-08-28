#!/usr/bin/env bash
set -euo pipefail

psql -X -v ON_ERROR_STOP=1 <<'SQL'
\set VERBOSITY verbose

do $$
declare
  a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  n uuid; first_warning uuid; cooldown_warning uuid; recross_warning uuid;
  warning_bytes bigint := 900::bigint*1024*1024;
  r public.vh_notifications%rowtype;
begin
  insert into public.vh_accounts(id,email,status) values
    (a,'p4-notify-a@example.test','active'),
    (b,'p4-notify-b@example.test','active')
  on conflict(id) do nothing;

  -- Active token makes outside delivery eligible. Test fixture does not contain a real provider secret.
  insert into public.vh_device_tokens(account_id,provider,token_digest,encrypted_token,device_label,active)
  values(a,'FCM',repeat('a',64),'fixture-encrypted-token','CI device',true)
  on conflict(account_id,provider,token_digest) do update set active=true,revoked_at=null,updated_at=now();

  perform public.vh_set_notification_preference(a,'learning',true,true);
  n:=public.vh_emit_notification(
    a,'lesson.ready','learning','success','lesson.ready',
    '{"secret":"PRIVATE FULL BODY","detail":"inside only"}'::jsonb,
    '{"route":"studio","entityType":"studio_artifact","entityId":"cccccccc-cccc-4ccc-8ccc-ccccccccccc3","secret":"MUST_NOT_PUSH"}'::jsonb,
    'HIGH','{"progress":0.5}'::jsonb
  );
  select * into r from public.vh_notifications where id=n;
  if r.inside_state<>'VISIBLE' or r.outside_state<>'QUEUED' then raise exception 'P4_NOTIFY_PREFERENCE_STATE_FAILED'; end if;
  if r.outside_payload::text like '%PRIVATE FULL BODY%' or r.outside_payload::text like '%MUST_NOT_PUSH%' then raise exception 'P4_NOTIFY_SENSITIVE_PUSH_LEAK'; end if;
  if r.outside_payload->'target' ? 'secret' then raise exception 'P4_NOTIFY_TARGET_NOT_MINIMIZED'; end if;
  if r.outside_payload#>>'{target,route}'<>'studio' or (r.outside_payload->>'progress')::numeric<>0.5 then raise exception 'P4_NOTIFY_SAFE_PAYLOAD_MISSING'; end if;

  -- Default category: Inside on, Outside off.
  n:=public.vh_emit_notification(a,'default.event','default_category','info','default.title','{}','{}','NORMAL','{}');
  select * into r from public.vh_notifications where id=n;
  if r.inside_state<>'VISIBLE' or r.outside_state<>'SUPPRESSED' then raise exception 'P4_NOTIFY_DEFAULT_PREF_FAILED'; end if;

  -- Explicit preference can suppress both channels.
  perform public.vh_set_notification_preference(b,'quiet',false,false);
  n:=public.vh_emit_notification(b,'quiet.event','quiet','info','quiet.title','{"private":"inside data"}','{}','LOW','{}');
  select * into r from public.vh_notifications where id=n;
  if r.inside_state<>'SUPPRESSED' or r.outside_state<>'SUPPRESSED' then raise exception 'P4_NOTIFY_SUPPRESSION_FAILED'; end if;

  -- 900 MiB attention: below=no event; crossing=one event; stable-above=no spam.
  perform public.vh_set_notification_preference(a,'library_attention',true,true);
  if public.vh_update_library_attention(a,warning_bytes-1,warning_bytes,604800) is not null then raise exception 'P4_LIBRARY_WARNING_BELOW_THRESHOLD'; end if;
  first_warning:=public.vh_update_library_attention(a,warning_bytes,warning_bytes,604800);
  if first_warning is null then raise exception 'P4_LIBRARY_WARNING_CROSSING_MISSING'; end if;
  if public.vh_update_library_attention(a,warning_bytes+1024,warning_bytes,604800) is not null then raise exception 'P4_LIBRARY_WARNING_SPAM'; end if;
  if not (select active from public.vh_attention_states where account_id=a and attention_key='library.storage.warning') then raise exception 'P4_LIBRARY_WARNING_BADGE_NOT_ACTIVE'; end if;

  -- Controlled cooldown permits a later reminder without per-request spam.
  update public.vh_attention_states set last_notified_at=now()-interval '2 hours'
  where account_id=a and attention_key='library.storage.warning';
  cooldown_warning:=public.vh_update_library_attention(a,warning_bytes+2048,warning_bytes,3600);
  if cooldown_warning is null or cooldown_warning=first_warning then raise exception 'P4_LIBRARY_WARNING_COOLDOWN_FAILED'; end if;

  -- Falling below clears attention; a future crossing re-arms it.
  if public.vh_update_library_attention(a,warning_bytes-4096,warning_bytes,604800) is not null then raise exception 'P4_LIBRARY_WARNING_CLEAR_EMITTED'; end if;
  if (select active from public.vh_attention_states where account_id=a and attention_key='library.storage.warning') then raise exception 'P4_LIBRARY_WARNING_CLEAR_FAILED'; end if;
  recross_warning:=public.vh_update_library_attention(a,warning_bytes+1,warning_bytes,604800);
  if recross_warning is null or recross_warning in (first_warning,cooldown_warning) then raise exception 'P4_LIBRARY_WARNING_RECROSS_FAILED'; end if;

  if not exists(select 1 from pg_class c join pg_namespace nsp on nsp.oid=c.relnamespace where nsp.nspname='public' and c.relname='vh_notification_deliveries' and c.relrowsecurity) then raise exception 'P4_NOTIFY_DELIVERY_RLS_DISABLED'; end if;

  raise notice 'P4_NOTIFICATION_PREFERENCES=PASS inside outside defaults suppression';
  raise notice 'P4_INSIDE_NOTIFICATIONS=PASS visible read-model states';
  raise notice 'P4_OUTSIDE_INFRA=PASS eligible_queue safe_payload delivery_table';
  raise notice 'P4_LIBRARY_900MB_ATTENTION=PASS crossing cooldown clear recross no_spam';
end $$;

select 'P4_STAGE80_NOTIFICATIONS=PASS';
SQL
