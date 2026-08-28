-- Stage90: permit expiry of completed, unconverted Fast Ask sessions without
-- weakening the immutability of their authoritative result or identity.
create or replace function public.vh_guard_fast_ask_terminal_state()
returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.status in ('COMPLETED','INCOMPLETE','FAILED','CANCELLED','EXPIRED','CONVERTED') then
    if old.status='COMPLETED' and new.status='CONVERTED'
       and old.response_text is not distinct from new.response_text
       and old.response_blocks is not distinct from new.response_blocks
       and old.request_id is not distinct from new.request_id
       and old.idempotency_key is not distinct from new.idempotency_key
       and new.converted_conversation_id is not null then
      return new;
    end if;
    if old.status='COMPLETED' and new.status='EXPIRED'
       and old.converted_conversation_id is null and new.converted_conversation_id is null
       and old.expires_at <= new.updated_at
       and old.response_text is not distinct from new.response_text
       and old.response_blocks is not distinct from new.response_blocks
       and old.request_id is not distinct from new.request_id
       and old.idempotency_key is not distinct from new.idempotency_key
       and old.account_id is not distinct from new.account_id
       and old.prompt is not distinct from new.prompt
       and old.model_route is not distinct from new.model_route
       and old.provenance is not distinct from new.provenance then
      return new;
    end if;
    if new.status is distinct from old.status
       or new.response_text is distinct from old.response_text
       or new.response_blocks is distinct from old.response_blocks
       or new.request_id is distinct from old.request_id
       or new.idempotency_key is distinct from old.idempotency_key
       or new.converted_conversation_id is distinct from old.converted_conversation_id then
      raise exception 'fast_ask_terminal_immutable' using errcode='23514';
    end if;
  end if;
  if new.status in ('COMPLETED','CONVERTED') then
    if jsonb_typeof(new.response_blocks) <> 'array' or jsonb_array_length(new.response_blocks)=0 then raise exception 'fast_ask_final_blocks_required' using errcode='23514'; end if;
    if new.completed_at is null then raise exception 'fast_ask_completed_at_required' using errcode='23514'; end if;
    if new.error_code is not null then raise exception 'fast_ask_completed_error_invalid' using errcode='23514'; end if;
  elsif new.status <> 'EXPIRED' and jsonb_array_length(new.response_blocks) <> 0 then
    raise exception 'fast_ask_partial_cannot_store_final_blocks' using errcode='23514';
  end if;
  return new;
end $$;

revoke all on function public.vh_guard_fast_ask_terminal_state() from public,anon,authenticated;
