-- Veltrix Hom Backend Part 3: durable typed Conversation streaming state.
-- Additive over migrations 115-116. No accepted Part 1/2 contract is changed.

create index if not exists vh_conversation_messages_request_idx
  on public.vh_conversation_messages(account_id,conversation_id,request_id,role)
  where request_id is not null;

-- Final blocks are authoritative only for a completed assistant message.
create or replace function public.vh_guard_conversation_message_final_state()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if old.status in ('COMPLETED','FAILED','CANCELLED') then
    if new.status is distinct from old.status
       or new.plain_text is distinct from old.plain_text
       or new.content_blocks is distinct from old.content_blocks
       or new.request_id is distinct from old.request_id
       or new.idempotency_key is distinct from old.idempotency_key then
      raise exception 'conversation_message_terminal_immutable' using errcode='23514';
    end if;
  end if;

  if new.role='ASSISTANT' then
    if new.status='COMPLETED' then
      if jsonb_typeof(new.content_blocks) <> 'array' or jsonb_array_length(new.content_blocks)=0 then
        raise exception 'assistant_final_blocks_required' using errcode='23514';
      end if;
      if new.completed_at is null then
        raise exception 'assistant_completed_at_required' using errcode='23514';
      end if;
      if new.error_code is not null then
        raise exception 'assistant_completed_error_invalid' using errcode='23514';
      end if;
    elsif jsonb_array_length(new.content_blocks) <> 0 then
      raise exception 'assistant_partial_cannot_store_final_blocks' using errcode='23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists vh_conversation_message_final_state_guard on public.vh_conversation_messages;
create trigger vh_conversation_message_final_state_guard
before update on public.vh_conversation_messages
for each row execute function public.vh_guard_conversation_message_final_state();

-- One atomic user+assistant turn. Same idempotency key replays the same pair.
create or replace function public.vh_begin_conversation_turn(
  p_account_id uuid,
  p_conversation_id uuid,
  p_idempotency_key text,
  p_prompt text,
  p_attachment_asset_ids uuid[] default '{}'::uuid[]
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user public.vh_conversation_messages%rowtype;
  v_assistant public.vh_conversation_messages%rowtype;
  v_request_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_assistant_id uuid := gen_random_uuid();
  v_asset_id uuid;
  v_replayed boolean := false;
begin
  if p_idempotency_key is null or char_length(btrim(p_idempotency_key)) not between 1 and 128 then
    raise exception 'idempotency_key_invalid' using errcode='22023';
  end if;
  if p_prompt is null or char_length(btrim(p_prompt)) not between 1 and 20000 then
    raise exception 'conversation_prompt_invalid' using errcode='22023';
  end if;
  if coalesce(array_length(p_attachment_asset_ids,1),0) > 5 then
    raise exception 'attachment_count_exceeded' using errcode='22023';
  end if;

  -- Serialize equal turn identities without blocking unrelated Conversations.
  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text||':'||p_conversation_id::text||':'||p_idempotency_key,0));
  perform 1 from public.vh_conversations
    where id=p_conversation_id and account_id=p_account_id and trashed_at is null
    for update;
  if not found then raise exception 'conversation_not_found' using errcode='P0002'; end if;

  select * into v_user from public.vh_conversation_messages
    where account_id=p_account_id and conversation_id=p_conversation_id
      and role='USER' and idempotency_key=p_idempotency_key
    limit 1;
  if found then
    select * into v_assistant from public.vh_conversation_messages
      where account_id=p_account_id and conversation_id=p_conversation_id
        and role='ASSISTANT' and idempotency_key=p_idempotency_key
      limit 1;
    if not found then raise exception 'conversation_turn_corrupt' using errcode='23514'; end if;
    v_replayed := true;
    return jsonb_build_object(
      'replayed',true,
      'requestId',v_user.request_id,
      'userMessageId',v_user.id,
      'assistantMessageId',v_assistant.id,
      'assistantStatus',v_assistant.status
    );
  end if;

  insert into public.vh_conversation_messages(
    id,account_id,conversation_id,role,status,request_id,idempotency_key,plain_text,content_blocks,completed_at
  ) values (
    v_user_id,p_account_id,p_conversation_id,'USER','COMPLETED',v_request_id,p_idempotency_key,btrim(p_prompt),'[]'::jsonb,now()
  ) returning * into v_user;

  insert into public.vh_conversation_messages(
    id,account_id,conversation_id,role,status,request_id,idempotency_key,plain_text,content_blocks
  ) values (
    v_assistant_id,p_account_id,p_conversation_id,'ASSISTANT','STREAMING',v_request_id,p_idempotency_key,'','[]'::jsonb
  ) returning * into v_assistant;

  foreach v_asset_id in array coalesce(p_attachment_asset_ids,'{}'::uuid[]) loop
    perform public.vh_add_message_attachment(p_account_id,v_user_id,v_asset_id);
  end loop;

  update public.vh_conversations
    set last_message_at=now(),updated_at=now(),revision=revision+1
    where id=p_conversation_id and account_id=p_account_id;

  return jsonb_build_object(
    'replayed',v_replayed,
    'requestId',v_request_id,
    'userMessageId',v_user_id,
    'assistantMessageId',v_assistant_id,
    'assistantStatus','STREAMING'
  );
