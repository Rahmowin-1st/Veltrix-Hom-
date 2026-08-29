-- Veltrix Hom Backend Part 5 MAX hardening: at-most-once outside notification side-effect claim.
-- Forward-only. External push providers do not expose a backend-wide idempotency primitive,
-- so a durable pre-send claim prevents replay/crash races from duplicating user notifications.

create or replace function public.vh_claim_notification_delivery(
  p_account_id uuid,
  p_notification_id uuid,
  p_device_token_id uuid,
  p_provider text
) returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare inserted_count integer:=0;
begin
  if p_provider not in ('FCM','OTHER') then
    raise exception 'notification_provider_invalid' using errcode='22023';
  end if;

  if not exists(
    select 1
    from public.vh_notifications n
    join public.vh_device_tokens d on d.account_id=n.account_id
    where n.id=p_notification_id
      and n.account_id=p_account_id
      and d.id=p_device_token_id
      and d.account_id=p_account_id
      and d.provider=p_provider
      and d.active=true
      and d.revoked_at is null
      and n.outside_state='QUEUED'
  ) then
    return false;
  end if;

  insert into public.vh_notification_deliveries(
    account_id,notification_id,device_token_id,provider,state,attempts,safe_error_code,updated_at
  ) values(
    p_account_id,p_notification_id,p_device_token_id,p_provider,'SKIPPED',1,'DELIVERY_OUTCOME_UNKNOWN',now()
  )
  on conflict(notification_id,device_token_id) do nothing;
  get diagnostics inserted_count=row_count;
  return inserted_count=1;
end;
$$;
revoke all on function public.vh_claim_notification_delivery(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.vh_claim_notification_delivery(uuid,uuid,uuid,text) to service_role;
