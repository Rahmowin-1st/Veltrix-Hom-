#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:?PGPORT is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${PGDATABASE:?PGDATABASE is required}"
PSQL=(psql -X -v ON_ERROR_STOP=1)

A='d3a00000-0000-4000-8000-000000000001'
B='d3b00000-0000-4000-8000-000000000002'
CA='d3a10000-0000-4000-8000-000000000001'
CB='d3b10000-0000-4000-8000-000000000002'

echo "PART3_STREAM_BEGIN"
"${PSQL[@]}" <<SQL
delete from public.vh_accounts where id in ('$A'::uuid,'$B'::uuid);
insert into public.vh_accounts(id,email) values
 ('$A','part3-stream-a@example.invalid'),
 ('$B','part3-stream-b@example.invalid');
insert into public.vh_conversations(id,account_id,title) values
 ('$CA','$A','Stream A'),
 ('$CB','$B','Stream B');
SQL

# Two separate PostgreSQL sessions submit the exact same turn concurrently.
set +e
"${PSQL[@]}" -Atc "select public.vh_begin_conversation_turn('$A','$CA','race-key','same prompt'); select pg_sleep(1);" > part3-stream-race-a.log 2>&1 &
pid_a=$!
"${PSQL[@]}" -Atc "select public.vh_begin_conversation_turn('$A','$CA','race-key','same prompt'); select pg_sleep(1);" > part3-stream-race-b.log 2>&1 &
pid_b=$!
wait "$pid_a"; code_a=$?
wait "$pid_b"; code_b=$?
set -e
if [[ "$code_a" -ne 0 || "$code_b" -ne 0 ]]; then
  cat part3-stream-race-a.log part3-stream-race-b.log
  echo "PART3_STREAM_IDEMPOTENCY_RACE=FAIL code_a=$code_a code_b=$code_b"
  exit 1
fi

"${PSQL[@]}" <<'SQL'
do $$
declare
  a constant uuid := 'd3a00000-0000-4000-8000-000000000001';
  c constant uuid := 'd3a10000-0000-4000-8000-000000000001';
  u integer;
  s integer;
  requests integer;
begin
  select count(*) filter(where role='USER'),count(*) filter(where role='ASSISTANT'),count(distinct request_id)
    into u,s,requests
  from public.vh_conversation_messages
  where account_id=a and conversation_id=c and idempotency_key='race-key';
  if u<>1 or s<>1 or requests<>1 then raise exception 'stream_idempotency_race_failed u=% s=% requests=%',u,s,requests; end if;
  raise notice 'P3_STREAM_IDEMPOTENCY_RACE=PASS user=1 assistant=1 request_ids=1';
end $$;

-- Complete one typed stream and prove reconnect/replay semantics.
do $$
declare
  a constant uuid := 'd3a00000-0000-4000-8000-000000000001';
  c constant uuid := 'd3a10000-0000-4000-8000-000000000001';
  turn jsonb;
  replay jsonb;
  m uuid;
  r uuid;
  s1 bigint; s2 bigint; s3 bigint; s4 bigint;
  done jsonb;
  after_two integer;
  block_count integer;
  final_text text;
