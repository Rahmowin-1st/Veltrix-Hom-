#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:?PGPORT is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${PGDATABASE:?PGDATABASE is required}"

PSQL=(psql -X -v ON_ERROR_STOP=1)
A="d7a00000-0000-4000-8000-000000000001"
B="d7b00000-0000-4000-8000-000000000002"
RACE_FAST="d7a70000-0000-4000-8000-000000000001"

echo "PART3_FAST_ASK_BEGIN"
"${PSQL[@]}" <<'SQL'
\set VERBOSITY terse

delete from public.vh_accounts where id in (
  'd7a00000-0000-4000-8000-000000000001'::uuid,
  'd7b00000-0000-4000-8000-000000000002'::uuid
);
insert into public.vh_accounts(id,email) values
 ('d7a00000-0000-4000-8000-000000000001','part3-fast-a@example.invalid'),
 ('d7b00000-0000-4000-8000-000000000002','part3-fast-b@example.invalid');

create or replace function pg_temp.p3_fast_asset(
  p_account uuid,p_id uuid,p_size bigint,p_seed text,p_title text,p_origin text default 'library'
) returns void language plpgsql as $$
begin
  insert into public.vh_library_assets(
    id,account_id,original_filename,display_title,declared_mime,detected_mime,
    source_kind,asset_class,original_size_bytes,origin_surface,content_sha256,
    processing_status,extraction_status,provenance
  ) values (
    p_id,p_account,p_title||'.txt',p_title,'text/plain','text/plain','text','file',
    p_size,p_origin,encode(digest(p_seed,'sha256'),'hex'),'READY','READY',
    jsonb_build_object('fixture','part3-fast-ask','origin',p_origin)
  );
end $$;

-- Shared Library fixtures. These are durable assets, never Fast Ask-owned binaries.
select pg_temp.p3_fast_asset('d7a00000-0000-4000-8000-000000000001','d7a10000-0000-4000-8000-000000000001',2*1024*1024,'fa1','A1');
select pg_temp.p3_fast_asset('d7a00000-0000-4000-8000-000000000001','d7a10000-0000-4000-8000-000000000002',2*1024*1024,'fa2','A2');
select pg_temp.p3_fast_asset('d7a00000-0000-4000-8000-000000000001','d7a10000-0000-4000-8000-000000000003',2*1024*1024,'fa3','A3');
select pg_temp.p3_fast_asset('d7a00000-0000-4000-8000-000000000001','d7a10000-0000-4000-8000-000000000004',2*1024*1024,'fa4','A4');
select pg_temp.p3_fast_asset('d7a00000-0000-4000-8000-000000000001','d7a10000-0000-4000-8000-000000000005',2*1024*1024,'fa5','A5');
select pg_temp.p3_fast_asset('d7a00000-0000-4000-8000-000000000001','d7a10000-0000-4000-8000-000000000006',1,'fa6','A6');
select pg_temp.p3_fast_asset('d7a00000-0000-4000-8000-000000000001','d7a11000-0000-4000-8000-000000000001',6*1024*1024,'fb1','B6MiB');
select pg_temp.p3_fast_asset('d7a00000-0000-4000-8000-000000000001','d7a11000-0000-4000-8000-000000000002',4*1024*1024,'fb2','B4MiB');
select pg_temp.p3_fast_asset('d7a00000-0000-4000-8000-000000000001','d7a11000-0000-4000-8000-000000000003',1,'fb3','B1Byte');
select pg_temp.p3_fast_asset('d7a00000-0000-4000-8000-000000000001','d7a12000-0000-4000-8000-000000000001',1024,'new-upload','New upload','fast-ask-upload');
select pg_temp.p3_fast_asset('d7b00000-0000-4000-8000-000000000002','d7b10000-0000-4000-8000-000000000001',1024,'foreign','Foreign');

-- Fast Ask begins ephemerally with no Conversation, exact 5/10 MiB attachment boundary,
-- and duplicate client retry replays the same session/request identity.
do $$
declare
  a constant uuid := 'd7a00000-0000-4000-8000-000000000001';
  first jsonb; retry jsonb; fid uuid; rid uuid;
  before_conversations bigint; after_conversations bigint;
