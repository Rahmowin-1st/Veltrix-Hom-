#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:?PGPORT is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${PGDATABASE:?PGDATABASE is required}"

PSQL=(psql -X -v ON_ERROR_STOP=1)

echo "PART3_INTERACTIONS_BEGIN"
"${PSQL[@]}" <<'SQL'
\set VERBOSITY terse

delete from public.vh_accounts where id in (
  'c5a00000-0000-4000-8000-000000000001'::uuid,
  'c5b00000-0000-4000-8000-000000000002'::uuid
);
insert into public.vh_accounts(id,email) values
 ('c5a00000-0000-4000-8000-000000000001','part3-interactions-a@example.invalid'),
 ('c5b00000-0000-4000-8000-000000000002','part3-interactions-b@example.invalid');

insert into public.vh_conversations(id,account_id,title) values
 ('c5a10000-0000-4000-8000-000000000001','c5a00000-0000-4000-8000-000000000001','Stage 50 A'),
 ('c5b10000-0000-4000-8000-000000000002','c5b00000-0000-4000-8000-000000000002','Stage 50 B');

insert into public.vh_conversation_messages(
  id,account_id,conversation_id,role,status,plain_text,content_blocks,completed_at
) values (
  'c5a20000-0000-4000-8000-000000000001',
  'c5a00000-0000-4000-8000-000000000001',
  'c5a10000-0000-4000-8000-000000000001',
  'ASSISTANT','COMPLETED','Stage 50 interaction fixture',
  jsonb_build_array(
    jsonb_build_object(
      'id','test-1','type','interactive_test','version',1,
      'questions',jsonb_build_array(
        jsonb_build_object(
          'id','q1','prompt','2 + 2?','status','UNANSWERED','explanation','Two pairs make four.',
          'options',jsonb_build_array(
            jsonb_build_object('id','q1-a','text','3','isCorrect',false),
            jsonb_build_object('id','q1-b','text','4','isCorrect',true)
          )
        ),
        jsonb_build_object(
          'id','q2','prompt','Capital of France?','status','UNANSWERED','explanation','Paris is the capital of France.',
          'options',jsonb_build_array(
            jsonb_build_object('id','q2-a','text','Rome','isCorrect',false),
            jsonb_build_object('id','q2-b','text','Paris','isCorrect',true)
          )
        )
      )
    ),
    jsonb_build_object('id','note-1','type','note_proposal','version',1,'proposalState','PROPOSED','title','Physics note','fields',jsonb_build_object('body','Energy notes')),
    jsonb_build_object('id','todo-1','type','todo_proposal','version',1,'proposalState','PROPOSED','title','Review chapter','fields',jsonb_build_object('priority','high')),
    jsonb_build_object('id','goal-1','type','goal_proposal','version',1,'proposalState','PROPOSED','title','Master physics','fields',jsonb_build_object('target','exam'))
  ),
  now()
),(
  'c5a20000-0000-4000-8000-000000000002',
  'c5a00000-0000-4000-8000-000000000001',
  'c5a10000-0000-4000-8000-000000000001',
  'ASSISTANT','COMPLETED','Malformed interactive fixture',
  jsonb_build_array(
    jsonb_build_object(
      'id','bad-test','type','interactive_test','version',1,
      'questions',jsonb_build_array(
        jsonb_build_object(
          'id','bad-q','prompt','Malformed key',
          'options',jsonb_build_array(
            jsonb_build_object('id','bad-a','text','A','isCorrect',true),
            jsonb_build_object('id','bad-b','text','B','isCorrect',true)
          )
        )
      )
    )
  ),
  now()
);

-- Server derives correctness from stored answer key; retries are idempotent and
-- a second different answer cannot overwrite the first submission.
do $$
declare
  a constant uuid := 'c5a00000-0000-4000-8000-000000000001';
  b constant uuid := 'c5b00000-0000-4000-8000-000000000002';
  m constant uuid := 'c5a20000-0000-4000-8000-000000000001';
  malformed constant uuid := 'c5a20000-0000-4000-8000-000000000002';
  first_result jsonb;
  retry_result jsonb;
  second_result jsonb;
begin
  first_result := public.vh_submit_interactive_test_answer(a,m,'test-1','q1','q1-a');
  if coalesce((first_result->>'correctness')::boolean,true) then raise exception 'client_wrong_answer_scored_correct'; end if;
  if first_result->'feedback'->>'state' <> 'REVEALED' then raise exception 'feedback_state_missing'; end if;
  retry_result := public.vh_submit_interactive_test_answer(a,m,'test-1','q1','q1-a');
  if retry_result->>'answerId' is distinct from first_result->>'answerId' then raise exception 'answer_retry_not_idempotent'; end if;
  begin
    perform public.vh_submit_interactive_test_answer(a,m,'test-1','q1','q1-b');
    raise exception 'different_answer_overwrite_accepted';
  exception when others then if position('interactive_answer_already_submitted' in sqlerrm)=0 then raise; end if; end;

  second_result := public.vh_submit_interactive_test_answer(a,m,'test-1','q2','q2-b');
  if not coalesce((second_result->>'correctness')::boolean,false) then raise exception 'server_correct_answer_scored_wrong'; end if;
  if (select count(*) from public.vh_interactive_test_answers where account_id=a and message_id=m) <> 2 then raise exception 'interactive_answer_persistence_wrong'; end if;

  begin
    perform public.vh_submit_interactive_test_answer(a,m,'test-1','q2','missing-option');
    raise exception 'unknown_option_accepted';
  exception when others then if position('interactive_test_option_not_found' in sqlerrm)=0 then raise; end if; end;
  begin
    perform public.vh_submit_interactive_test_answer(b,m,'test-1','q2','q2-b');
    raise exception 'cross_owner_answer_accepted';
  exception when others then if position('assistant_message_not_found' in sqlerrm)=0 then raise; end if; end;
  begin
    perform public.vh_submit_interactive_test_answer(a,malformed,'bad-test','bad-q','bad-a');
    raise exception 'malformed_answer_key_accepted';
  exception when others then if position('interactive_test_answer_key_invalid' in sqlerrm)=0 then raise; end if; end;

  raise notice 'P3_INTERACTIVE_TEST=PASS questions=2 server_scoring=1 idempotent_retry=1 overwrite_rejected=1 invalid_key_rejected=1 cross_owner_rejected=1';
