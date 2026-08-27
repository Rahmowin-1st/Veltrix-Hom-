-- Veltrix Hom Backend Part 3 Stage 70: Fast Ask reliability + atomic Switch to Conversation.
-- Additive over accepted migrations 115-119. Fast Ask remains distinct from Conversation.

alter table public.vh_fast_ask_sessions
  drop constraint if exists vh_fast_ask_sessions_status_check;

alter table public.vh_fast_ask_sessions
  add constraint vh_fast_ask_sessions_status_check
  check (status in ('PENDING','STREAMING','COMPLETED','INCOMPLETE','FAILED','CANCELLED','EXPIRED','CONVERTED'));

alter table public.vh_fast_ask_sessions
  add column if not exists request_id uuid,
  add column if not exists idempotency_key text,
  add column if not exists request_fingerprint text,
  add column if not exists error_code text;

create unique index if not exists vh_fast_ask_owner_idem_uq
  on public.vh_fast_ask_sessions(account_id,idempotency_key)
  where idempotency_key is not null;
create unique index if not exists vh_fast_ask_owner_request_uq
  on public.vh_fast_ask_sessions(account_id,request_id)
  where request_id is not null;

create table if not exists public.vh_fast_ask_stream_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  fast_ask_id uuid not null references public.vh_fast_ask_sessions(id) on delete cascade,
  request_id uuid not null,
  protocol_version integer not null default 1 check (protocol_version=1),
  seq bigint not null check (seq > 0),
  event_type text not null check (event_type in ('message.started','block.started','block.delta','block.completed','tool.started','tool.progress','tool.completed','citation.added','message.completed','message.failed','message.cancelled','heartbeat')),
  block_id text,
  block_type text,
  block_version integer,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(fast_ask_id,seq),
  foreign key(fast_ask_id,account_id) references public.vh_fast_ask_sessions(id,account_id) on delete cascade
);
create index if not exists vh_fast_ask_stream_resume_idx
  on public.vh_fast_ask_stream_events(account_id,fast_ask_id,seq);

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
    if jsonb_typeof(new.response_blocks) <> 'array' or jsonb_array_length(new.response_blocks)=0 then
      raise exception 'fast_ask_final_blocks_required' using errcode='23514';
    end if;
    if new.completed_at is null then raise exception 'fast_ask_completed_at_required' using errcode='23514'; end if;
    if new.error_code is not null then raise exception 'fast_ask_completed_error_invalid' using errcode='23514'; end if;
  elsif jsonb_array_length(new.response_blocks) <> 0 then
    raise exception 'fast_ask_partial_cannot_store_final_blocks' using errcode='23514';
  end if;
  return new;
end $$;

drop trigger if exists vh_fast_ask_terminal_state_guard on public.vh_fast_ask_sessions;
create trigger vh_fast_ask_terminal_state_guard
before update on public.vh_fast_ask_sessions
for each row execute function public.vh_guard_fast_ask_terminal_state();

create or replace function public.vh_begin_fast_ask(
  p_account_id uuid,
  p_idempotency_key text,
  p_prompt text,
  p_attachment_asset_ids uuid[] default '{}'::uuid[]
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_session public.vh_fast_ask_sessions%rowtype;
  v_fast_ask_id uuid := gen_random_uuid();
  v_request_id uuid := gen_random_uuid();
  v_asset_id uuid;
  v_fingerprint text;
  v_asset_fingerprint text;
begin
  if p_idempotency_key is null or char_length(btrim(p_idempotency_key)) not between 1 and 128 then
    raise exception 'idempotency_key_invalid' using errcode='22023';
  end if;
  if p_prompt is null or char_length(btrim(p_prompt)) not between 1 and 20000 then
    raise exception 'fast_ask_prompt_invalid' using errcode='22023';
  end if;
  if coalesce(array_length(p_attachment_asset_ids,1),0) > 5 then
    raise exception 'fast_ask_attachment_count_exceeded' using errcode='22023';
  end if;

  select coalesce(string_agg(x::text,',' order by x::text),'') into v_asset_fingerprint
  from unnest(coalesce(p_attachment_asset_ids,'{}'::uuid[])) as x;
  v_fingerprint := encode(digest(btrim(p_prompt)||E'\n'||v_asset_fingerprint,'sha256'),'hex');

  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text||':fast-ask:'||btrim(p_idempotency_key),0));
  select * into v_session from public.vh_fast_ask_sessions
    where account_id=p_account_id and idempotency_key=btrim(p_idempotency_key)
    limit 1 for update;
  if found then
    if v_session.request_fingerprint is distinct from v_fingerprint then
      raise exception 'fast_ask_idempotency_conflict' using errcode='23514';
    end if;
    return jsonb_build_object(
      'replayed',true,'fastAskId',v_session.id,'requestId',v_session.request_id,
      'status',v_session.status,'expiresAt',v_session.expires_at
    );
  end if;

  insert into public.vh_fast_ask_sessions(
    id,account_id,prompt,status,request_id,idempotency_key,request_fingerprint,
    response_blocks,response_text,expires_at,updated_at
  ) values (
    v_fast_ask_id,p_account_id,btrim(p_prompt),'STREAMING',v_request_id,btrim(p_idempotency_key),v_fingerprint,
    '[]'::jsonb,'',now()+interval '24 hours',now()
  );

  foreach v_asset_id in array coalesce(p_attachment_asset_ids,'{}'::uuid[]) loop
    perform public.vh_add_fast_ask_attachment(p_account_id,v_fast_ask_id,v_asset_id);
  end loop;

  return jsonb_build_object(
    'replayed',false,'fastAskId',v_fast_ask_id,'requestId',v_request_id,
    'status','STREAMING','expiresAt',now()+interval '24 hours'
  );