begin
  turn := public.vh_begin_conversation_turn(a,c,'complete-key','Explain gravity.');
  m := (turn->>'assistantMessageId')::uuid;
  r := (turn->>'requestId')::uuid;
  s1 := public.vh_append_conversation_stream_event(a,m,r,'message.started','{"status":"STREAMING"}'::jsonb);
  s2 := public.vh_append_conversation_stream_event(a,m,r,'block.started','{"id":"answer-1","type":"answer","version":1}'::jsonb,'answer-1','answer',1);
  s3 := public.vh_append_conversation_stream_event(a,m,r,'block.delta','{"path":["text"],"delta":"Gravity "}'::jsonb,'answer-1','answer',1);
  s4 := public.vh_append_conversation_stream_event(a,m,r,'block.completed','{"characters":8}'::jsonb,'answer-1','answer',1);
  if array[s1,s2,s3,s4] <> array[1::bigint,2::bigint,3::bigint,4::bigint] then raise exception 'stream_sequence_wrong'; end if;
  done := public.vh_complete_conversation_message(
    a,m,r,'Gravity pulls masses together.',
    '[{"id":"answer-1","type":"answer","version":1,"text":"Gravity pulls masses together."}]'::jsonb,
    '{"providerId":"fixture","modelId":"fixture-fast","taskClass":"fast"}'::jsonb,
    '{"outputCharacters":31}'::jsonb,
    '{"protocol":"vh.stream.v1"}'::jsonb
  );
  if (done->>'seq')::bigint <> 5 then raise exception 'stream_completion_sequence_wrong'; end if;
  select plain_text,jsonb_array_length(content_blocks) into final_text,block_count from public.vh_conversation_messages where id=m;
  if final_text <> 'Gravity pulls masses together.' or block_count<>1 then raise exception 'stream_final_message_wrong'; end if;
  select count(*) into after_two from public.vh_stream_events where message_id=m and seq>2;
  if after_two<>3 then raise exception 'stream_resume_after_seq_wrong:%',after_two; end if;
  replay := public.vh_begin_conversation_turn(a,c,'complete-key','Explain gravity.');
  if coalesce((replay->>'replayed')::boolean,false) is not true
     or (replay->>'assistantMessageId')::uuid <> m
     or replay->>'assistantStatus' <> 'COMPLETED' then raise exception 'stream_completed_replay_wrong'; end if;
  begin
    update public.vh_conversation_messages set plain_text='mutated' where id=m;
    raise exception 'terminal_message_mutation_accepted';
  exception when check_violation then null; end;
  raise notice 'P3_STREAM_COMPLETE=PASS seq=5 resume_after_seq2=3 final_blocks=1 replay_same_message=1 terminal_immutable=1';
end $$;

-- Disconnect/process interruption keeps partial events but no fake final blocks.
do $$
declare
  a constant uuid := 'd3a00000-0000-4000-8000-000000000001';
  c constant uuid := 'd3a10000-0000-4000-8000-000000000001';
  turn jsonb; m uuid; r uuid; state text; blocks integer; events integer;
begin
  turn := public.vh_begin_conversation_turn(a,c,'incomplete-key','Interrupted prompt');
  m := (turn->>'assistantMessageId')::uuid; r := (turn->>'requestId')::uuid;
  perform public.vh_append_conversation_stream_event(a,m,r,'message.started','{}'::jsonb);
  perform public.vh_append_conversation_stream_event(a,m,r,'block.delta','{"path":["text"],"delta":"partial"}'::jsonb,'answer-1','answer',1);
  state := public.vh_mark_conversation_message_incomplete(a,m,r,'STREAM_INTERRUPTED');
  select status,jsonb_array_length(content_blocks) into state,blocks from public.vh_conversation_messages where id=m;
  select count(*) into events from public.vh_stream_events where message_id=m;
  if state<>'INCOMPLETE' or blocks<>0 or events<>2 then raise exception 'stream_incomplete_state_wrong'; end if;
  raise notice 'P3_STREAM_INCOMPLETE=PASS partial_events=2 final_blocks=0 status=INCOMPLETE';
end $$;

-- Cancel is terminal, persisted, and idempotent.
do $$
declare
  a constant uuid := 'd3a00000-0000-4000-8000-000000000001';
  c constant uuid := 'd3a10000-0000-4000-8000-000000000001';
  turn jsonb; m uuid; r uuid; first jsonb; retry jsonb; cancelled_events integer;
begin
  turn := public.vh_begin_conversation_turn(a,c,'cancel-key','Cancel prompt');
  m := (turn->>'assistantMessageId')::uuid; r := (turn->>'requestId')::uuid;
  perform public.vh_append_conversation_stream_event(a,m,r,'message.started','{}'::jsonb);
  first := public.vh_cancel_conversation_message(a,m);
  retry := public.vh_cancel_conversation_message(a,m);
  select count(*) into cancelled_events from public.vh_stream_events where message_id=m and event_type='message.cancelled';
  if first->>'status'<>'CANCELLED' or retry->>'status'<>'CANCELLED' or cancelled_events<>1 then raise exception 'stream_cancel_wrong'; end if;
  raise notice 'P3_STREAM_CANCEL=PASS cancellation_events=1 retry_idempotent=1';