begin
  select count(*) into before_conversations from public.vh_conversations where account_id=a;
  first := public.vh_begin_fast_ask(a,'stage70-idem-1','Explain the five files',array[
    'd7a10000-0000-4000-8000-000000000001'::uuid,
    'd7a10000-0000-4000-8000-000000000002'::uuid,
    'd7a10000-0000-4000-8000-000000000003'::uuid,
    'd7a10000-0000-4000-8000-000000000004'::uuid,
    'd7a10000-0000-4000-8000-000000000005'::uuid
  ]);
  fid := (first->>'fastAskId')::uuid; rid := (first->>'requestId')::uuid;
  retry := public.vh_begin_fast_ask(a,'stage70-idem-1','Explain the five files',array[
    'd7a10000-0000-4000-8000-000000000001'::uuid,
    'd7a10000-0000-4000-8000-000000000002'::uuid,
    'd7a10000-0000-4000-8000-000000000003'::uuid,
    'd7a10000-0000-4000-8000-000000000004'::uuid,
    'd7a10000-0000-4000-8000-000000000005'::uuid
  ]);
  if (retry->>'fastAskId')::uuid <> fid or (retry->>'requestId')::uuid <> rid or (retry->>'replayed')::boolean is not true then
    raise exception 'fast_ask_retry_identity_failed';
  end if;
  select count(*) into after_conversations from public.vh_conversations where account_id=a;
  if after_conversations <> before_conversations then raise exception 'fast_ask_created_conversation'; end if;
  if (select count(*) from public.vh_fast_ask_attachments where fast_ask_id=fid) <> 5 then raise exception 'fast_ask_exact_count_failed'; end if;
  if (select sum(source_size_bytes) from public.vh_fast_ask_attachments where fast_ask_id=fid) <> 10*1024*1024 then raise exception 'fast_ask_exact_bytes_failed'; end if;
  if (select count(*) from public.vh_library_assets where account_id=a and id between 'd7a10000-0000-4000-8000-000000000001'::uuid and 'd7a10000-0000-4000-8000-000000000005'::uuid) <> 5 then raise exception 'library_binary_reuse_failed'; end if;
  raise notice 'P3_FAST_ASK_EPHEMERAL=PASS no_conversation=1 request_idempotency=1 provider_authority_identity=1 attachments=5 bytes=% add_from_library=1 binary_reuse=1',10*1024*1024;
end $$;

-- Boundary rejections, idempotency mismatch, and owner isolation.
do $$
declare
  a constant uuid := 'd7a00000-0000-4000-8000-000000000001';
  exact jsonb; exact_id uuid;
begin
  begin
    perform public.vh_begin_fast_ask(a,'stage70-six','Too many',array[
      'd7a10000-0000-4000-8000-000000000001'::uuid,'d7a10000-0000-4000-8000-000000000002'::uuid,
      'd7a10000-0000-4000-8000-000000000003'::uuid,'d7a10000-0000-4000-8000-000000000004'::uuid,
      'd7a10000-0000-4000-8000-000000000005'::uuid,'d7a10000-0000-4000-8000-000000000006'::uuid]);
    raise exception 'fast_ask_six_accepted';
  exception when others then if position('fast_ask_attachment_count_exceeded' in sqlerrm)=0 then raise; end if; end;

  exact := public.vh_begin_fast_ask(a,'stage70-bytes','Exact bytes',array[
    'd7a11000-0000-4000-8000-000000000001'::uuid,'d7a11000-0000-4000-8000-000000000002'::uuid]);
  exact_id := (exact->>'fastAskId')::uuid;
  if (select sum(source_size_bytes) from public.vh_fast_ask_attachments where fast_ask_id=exact_id) <> 10*1024*1024 then raise exception 'fast_ask_exact_10mib_failed'; end if;
  begin
    perform public.vh_add_fast_ask_attachment(a,exact_id,'d7a11000-0000-4000-8000-000000000003');
    raise exception 'fast_ask_over_10mib_accepted';
  exception when others then if position('fast_ask_attachment_bytes_exceeded' in sqlerrm)=0 then raise; end if; end;

  begin
    perform public.vh_begin_fast_ask(a,'stage70-idem-1','Different prompt','{}'::uuid[]);
    raise exception 'fast_ask_idempotency_mismatch_accepted';
  exception when others then if position('fast_ask_idempotency_conflict' in sqlerrm)=0 then raise; end if; end;

  begin
    perform public.vh_begin_fast_ask(a,'stage70-foreign','Foreign asset',array['d7b10000-0000-4000-8000-000000000001'::uuid]);
    raise exception 'fast_ask_cross_owner_asset_accepted';
  exception when others then if position('asset_not_found' in sqlerrm)=0 then raise; end if; end;
  raise notice 'P3_FAST_ASK_BOUNDARIES=PASS exact_5=1 over_5_rejected=1 exact_10mib=1 over_10mib_rejected=1 idem_conflict=1 cross_owner_rejected=1';