end $$;

create or replace function public.vh_append_fast_ask_stream_event(
  p_account_id uuid,
  p_fast_ask_id uuid,
  p_request_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_block_id text default null,
  p_block_type text default null,
  p_block_version integer default null
) returns bigint
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_status text; v_request uuid; v_seq bigint; v_expires timestamptz;
begin
  select status,request_id,expires_at into v_status,v_request,v_expires
  from public.vh_fast_ask_sessions
  where id=p_fast_ask_id and account_id=p_account_id for update;
  if not found or v_expires <= now() then raise exception 'fast_ask_not_found' using errcode='P0002'; end if;
  if v_request is distinct from p_request_id then raise exception 'fast_ask_request_mismatch' using errcode='23514'; end if;
  if p_event_type not in ('message.started','block.started','block.delta','block.completed','tool.started','tool.progress','tool.completed','citation.added','message.completed','message.failed','message.cancelled','heartbeat') then
    raise exception 'stream_event_type_invalid' using errcode='22023';
  end if;
  if v_status <> 'STREAMING' and p_event_type <> 'heartbeat' then
    raise exception 'fast_ask_terminal' using errcode='23514';
  end if;
  select coalesce(max(seq),0)+1 into v_seq from public.vh_fast_ask_stream_events where fast_ask_id=p_fast_ask_id;
  insert into public.vh_fast_ask_stream_events(
    account_id,fast_ask_id,request_id,protocol_version,seq,event_type,block_id,block_type,block_version,payload
  ) values (
    p_account_id,p_fast_ask_id,p_request_id,1,v_seq,p_event_type,p_block_id,p_block_type,p_block_version,coalesce(p_payload,'{}'::jsonb)
  );
  return v_seq;
end $$;