end $$;

-- Provider failure is terminal and exact once.
do $$
declare
  a constant uuid := 'd3a00000-0000-4000-8000-000000000001';
  c constant uuid := 'd3a10000-0000-4000-8000-000000000001';
  turn jsonb; m uuid; r uuid; failed jsonb; failed_events integer;
begin
  turn := public.vh_begin_conversation_turn(a,c,'fail-key','Failure prompt');
  m := (turn->>'assistantMessageId')::uuid; r := (turn->>'requestId')::uuid;
  perform public.vh_append_conversation_stream_event(a,m,r,'message.started','{}'::jsonb);
  failed := public.vh_fail_conversation_message(a,m,r,'PROVIDER_UNAVAILABLE');
  select count(*) into failed_events from public.vh_stream_events where message_id=m and event_type='message.failed';
  if failed->>'status'<>'FAILED' or failed_events<>1 then raise exception 'stream_fail_wrong'; end if;
  raise notice 'P3_STREAM_FAILURE=PASS failed_events=1 code=PROVIDER_UNAVAILABLE';
end $$;

-- Cross-owner RPC access cannot discover/mutate another owner's Conversation/message.
do $$
declare
  a constant uuid := 'd3a00000-0000-4000-8000-000000000001';
  b constant uuid := 'd3b00000-0000-4000-8000-000000000002';
  ca constant uuid := 'd3a10000-0000-4000-8000-000000000001';
  cb constant uuid := 'd3b10000-0000-4000-8000-000000000002';
  turn jsonb; m uuid; r uuid;
begin
  begin
    perform public.vh_begin_conversation_turn(a,cb,'foreign-conversation','no');
    raise exception 'cross_owner_conversation_turn_accepted';
  exception when others then if position('conversation_not_found' in sqlerrm)=0 then raise; end if; end;
  turn := public.vh_begin_conversation_turn(b,cb,'owner-b','B prompt');
  m := (turn->>'assistantMessageId')::uuid; r := (turn->>'requestId')::uuid;
  begin
    perform public.vh_append_conversation_stream_event(a,m,r,'message.started','{}'::jsonb);
    raise exception 'cross_owner_stream_event_accepted';
  exception when others then if position('assistant_message_not_found' in sqlerrm)=0 then raise; end if; end;
  raise notice 'P3_STREAM_ISOLATION=PASS foreign_conversation=hidden foreign_message=hidden';
end $$;

-- Mutation functions are never callable by client roles.
do $$
declare sig text;
begin
  foreach sig in array array[
    'vh_begin_conversation_turn(uuid,uuid,text,text,uuid[])',
    'vh_append_conversation_stream_event(uuid,uuid,uuid,text,jsonb,text,text,integer)',
    'vh_complete_conversation_message(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,jsonb)',
    'vh_mark_conversation_message_incomplete(uuid,uuid,uuid,text)',
    'vh_cancel_conversation_message(uuid,uuid)',
    'vh_fail_conversation_message(uuid,uuid,uuid,text)'
  ] loop
    if has_function_privilege('anon','public.'||sig,'EXECUTE') or has_function_privilege('authenticated','public.'||sig,'EXECUTE') then
      raise exception 'client_execute_granted:%',sig;
    end if;
    if not has_function_privilege('service_role','public.'||sig,'EXECUTE') then raise exception 'service_execute_missing:%',sig; end if;
  end loop;
  raise notice 'P3_STREAM_SECURITY=PASS service_only_rpcs=6';
end $$;

delete from public.vh_accounts where id in (
 'd3a00000-0000-4000-8000-000000000001'::uuid,
 'd3b00000-0000-4000-8000-000000000002'::uuid
);
SQL

echo "PART3_STREAM=PASS protocol=vh.stream.v1 idempotency_race=pass persistence=postgres16 resume=pass incomplete=pass cancel=pass failure=pass isolation=pass"