end $$;

-- Goal/Todo/Note stop at USER_CONFIRMED in Part 3. Edits are captured once,
-- retries are idempotent, and no persistence target may be fabricated here.
do $$
declare
  a constant uuid := 'c5a00000-0000-4000-8000-000000000001';
  b constant uuid := 'c5b00000-0000-4000-8000-000000000002';
  m constant uuid := 'c5a20000-0000-4000-8000-000000000001';
  n1 jsonb;
  n2 jsonb;
  t jsonb;
  g jsonb;
begin
  n1 := public.vh_confirm_conversation_proposal(a,m,'note-1',jsonb_build_object('title','Edited note','body','Edited body'));
  if n1->>'state' <> 'USER_CONFIRMED' or n1->>'proposalType' <> 'note' then raise exception 'note_confirmation_wrong'; end if;
  n2 := public.vh_confirm_conversation_proposal(a,m,'note-1',jsonb_build_object('title','Edited note','body','Edited body'));
  if n2->>'confirmationId' is distinct from n1->>'confirmationId' then raise exception 'proposal_retry_not_idempotent'; end if;
  begin
    perform public.vh_confirm_conversation_proposal(a,m,'note-1',jsonb_build_object('title','Different edit'));
    raise exception 'proposal_confirmation_mutated';
  exception when others then if position('proposal_already_confirmed' in sqlerrm)=0 then raise; end if; end;

  t := public.vh_confirm_conversation_proposal(a,m,'todo-1',jsonb_build_object('title','Review chapter 2'));
  g := public.vh_confirm_conversation_proposal(a,m,'goal-1',jsonb_build_object('title','Master mechanics'));
  if t->>'proposalType' <> 'todo' or g->>'proposalType' <> 'goal' then raise exception 'proposal_kind_mapping_wrong'; end if;
  if (select count(*) from public.vh_conversation_proposal_confirmations where account_id=a and message_id=m and state='USER_CONFIRMED') <> 3 then raise exception 'proposal_confirmation_count_wrong'; end if;
  if exists(select 1 from public.vh_conversation_proposal_confirmations where account_id=a and message_id=m and (persisted_entity_id is not null or persisted_at is not null)) then raise exception 'part3_fabricated_persisted_target'; end if;

  begin
    perform public.vh_confirm_conversation_proposal(b,m,'goal-1','{}'::jsonb);
    raise exception 'cross_owner_proposal_confirmation_accepted';
  exception when others then if position('assistant_message_not_found' in sqlerrm)=0 then raise; end if; end;

  begin
    update public.vh_conversation_proposal_confirmations
      set state='PERSISTED'
      where account_id=a and message_id=m and block_id='goal-1';
    raise exception 'invalid_persisted_transition_accepted';
  exception when check_violation then null; end;

  raise notice 'P3_PROPOSALS=PASS note=1 todo=1 goal=1 lifecycle=PROPOSED_TO_USER_CONFIRMED persisted_deferred=1 edited_fields=1 idempotent_retry=1 cross_owner_rejected=1';
end $$;

-- New Stage 50 persistence/RPC surface remains service-role only.
do $$
begin
  if has_table_privilege('authenticated','public.vh_conversation_proposal_confirmations','SELECT') then raise exception 'proposal_table_authenticated_readable'; end if;
  if has_table_privilege('authenticated','public.vh_conversation_proposal_confirmations','INSERT') then raise exception 'proposal_table_authenticated_writable'; end if;
  if has_function_privilege('authenticated','public.vh_submit_interactive_test_answer(uuid,uuid,text,text,text)','EXECUTE') then raise exception 'interactive_rpc_authenticated_executable'; end if;
  if has_function_privilege('authenticated','public.vh_confirm_conversation_proposal(uuid,uuid,text,jsonb)','EXECUTE') then raise exception 'proposal_rpc_authenticated_executable'; end if;
  raise notice 'P3_INTERACTION_SECURITY=PASS service_only=1';
end $$;

delete from public.vh_accounts where id in (
  'c5a00000-0000-4000-8000-000000000001'::uuid,
  'c5b00000-0000-4000-8000-000000000002'::uuid
);
SQL

echo "PART3_INTERACTIONS=PASS postgres=16 inline_test=pass server_scoring=pass proposal_confirmation=pass persisted_deferred=pass isolation=pass"