end $$;

create or replace function public.vh_append_conversation_stream_event(
  p_account_id uuid,
  p_message_id uuid,
  p_request_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_block_id text default null,
  p_block_type text default null,
  p_block_version integer default null
) returns bigint
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_status text;
  v_request uuid;
  v_seq bigint;
begin
  select status,request_id into v_status,v_request
  from public.vh_conversation_messages
  where id=p_message_id and account_id=p_account_id and role='ASSISTANT'
  for update;
  if not found then raise exception 'assistant_message_not_found' using errcode='P0002'; end if;
  if v_request is distinct from p_request_id then raise exception 'stream_request_mismatch' using errcode='23514'; end if;
  if p_event_type not in ('message.started','block.started','block.delta','block.completed','tool.started','tool.progress','tool.completed','citation.added','message.completed','message.failed','message.cancelled','heartbeat') then
    raise exception 'stream_event_type_invalid' using errcode='22023';
  end if;
  if v_status in ('COMPLETED','FAILED','CANCELLED') and p_event_type not in ('heartbeat') then
    raise exception 'stream_message_terminal' using errcode='23514';
  end if;

  select coalesce(max(seq),0)+1 into v_seq
    from public.vh_stream_events where message_id=p_message_id;
  insert into public.vh_stream_events(
    account_id,message_id,request_id,protocol_version,seq,event_type,block_id,block_type,block_version,payload
  ) values (
    p_account_id,p_message_id,p_request_id,1,v_seq,p_event_type,p_block_id,p_block_type,p_block_version,coalesce(p_payload,'{}'::jsonb)
  );
  return v_seq;
end $$;