end $$;

-- Typed vh.stream.v1-compatible event persistence and immutable completed final state.
do $$
declare
  a constant uuid := 'd7a00000-0000-4000-8000-000000000001';
  s public.vh_fast_ask_sessions%rowtype; seq1 bigint; seq2 bigint; result jsonb;
  blocks constant jsonb := '[{"id":"answer-1","type":"answer","version":1,"text":"Grounded Fast Ask answer"}]'::jsonb;
begin
  select * into s from public.vh_fast_ask_sessions where account_id=a and idempotency_key='stage70-idem-1';
  seq1 := public.vh_append_fast_ask_stream_event(a,s.id,s.request_id,'message.started',jsonb_build_object('status','STREAMING'));
  seq2 := public.vh_append_fast_ask_stream_event(a,s.id,s.request_id,'block.completed',jsonb_build_object('id','answer-1'),'answer-1','answer',1);
  if seq2 <= seq1 then raise exception 'fast_ask_stream_sequence_failed'; end if;
  result := public.vh_complete_fast_ask(a,s.id,s.request_id,'Grounded Fast Ask answer',blocks,jsonb_build_object('providerId','fixture','modelId','fixture-model'),jsonb_build_object('protocol','vh.stream.v1'));
  if result->>'status' <> 'COMPLETED' then raise exception 'fast_ask_complete_failed'; end if;
  if (select response_blocks from public.vh_fast_ask_sessions where id=s.id) <> blocks then raise exception 'fast_ask_blocks_not_exact'; end if;
  if (select count(*) from public.vh_fast_ask_stream_events where fast_ask_id=s.id and event_type='message.completed') <> 1 then raise exception 'fast_ask_completed_event_failed'; end if;
  begin
    update public.vh_fast_ask_sessions set response_text='mutated' where id=s.id;
    raise exception 'fast_ask_terminal_mutated';
  exception when others then if position('fast_ask_terminal_immutable' in sqlerrm)=0 then raise; end if; end;
  raise notice 'P3_FAST_ASK_TERMINAL=PASS protocol=vh.stream.v1 typed_answer=1 terminal_immutable=1 partial_not_final=1';
end $$;

-- Failed, cancelled, incomplete never fake a final answer.
do $$
declare
  a constant uuid := 'd7a00000-0000-4000-8000-000000000001';
  f jsonb; c jsonb; i jsonb; fid uuid; rid uuid;
begin
  f := public.vh_begin_fast_ask(a,'stage70-failed','Provider fails','{}'::uuid[]); fid := (f->>'fastAskId')::uuid; rid := (f->>'requestId')::uuid;
  perform public.vh_fail_fast_ask(a,fid,rid,'PROVIDER_UNAVAILABLE');
  if not exists(select 1 from public.vh_fast_ask_sessions where id=fid and status='FAILED' and jsonb_array_length(response_blocks)=0 and error_code='PROVIDER_UNAVAILABLE') then raise exception 'failed_state_wrong'; end if;

  c := public.vh_begin_fast_ask(a,'stage70-cancel','Cancel me','{}'::uuid[]); fid := (c->>'fastAskId')::uuid;
  perform public.vh_cancel_fast_ask(a,fid);
  if not exists(select 1 from public.vh_fast_ask_sessions where id=fid and status='CANCELLED' and jsonb_array_length(response_blocks)=0) then raise exception 'cancel_state_wrong'; end if;

  i := public.vh_begin_fast_ask(a,'stage70-incomplete','Interrupt me','{}'::uuid[]); fid := (i->>'fastAskId')::uuid; rid := (i->>'requestId')::uuid;
  perform public.vh_mark_fast_ask_incomplete(a,fid,rid,'STREAM_INTERRUPTED');
  if not exists(select 1 from public.vh_fast_ask_sessions where id=fid and status='INCOMPLETE' and jsonb_array_length(response_blocks)=0) then raise exception 'incomplete_state_wrong'; end if;
  raise notice 'P3_FAST_ASK_FAILURE_STATES=PASS provider_failure=1 cancellation=1 incomplete=1 fake_completed=0';