create or replace function public.vh_complete_fast_ask(
  p_account_id uuid,
  p_fast_ask_id uuid,
  p_request_id uuid,
  p_response_text text,
  p_response_blocks jsonb,
  p_model_route jsonb default '{}'::jsonb,
  p_provenance jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session public.vh_fast_ask_sessions%rowtype; v_seq bigint;
begin
  if jsonb_typeof(p_response_blocks) <> 'array' or jsonb_array_length(p_response_blocks)=0 then
    raise exception 'fast_ask_final_blocks_required' using errcode='22023';
  end if;
  select * into v_session from public.vh_fast_ask_sessions
    where id=p_fast_ask_id and account_id=p_account_id for update;
  if not found or v_session.expires_at <= now() then raise exception 'fast_ask_not_found' using errcode='P0002'; end if;
  if v_session.request_id is distinct from p_request_id then raise exception 'fast_ask_request_mismatch' using errcode='23514'; end if;
  if v_session.status='COMPLETED' then
    if v_session.response_blocks=p_response_blocks and v_session.response_text=coalesce(p_response_text,'') then
      select max(seq) into v_seq from public.vh_fast_ask_stream_events where fast_ask_id=p_fast_ask_id and event_type='message.completed';
      return jsonb_build_object('fastAskId',p_fast_ask_id,'status','COMPLETED','seq',v_seq,'replayed',true);
    end if;
    raise exception 'fast_ask_terminal_immutable' using errcode='23514';
  end if;
  if v_session.status <> 'STREAMING' then raise exception 'fast_ask_terminal' using errcode='23514'; end if;

  update public.vh_fast_ask_sessions
  set status='COMPLETED',response_text=coalesce(p_response_text,''),response_blocks=p_response_blocks,
      model_route=coalesce(p_model_route,'{}'::jsonb),provenance=coalesce(p_provenance,'{}'::jsonb),
      error_code=null,completed_at=now(),updated_at=now()
  where id=p_fast_ask_id;

  select coalesce(max(seq),0)+1 into v_seq from public.vh_fast_ask_stream_events where fast_ask_id=p_fast_ask_id;
  insert into public.vh_fast_ask_stream_events(account_id,fast_ask_id,request_id,protocol_version,seq,event_type,payload)
  values(p_account_id,p_fast_ask_id,p_request_id,1,v_seq,'message.completed',jsonb_build_object('fastAskId',p_fast_ask_id,'status','COMPLETED'));
  return jsonb_build_object('fastAskId',p_fast_ask_id,'status','COMPLETED','seq',v_seq,'replayed',false);
end $$;

create or replace function public.vh_mark_fast_ask_incomplete(
  p_account_id uuid,p_fast_ask_id uuid,p_request_id uuid,p_code text default 'STREAM_INTERRUPTED'
) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_status text; v_request uuid;
begin
  select status,request_id into v_status,v_request from public.vh_fast_ask_sessions
    where id=p_fast_ask_id and account_id=p_account_id for update;
  if not found then raise exception 'fast_ask_not_found' using errcode='P0002'; end if;
  if v_request is distinct from p_request_id then raise exception 'fast_ask_request_mismatch' using errcode='23514'; end if;
  if v_status='STREAMING' then
    update public.vh_fast_ask_sessions set status='INCOMPLETE',error_code=left(coalesce(p_code,'STREAM_INTERRUPTED'),96),completed_at=now(),updated_at=now() where id=p_fast_ask_id;
    return 'INCOMPLETE';
  end if;
  return v_status;
end $$;

create or replace function public.vh_cancel_fast_ask(p_account_id uuid,p_fast_ask_id uuid)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session public.vh_fast_ask_sessions%rowtype; v_seq bigint;
begin
  select * into v_session from public.vh_fast_ask_sessions
    where id=p_fast_ask_id and account_id=p_account_id for update;
  if not found or v_session.expires_at <= now() then raise exception 'fast_ask_not_found' using errcode='P0002'; end if;
  if v_session.status='CANCELLED' then
    select max(seq) into v_seq from public.vh_fast_ask_stream_events where fast_ask_id=p_fast_ask_id and event_type='message.cancelled';
    return jsonb_build_object('fastAskId',p_fast_ask_id,'status','CANCELLED','seq',v_seq,'replayed',true);
  end if;
  if v_session.status <> 'STREAMING' then raise exception 'fast_ask_terminal' using errcode='23514'; end if;
  update public.vh_fast_ask_sessions set status='CANCELLED',error_code='USER_CANCELLED',completed_at=now(),updated_at=now() where id=p_fast_ask_id;
  select coalesce(max(seq),0)+1 into v_seq from public.vh_fast_ask_stream_events where fast_ask_id=p_fast_ask_id;
  insert into public.vh_fast_ask_stream_events(account_id,fast_ask_id,request_id,protocol_version,seq,event_type,payload)
  values(p_account_id,p_fast_ask_id,v_session.request_id,1,v_seq,'message.cancelled',jsonb_build_object('fastAskId',p_fast_ask_id,'status','CANCELLED'));
  return jsonb_build_object('fastAskId',p_fast_ask_id,'status','CANCELLED','seq',v_seq,'replayed',false);
end $$;

create or replace function public.vh_fail_fast_ask(
  p_account_id uuid,p_fast_ask_id uuid,p_request_id uuid,p_code text
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session public.vh_fast_ask_sessions%rowtype; v_seq bigint; v_code text;
begin
  v_code := left(coalesce(nullif(p_code,''),'STREAM_FAILED'),96);
  select * into v_session from public.vh_fast_ask_sessions
    where id=p_fast_ask_id and account_id=p_account_id for update;
  if not found then raise exception 'fast_ask_not_found' using errcode='P0002'; end if;
  if v_session.request_id is distinct from p_request_id then raise exception 'fast_ask_request_mismatch' using errcode='23514'; end if;
  if v_session.status='FAILED' then
    select max(seq) into v_seq from public.vh_fast_ask_stream_events where fast_ask_id=p_fast_ask_id and event_type='message.failed';
    return jsonb_build_object('fastAskId',p_fast_ask_id,'status','FAILED','seq',v_seq,'replayed',true);
  end if;
  if v_session.status <> 'STREAMING' then raise exception 'fast_ask_terminal' using errcode='23514'; end if;
  update public.vh_fast_ask_sessions set status='FAILED',error_code=v_code,completed_at=now(),updated_at=now() where id=p_fast_ask_id;
  select coalesce(max(seq),0)+1 into v_seq from public.vh_fast_ask_stream_events where fast_ask_id=p_fast_ask_id;
  insert into public.vh_fast_ask_stream_events(account_id,fast_ask_id,request_id,protocol_version,seq,event_type,payload)
  values(p_account_id,p_fast_ask_id,p_request_id,1,v_seq,'message.failed',jsonb_build_object('fastAskId',p_fast_ask_id,'status','FAILED','code',v_code));
  return jsonb_build_object('fastAskId',p_fast_ask_id,'status','FAILED','seq',v_seq,'replayed',false);
end $$;

create or replace function public.vh_expire_fast_ask_session(p_account_id uuid,p_fast_ask_id uuid,p_now timestamptz default now())
returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_status text;
begin
  select status into v_status from public.vh_fast_ask_sessions
  where id=p_fast_ask_id and account_id=p_account_id for update;
  if not found then return false; end if;
  if v_status='CONVERTED' then return false; end if;
  update public.vh_fast_ask_sessions
  set status='EXPIRED',error_code=coalesce(error_code,'SESSION_EXPIRED'),completed_at=coalesce(completed_at,p_now),updated_at=p_now
  where id=p_fast_ask_id and account_id=p_account_id and expires_at <= p_now;
  return found;
end $$;

create or replace function public.vh_cleanup_expired_fast_asks(p_before timestamptz default now())
returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer;
begin
  delete from public.vh_fast_ask_sessions
  where status='EXPIRED' and updated_at <= p_before;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.vh_convert_fast_ask_to_conversation(
  p_account_id uuid,p_fast_ask_id uuid,p_auto_title text
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_session public.vh_fast_ask_sessions%rowtype;
  v_conversation_id uuid;
  v_user_message_id uuid := gen_random_uuid();
  v_assistant_message_id uuid := gen_random_uuid();
  v_title text;
  v_existing_user_message_id uuid;
  v_existing_assistant_message_id uuid;
  v_attachment record;
begin
  v_title := regexp_replace(btrim(coalesce(p_auto_title,'')), '\s+', ' ', 'g');
  if char_length(v_title) not between 1 and 200 then raise exception 'conversation_title_invalid' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text||':fast-ask-convert:'||p_fast_ask_id::text,0));
  select * into v_session from public.vh_fast_ask_sessions
  where id=p_fast_ask_id and account_id=p_account_id for update;
  if not found then raise exception 'fast_ask_not_found' using errcode='P0002'; end if;

  if v_session.status='CONVERTED' then
    if v_session.converted_conversation_id is null then raise exception 'fast_ask_conversion_corrupt' using errcode='23514'; end if;
    select title into v_title from public.vh_conversations
    where id=v_session.converted_conversation_id and account_id=p_account_id;
    select id into v_existing_user_message_id from public.vh_conversation_messages
    where conversation_id=v_session.converted_conversation_id and account_id=p_account_id
      and idempotency_key='fast-ask:'||p_fast_ask_id::text||':user';
    select id into v_existing_assistant_message_id from public.vh_conversation_messages
    where conversation_id=v_session.converted_conversation_id and account_id=p_account_id
      and idempotency_key='fast-ask:'||p_fast_ask_id::text||':assistant';
    if v_title is null or v_existing_user_message_id is null or v_existing_assistant_message_id is null then
      raise exception 'fast_ask_conversion_corrupt' using errcode='23514';
    end if;
    return jsonb_build_object(
      'fastAskId',p_fast_ask_id,'conversationId',v_session.converted_conversation_id,
      'userMessageId',v_existing_user_message_id,'assistantMessageId',v_existing_assistant_message_id,
      'title',v_title,'titleSource','AUTO','replayed',true
    );
  end if;
  if v_session.expires_at <= now() then raise exception 'fast_ask_expired' using errcode='23514'; end if;
  if v_session.status <> 'COMPLETED' then raise exception 'fast_ask_not_convertible' using errcode='23514'; end if;
  if jsonb_array_length(v_session.response_blocks)=0 then raise exception 'fast_ask_not_convertible' using errcode='23514'; end if;

  insert into public.vh_conversations(
    account_id,title,title_source,project_id,permanent_reference_asset_id,permanent_reference_set_at,
    pinned,pin_order,archived_at,revision,last_message_at
  ) values (
    p_account_id,v_title,'AUTO',null,null,null,false,null,null,1,now()
  ) returning id into v_conversation_id;

  insert into public.vh_conversation_messages(
    id,account_id,conversation_id,role,status,request_id,idempotency_key,plain_text,content_blocks,provenance,completed_at,updated_at
  ) values (
    v_user_message_id,p_account_id,v_conversation_id,'USER','COMPLETED',v_session.request_id,'fast-ask:'||p_fast_ask_id::text||':user',
    v_session.prompt,'[]'::jsonb,jsonb_build_object('origin','fast_ask','fastAskId',p_fast_ask_id),now(),now()
  );

  insert into public.vh_conversation_messages(
    id,account_id,conversation_id,role,status,request_id,idempotency_key,plain_text,content_blocks,model_route,provenance,completed_at,updated_at
  ) values (
    v_assistant_message_id,p_account_id,v_conversation_id,'ASSISTANT','COMPLETED',v_session.request_id,'fast-ask:'||p_fast_ask_id::text||':assistant',
    v_session.response_text,v_session.response_blocks,v_session.model_route,
    v_session.provenance||jsonb_build_object('origin','fast_ask','fastAskId',p_fast_ask_id),now(),now()
  );

  for v_attachment in
    select asset_id,source_size_bytes from public.vh_fast_ask_attachments
    where account_id=p_account_id and fast_ask_id=p_fast_ask_id order by created_at,id
  loop
    insert into public.vh_message_attachments(account_id,message_id,asset_id,source_size_bytes)
    values(p_account_id,v_user_message_id,v_attachment.asset_id,v_attachment.source_size_bytes)
    on conflict(message_id,asset_id) do nothing;
  end loop;

  update public.vh_fast_ask_sessions
  set status='CONVERTED',converted_conversation_id=v_conversation_id,updated_at=now()
  where id=p_fast_ask_id and account_id=p_account_id;

  return jsonb_build_object(
    'fastAskId',p_fast_ask_id,'conversationId',v_conversation_id,
    'userMessageId',v_user_message_id,'assistantMessageId',v_assistant_message_id,
    'title',v_title,'titleSource','AUTO','replayed',false
  );
end $$;

alter table public.vh_fast_ask_stream_events enable row level security;
revoke all on table public.vh_fast_ask_stream_events from public,anon,authenticated;
grant select,insert,update,delete on table public.vh_fast_ask_stream_events to service_role;

revoke all on function public.vh_guard_fast_ask_terminal_state() from public,anon,authenticated;
revoke all on function public.vh_begin_fast_ask(uuid,text,text,uuid[]) from public,anon,authenticated;
revoke all on function public.vh_append_fast_ask_stream_event(uuid,uuid,uuid,text,jsonb,text,text,integer) from public,anon,authenticated;
revoke all on function public.vh_complete_fast_ask(uuid,uuid,uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.vh_mark_fast_ask_incomplete(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.vh_cancel_fast_ask(uuid,uuid) from public,anon,authenticated;
revoke all on function public.vh_fail_fast_ask(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.vh_expire_fast_ask_session(uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.vh_cleanup_expired_fast_asks(timestamptz) from public,anon,authenticated;
revoke all on function public.vh_convert_fast_ask_to_conversation(uuid,uuid,text) from public,anon,authenticated;

grant execute on function public.vh_begin_fast_ask(uuid,text,text,uuid[]) to service_role;
grant execute on function public.vh_append_fast_ask_stream_event(uuid,uuid,uuid,text,jsonb,text,text,integer) to service_role;
grant execute on function public.vh_complete_fast_ask(uuid,uuid,uuid,text,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.vh_mark_fast_ask_incomplete(uuid,uuid,uuid,text) to service_role;
grant execute on function public.vh_cancel_fast_ask(uuid,uuid) to service_role;
grant execute on function public.vh_fail_fast_ask(uuid,uuid,uuid,text) to service_role;
grant execute on function public.vh_expire_fast_ask_session(uuid,uuid,timestamptz) to service_role;
grant execute on function public.vh_cleanup_expired_fast_asks(timestamptz) to service_role;
grant execute on function public.vh_convert_fast_ask_to_conversation(uuid,uuid,text) to service_role;