create or replace function public.vh_complete_conversation_message(
  p_account_id uuid,
  p_message_id uuid,
  p_request_id uuid,
  p_plain_text text,
  p_content_blocks jsonb,
  p_model_route jsonb default '{}'::jsonb,
  p_usage_metrics jsonb default '{}'::jsonb,
  p_provenance jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_message public.vh_conversation_messages%rowtype;
  v_seq bigint;
begin
  if jsonb_typeof(p_content_blocks) <> 'array' or jsonb_array_length(p_content_blocks)=0 then
    raise exception 'assistant_final_blocks_required' using errcode='22023';
  end if;
  select * into v_message from public.vh_conversation_messages
    where id=p_message_id and account_id=p_account_id and role='ASSISTANT'
    for update;
  if not found then raise exception 'assistant_message_not_found' using errcode='P0002'; end if;
  if v_message.request_id is distinct from p_request_id then raise exception 'stream_request_mismatch' using errcode='23514'; end if;
  if v_message.status='COMPLETED' then
    if v_message.content_blocks = p_content_blocks and v_message.plain_text = coalesce(p_plain_text,'') then
      select max(seq) into v_seq from public.vh_stream_events where message_id=p_message_id and event_type='message.completed';
      return jsonb_build_object('messageId',p_message_id,'status','COMPLETED','seq',v_seq,'replayed',true);
    end if;
    raise exception 'conversation_message_terminal_immutable' using errcode='23514';
  end if;
  if v_message.status in ('FAILED','CANCELLED') then raise exception 'conversation_message_terminal' using errcode='23514'; end if;

  update public.vh_conversation_messages
    set status='COMPLETED',plain_text=coalesce(p_plain_text,''),content_blocks=p_content_blocks,
        model_route=coalesce(p_model_route,'{}'::jsonb),usage_metrics=coalesce(p_usage_metrics,'{}'::jsonb),
        provenance=coalesce(p_provenance,'{}'::jsonb),error_code=null,completed_at=now(),updated_at=now()
    where id=p_message_id;

  select coalesce(max(seq),0)+1 into v_seq from public.vh_stream_events where message_id=p_message_id;
  insert into public.vh_stream_events(account_id,message_id,request_id,protocol_version,seq,event_type,payload)
    values(p_account_id,p_message_id,p_request_id,1,v_seq,'message.completed',jsonb_build_object('messageId',p_message_id,'status','COMPLETED'));
  return jsonb_build_object('messageId',p_message_id,'status','COMPLETED','seq',v_seq,'replayed',false);
end $$;

create or replace function public.vh_mark_conversation_message_incomplete(
  p_account_id uuid,p_message_id uuid,p_request_id uuid,p_code text default 'STREAM_INTERRUPTED'
) returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_status text; v_request uuid;
begin
  select status,request_id into v_status,v_request from public.vh_conversation_messages
    where id=p_message_id and account_id=p_account_id and role='ASSISTANT' for update;
  if not found then raise exception 'assistant_message_not_found' using errcode='P0002'; end if;
  if v_request is distinct from p_request_id then raise exception 'stream_request_mismatch' using errcode='23514'; end if;
  if v_status='STREAMING' then
    update public.vh_conversation_messages set status='INCOMPLETE',error_code=left(coalesce(p_code,'STREAM_INTERRUPTED'),96),updated_at=now() where id=p_message_id;
    return 'INCOMPLETE';
  end if;
  return v_status;
end $$;

create or replace function public.vh_cancel_conversation_message(
  p_account_id uuid,p_message_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_message public.vh_conversation_messages%rowtype; v_seq bigint;
begin
  select * into v_message from public.vh_conversation_messages
    where id=p_message_id and account_id=p_account_id and role='ASSISTANT' for update;
  if not found then raise exception 'assistant_message_not_found' using errcode='P0002'; end if;
  if v_message.status='CANCELLED' then
    select max(seq) into v_seq from public.vh_stream_events where message_id=p_message_id and event_type='message.cancelled';
    return jsonb_build_object('messageId',p_message_id,'status','CANCELLED','seq',v_seq,'replayed',true);
  end if;
  if v_message.status in ('COMPLETED','FAILED') then raise exception 'conversation_message_terminal' using errcode='23514'; end if;
  update public.vh_conversation_messages set status='CANCELLED',error_code='USER_CANCELLED',completed_at=now(),updated_at=now() where id=p_message_id;
  select coalesce(max(seq),0)+1 into v_seq from public.vh_stream_events where message_id=p_message_id;
  insert into public.vh_stream_events(account_id,message_id,request_id,protocol_version,seq,event_type,payload)
    values(p_account_id,p_message_id,v_message.request_id,1,v_seq,'message.cancelled',jsonb_build_object('messageId',p_message_id,'status','CANCELLED'));
  return jsonb_build_object('messageId',p_message_id,'status','CANCELLED','seq',v_seq,'replayed',false);
end $$;

create or replace function public.vh_fail_conversation_message(
  p_account_id uuid,p_message_id uuid,p_request_id uuid,p_code text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_message public.vh_conversation_messages%rowtype; v_seq bigint; v_code text;
begin
  v_code := left(coalesce(nullif(p_code,''),'STREAM_FAILED'),96);
  select * into v_message from public.vh_conversation_messages
    where id=p_message_id and account_id=p_account_id and role='ASSISTANT' for update;
  if not found then raise exception 'assistant_message_not_found' using errcode='P0002'; end if;
  if v_message.request_id is distinct from p_request_id then raise exception 'stream_request_mismatch' using errcode='23514'; end if;
  if v_message.status='FAILED' then
    select max(seq) into v_seq from public.vh_stream_events where message_id=p_message_id and event_type='message.failed';
    return jsonb_build_object('messageId',p_message_id,'status','FAILED','seq',v_seq,'replayed',true);
  end if;
  if v_message.status in ('COMPLETED','CANCELLED') then raise exception 'conversation_message_terminal' using errcode='23514'; end if;
  update public.vh_conversation_messages set status='FAILED',error_code=v_code,completed_at=now(),updated_at=now() where id=p_message_id;
  select coalesce(max(seq),0)+1 into v_seq from public.vh_stream_events where message_id=p_message_id;
  insert into public.vh_stream_events(account_id,message_id,request_id,protocol_version,seq,event_type,payload)
    values(p_account_id,p_message_id,p_request_id,1,v_seq,'message.failed',jsonb_build_object('messageId',p_message_id,'status','FAILED','code',v_code));
  return jsonb_build_object('messageId',p_message_id,'status','FAILED','seq',v_seq,'replayed',false);
end $$;

-- Trigger helper is not an API. Mutation RPCs remain service-role only.
revoke all on function public.vh_guard_conversation_message_final_state() from public,anon,authenticated;
revoke all on function public.vh_begin_conversation_turn(uuid,uuid,text,text,uuid[]) from public,anon,authenticated;
revoke all on function public.vh_append_conversation_stream_event(uuid,uuid,uuid,text,jsonb,text,text,integer) from public,anon,authenticated;
revoke all on function public.vh_complete_conversation_message(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.vh_mark_conversation_message_incomplete(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.vh_cancel_conversation_message(uuid,uuid) from public,anon,authenticated;
revoke all on function public.vh_fail_conversation_message(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.vh_begin_conversation_turn(uuid,uuid,text,text,uuid[]) to service_role;
grant execute on function public.vh_append_conversation_stream_event(uuid,uuid,uuid,text,jsonb,text,text,integer) to service_role;
grant execute on function public.vh_complete_conversation_message(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.vh_mark_conversation_message_incomplete(uuid,uuid,uuid,text) to service_role;
grant execute on function public.vh_cancel_conversation_message(uuid,uuid) to service_role;
grant execute on function public.vh_fail_conversation_message(uuid,uuid,uuid,text) to service_role;