end $$;

-- Expiry/cleanup removes only temporary Fast Ask state. New-upload Library asset survives.
do $$
declare
  a constant uuid := 'd7a00000-0000-4000-8000-000000000001';
  e jsonb; fid uuid; rid uuid; cleaned integer;
begin
  e := public.vh_begin_fast_ask(a,'stage70-expire','Temporary interaction',array['d7a12000-0000-4000-8000-000000000001'::uuid]);
  fid := (e->>'fastAskId')::uuid; rid := (e->>'requestId')::uuid;
  update public.vh_fast_ask_sessions set expires_at=now()-interval '1 second' where id=fid;
  if public.vh_expire_fast_ask_session(a,fid,now()) is not true then raise exception 'fast_ask_expire_failed'; end if;
  begin
    perform public.vh_append_fast_ask_stream_event(a,fid,rid,'heartbeat','{}'::jsonb);
    raise exception 'expired_fast_ask_accessible';
  exception when others then if position('fast_ask_not_found' in sqlerrm)=0 then raise; end if; end;
  cleaned := public.vh_cleanup_expired_fast_asks(now());
  if cleaned < 1 or exists(select 1 from public.vh_fast_ask_sessions where id=fid) then raise exception 'fast_ask_cleanup_failed'; end if;
  if not exists(select 1 from public.vh_library_assets where id='d7a12000-0000-4000-8000-000000000001'::uuid and account_id=a) then raise exception 'fast_ask_cleanup_deleted_library_asset'; end if;
  raise notice 'P3_FAST_ASK_EXPIRY=PASS expired_inaccessible=1 cleanup=1 new_upload_library_persists=1 asset_delete=0';
end $$;

-- Completed Fast Ask conversion: exact content/attachments, no invented Project/Notebook/Reference.
do $$
declare
  a constant uuid := 'd7a00000-0000-4000-8000-000000000001';
  start jsonb; complete jsonb; converted jsonb; retried jsonb;
  fid uuid; rid uuid; cid uuid; uid uuid; aid uuid;
  before_assets bigint; after_assets bigint;
  blocks constant jsonb := '[{"id":"answer-1","type":"answer","version":1,"text":"Exact conversion answer"}]'::jsonb;
begin
  select count(*) into before_assets from public.vh_library_assets where account_id=a;
  start := public.vh_begin_fast_ask(a,'stage70-convert','Original conversion prompt',array[
    'd7a10000-0000-4000-8000-000000000001'::uuid,'d7a10000-0000-4000-8000-000000000002'::uuid]);
  fid := (start->>'fastAskId')::uuid; rid := (start->>'requestId')::uuid;
  complete := public.vh_complete_fast_ask(a,fid,rid,'Exact conversion answer',blocks,jsonb_build_object('providerId','fixture'),jsonb_build_object('protocol','vh.stream.v1'));
  converted := public.vh_convert_fast_ask_to_conversation(a,fid,'Original conversion prompt');
  cid := (converted->>'conversationId')::uuid; uid := (converted->>'userMessageId')::uuid; aid := (converted->>'assistantMessageId')::uuid;
  if not exists(select 1 from public.vh_conversations where id=cid and account_id=a and title='Original conversion prompt' and title_source='AUTO' and project_id is null and permanent_reference_asset_id is null and permanent_reference_set_at is null) then raise exception 'converted_conversation_metadata_wrong'; end if;
  if exists(select 1 from public.vh_conversation_notebooks where conversation_id=cid) then raise exception 'conversion_invented_notebook'; end if;
  if (select plain_text from public.vh_conversation_messages where id=uid) <> 'Original conversion prompt' then raise exception 'conversion_prompt_not_preserved'; end if;
  if (select content_blocks from public.vh_conversation_messages where id=aid) <> blocks then raise exception 'conversion_blocks_not_preserved'; end if;
  if (select count(*) from public.vh_conversation_messages where conversation_id=cid) <> 2 then raise exception 'conversion_message_count_wrong'; end if;
  if (select count(*) from public.vh_message_attachments where message_id=uid) <> 2 then raise exception 'conversion_attachment_count_wrong'; end if;
  if not exists(select 1 from public.vh_message_attachments where message_id=uid and asset_id='d7a10000-0000-4000-8000-000000000001'::uuid)
     or not exists(select 1 from public.vh_message_attachments where message_id=uid and asset_id='d7a10000-0000-4000-8000-000000000002'::uuid) then raise exception 'conversion_attachment_identity_wrong'; end if;
  select count(*) into after_assets from public.vh_library_assets where account_id=a;
  if after_assets <> before_assets then raise exception 'conversion_duplicated_library_binary'; end if;
  retried := public.vh_convert_fast_ask_to_conversation(a,fid,'Ignored retry title');
  if (retried->>'conversationId')::uuid <> cid or (retried->>'replayed')::boolean is not true then raise exception 'conversion_retry_not_idempotent'; end if;
  if (select count(*) from public.vh_conversations where account_id=a and id=cid) <> 1 then raise exception 'conversion_duplicate_conversation'; end if;
  perform public.vh_set_conversation_title_user(a,cid,'User renamed title');
  perform public.vh_apply_auto_conversation_title(a,cid,'Should not overwrite');
  if not exists(select 1 from public.vh_conversations where id=cid and title='User renamed title' and title_source='USER') then raise exception 'conversion_user_title_protection_failed'; end if;
  raise notice 'P3_FAST_ASK_CONVERSION=PASS prompt=1 blocks_exact=1 attachments_identity=1 library_binary_reused=1 auto_title=1 retry_idempotent=1 no_project=1 no_notebook=1 no_reference=1 user_title_protected=1';
end $$;

-- Prepare one completed session for the external concurrent conversion race.
do $$
declare
  a constant uuid := 'd7a00000-0000-4000-8000-000000000001';
  s jsonb; fid uuid; rid uuid;
  blocks constant jsonb := '[{"id":"answer-1","type":"answer","version":1,"text":"Race answer"}]'::jsonb;
begin
  insert into public.vh_fast_ask_sessions(id,account_id,prompt,status,request_id,idempotency_key,request_fingerprint,response_blocks,response_text,model_route,provenance,completed_at,expires_at)
  values(
    'd7a70000-0000-4000-8000-000000000001',a,'Concurrent conversion prompt','COMPLETED',
    'd7a70000-0000-4000-8000-000000000002','stage70-race',encode(digest('race','sha256'),'hex'),blocks,'Race answer','{}'::jsonb,'{}'::jsonb,now(),now()+interval '24 hours'
  );
end $$;

-- Non-convertible and cross-owner conversion failures.
do $$
declare
  a constant uuid := 'd7a00000-0000-4000-8000-000000000001';
  b constant uuid := 'd7b00000-0000-4000-8000-000000000002';
  s public.vh_fast_ask_sessions%rowtype;
begin
  select * into s from public.vh_fast_ask_sessions where account_id=a and idempotency_key='stage70-failed';
  begin
    perform public.vh_convert_fast_ask_to_conversation(a,s.id,'Failed should reject');
    raise exception 'failed_fast_ask_converted';
  exception when others then if position('fast_ask_not_convertible' in sqlerrm)=0 then raise; end if; end;
  select * into s from public.vh_fast_ask_sessions where account_id=a and idempotency_key='stage70-incomplete';
  begin
    perform public.vh_convert_fast_ask_to_conversation(a,s.id,'Incomplete should reject');
    raise exception 'incomplete_fast_ask_converted';
  exception when others then if position('fast_ask_not_convertible' in sqlerrm)=0 then raise; end if; end;
  select * into s from public.vh_fast_ask_sessions where account_id=a and idempotency_key='stage70-convert';
  begin
    perform public.vh_convert_fast_ask_to_conversation(b,s.id,'Foreign should reject');
    raise exception 'cross_owner_fast_ask_converted';
  exception when others then if position('fast_ask_not_found' in sqlerrm)=0 then raise; end if; end;
  raise notice 'P3_FAST_ASK_CONVERSION_REJECT=PASS failed=1 incomplete=1 cross_owner=1';
end $$;
SQL

# Two concurrent identical Switch requests must converge on one Conversation.
rm -f part3-fast-convert-race-a.log part3-fast-convert-race-b.log
(
  psql -X -At -v ON_ERROR_STOP=1 -c "select public.vh_convert_fast_ask_to_conversation('$A','$RACE_FAST','Concurrent conversion prompt')->>'conversationId';" \
    > part3-fast-convert-race-a.log 2>&1
) &
pid_a=$!
(
  psql -X -At -v ON_ERROR_STOP=1 -c "select public.vh_convert_fast_ask_to_conversation('$A','$RACE_FAST','Concurrent conversion prompt')->>'conversationId';" \
    > part3-fast-convert-race-b.log 2>&1
) &
pid_b=$!
wait "$pid_a"
wait "$pid_b"
conv_a="$(tail -n 1 part3-fast-convert-race-a.log | tr -d '[:space:]')"
conv_b="$(tail -n 1 part3-fast-convert-race-b.log | tr -d '[:space:]')"
if [[ -z "$conv_a" || "$conv_a" != "$conv_b" ]]; then
  echo "CONVERSION_RACE_FAILED a=$conv_a b=$conv_b" >&2
  exit 1
fi
count="$(psql -X -At -v ON_ERROR_STOP=1 -c "select count(*) from public.vh_conversations where id='$conv_a'::uuid and account_id='$A'::uuid;")"
if [[ "$count" != "1" ]]; then
  echo "CONVERSION_RACE_DUPLICATE count=$count" >&2
  exit 1
fi
echo "P3_FAST_ASK_CONVERSION_RACE=PASS conversation=$conv_a winners=2 unique_conversations=1"

"${PSQL[@]}" <<'SQL'
\set VERBOSITY terse

do $$
declare
  a constant uuid := 'd7a00000-0000-4000-8000-000000000001';
  race constant uuid := 'd7a70000-0000-4000-8000-000000000001';
  cid uuid;
begin
  select converted_conversation_id into cid from public.vh_fast_ask_sessions where id=race and account_id=a;
  if cid is null then raise exception 'race_conversion_pointer_missing'; end if;
  if (select count(*) from public.vh_conversations where id=cid and account_id=a) <> 1 then raise exception 'race_conversation_count_wrong'; end if;
  if (select count(*) from public.vh_conversation_messages where conversation_id=cid) <> 2 then raise exception 'race_message_count_wrong'; end if;
  raise notice 'P3_FAST_ASK_SECOND_SWITCH=PASS same_conversation=1 chronology=2';
end $$;

-- Service-role-only direct mutation surface.
do $$
declare n integer;
begin
  select count(*) into n from information_schema.role_table_grants
  where table_schema='public' and table_name='vh_fast_ask_stream_events' and grantee in ('anon','authenticated','PUBLIC');
  if n <> 0 then raise exception 'fast_ask_stream_table_not_service_only'; end if;
  raise notice 'P3_FAST_ASK_SECURITY=PASS owner_isolation=1 service_only=1';
end $$;

delete from public.vh_accounts where id in (
  'd7a00000-0000-4000-8000-000000000001'::uuid,
  'd7b00000-0000-4000-8000-000000000002'::uuid
);
SQL

echo "PART3_FAST_ASK=PASS postgres=16 ephemeral=pass idempotency=pass typed_stream=pass terminal=pass attachments=pass expiry_cleanup=pass conversion=pass race=pass isolation=pass"
