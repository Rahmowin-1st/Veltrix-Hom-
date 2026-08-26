-- Veltrix Hom Backend Part 3 Stage 50: server-authoritative inline-test answers
-- and Goal/Todo/Note proposal confirmation boundary.
-- Additive only over accepted Part 3 migrations 115-117.

create table if not exists public.vh_conversation_proposal_confirmations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  message_id uuid not null references public.vh_conversation_messages(id) on delete cascade,
  block_id text not null check (char_length(block_id) between 1 and 96),
  proposal_type text not null check (proposal_type in ('note','todo','goal')),
  proposed_payload jsonb not null check (jsonb_typeof(proposed_payload)='object'),
  edited_fields jsonb not null default '{}'::jsonb check (jsonb_typeof(edited_fields)='object'),
  state text not null default 'USER_CONFIRMED' check (state in ('USER_CONFIRMED','PERSISTED')),
  persisted_entity_id uuid,
  confirmed_at timestamptz not null default now(),
  persisted_at timestamptz,
  unique(message_id,block_id),
  foreign key(message_id,account_id) references public.vh_conversation_messages(id,account_id) on delete cascade,
  check ((state='USER_CONFIRMED' and persisted_entity_id is null and persisted_at is null)
      or (state='PERSISTED' and persisted_entity_id is not null and persisted_at is not null))
);
create unique index if not exists vh_conversation_proposal_confirmations_id_owner_uq
  on public.vh_conversation_proposal_confirmations(id,account_id);
create index if not exists vh_conversation_proposal_confirmations_owner_message_idx
  on public.vh_conversation_proposal_confirmations(account_id,message_id,confirmed_at,id);

-- First submitted answer is authoritative. The client provides only an option id;
-- correctness and feedback are derived from the server-stored finalized block.
create or replace function public.vh_submit_interactive_test_answer(
  p_account_id uuid,
  p_message_id uuid,
  p_block_id text,
  p_question_id text,
  p_selected_option_id text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_blocks jsonb;
  v_block jsonb;
  v_question jsonb;
  v_selected jsonb;
  v_correct_count integer;
  v_correctness boolean;
  v_feedback jsonb;
  v_existing public.vh_interactive_test_answers%rowtype;
  v_id uuid;
begin
  if p_block_id is null or char_length(p_block_id) not between 1 and 96
     or p_question_id is null or char_length(p_question_id) not between 1 and 96
     or p_selected_option_id is null or char_length(p_selected_option_id) not between 1 and 96 then
    raise exception 'interactive_answer_identity_invalid' using errcode='22023';
  end if;

  select content_blocks into v_blocks
  from public.vh_conversation_messages
  where id=p_message_id and account_id=p_account_id and role='ASSISTANT' and status='COMPLETED';
  if not found then raise exception 'assistant_message_not_found' using errcode='P0002'; end if;

  select e.value into v_block
  from jsonb_array_elements(v_blocks) as e(value)
  where e.value->>'id'=p_block_id
  limit 1;
  if v_block is null then raise exception 'interactive_test_block_not_found' using errcode='P0002'; end if;
  if v_block->>'type' <> 'interactive_test' or coalesce((v_block->>'version')::integer,0) <> 1 then
    raise exception 'interactive_test_block_invalid' using errcode='P0001';
  end if;

  select q.value into v_question
  from jsonb_array_elements(coalesce(v_block->'questions','[]'::jsonb)) as q(value)
  where q.value->>'id'=p_question_id
  limit 1;
  if v_question is null then raise exception 'interactive_test_question_not_found' using errcode='P0002'; end if;

  select count(*)::integer into v_correct_count
  from jsonb_array_elements(coalesce(v_question->'options','[]'::jsonb)) as o(value)
  where coalesce((o.value->>'isCorrect')::boolean,false)=true;
  if v_correct_count <> 1 then raise exception 'interactive_test_answer_key_invalid' using errcode='P0001'; end if;

  select o.value into v_selected
  from jsonb_array_elements(coalesce(v_question->'options','[]'::jsonb)) as o(value)
  where o.value->>'id'=p_selected_option_id
  limit 1;
  if v_selected is null then raise exception 'interactive_test_option_not_found' using errcode='P0002'; end if;

  v_correctness := coalesce((v_selected->>'isCorrect')::boolean,false);
  v_feedback := jsonb_build_object(
    'state','REVEALED',
    'explanation',case when v_question ? 'explanation' then v_question->'explanation' else 'null'::jsonb end
  );

  select * into v_existing
  from public.vh_interactive_test_answers
  where account_id=p_account_id and message_id=p_message_id and block_id=p_block_id and question_id=p_question_id
  for update;
  if found then
    if v_existing.selected_option_id <> p_selected_option_id then
      raise exception 'interactive_answer_already_submitted' using errcode='P0001';
    end if;
    return jsonb_build_object(
      'answerId',v_existing.id,
      'messageId',v_existing.message_id,
      'blockId',v_existing.block_id,
      'questionId',v_existing.question_id,
      'selectedOptionId',v_existing.selected_option_id,
      'correctness',v_existing.correctness,
      'feedback',v_existing.feedback,
      'submittedAt',v_existing.submitted_at
    );
  end if;

  insert into public.vh_interactive_test_answers(
    account_id,message_id,block_id,question_id,selected_option_id,correctness,feedback
  ) values (
    p_account_id,p_message_id,p_block_id,p_question_id,p_selected_option_id,v_correctness,v_feedback
  ) returning id into v_id;

  return jsonb_build_object(
    'answerId',v_id,
    'messageId',p_message_id,
    'blockId',p_block_id,
    'questionId',p_question_id,
    'selectedOptionId',p_selected_option_id,
    'correctness',v_correctness,
    'feedback',v_feedback
  );
end $$;

-- Part 3 records explicit user confirmation only. It deliberately does NOT create
-- Goal/Todo/Note global-domain rows; Part 4 owns the PERSISTED transition.
create or replace function public.vh_confirm_conversation_proposal(
  p_account_id uuid,
  p_message_id uuid,
  p_block_id text,
  p_edited_fields jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_blocks jsonb;
  v_block jsonb;
  v_type text;
  v_kind text;
  v_existing public.vh_conversation_proposal_confirmations%rowtype;
  v_id uuid;
begin
  if p_block_id is null or char_length(p_block_id) not between 1 and 96 then
    raise exception 'proposal_identity_invalid' using errcode='22023';
  end if;
  if p_edited_fields is null or jsonb_typeof(p_edited_fields) <> 'object' then
    raise exception 'proposal_edits_invalid' using errcode='22023';
  end if;
  if octet_length(p_edited_fields::text) > 65536 then
    raise exception 'proposal_edits_too_large' using errcode='22023';
  end if;

  select content_blocks into v_blocks
  from public.vh_conversation_messages
  where id=p_message_id and account_id=p_account_id and role='ASSISTANT' and status='COMPLETED';
  if not found then raise exception 'assistant_message_not_found' using errcode='P0002'; end if;

  select e.value into v_block
  from jsonb_array_elements(v_blocks) as e(value)
  where e.value->>'id'=p_block_id
  limit 1;
  if v_block is null then raise exception 'proposal_block_not_found' using errcode='P0002'; end if;
  if coalesce((v_block->>'version')::integer,0) <> 1 or v_block->>'proposalState' <> 'PROPOSED' then
    raise exception 'proposal_block_invalid' using errcode='P0001';
  end if;

  v_type := v_block->>'type';
  v_kind := case v_type
    when 'note_proposal' then 'note'
    when 'todo_proposal' then 'todo'
    when 'goal_proposal' then 'goal'
    else null
  end;
  if v_kind is null then raise exception 'proposal_block_invalid' using errcode='P0001'; end if;

  select * into v_existing
  from public.vh_conversation_proposal_confirmations
  where account_id=p_account_id and message_id=p_message_id and block_id=p_block_id
  for update;
  if found then
    if v_existing.edited_fields <> p_edited_fields then
      raise exception 'proposal_already_confirmed' using errcode='P0001';
    end if;
    return jsonb_build_object(
      'confirmationId',v_existing.id,
      'messageId',v_existing.message_id,
      'blockId',v_existing.block_id,
      'proposalType',v_existing.proposal_type,
      'state',v_existing.state,
      'editedFields',v_existing.edited_fields,
      'confirmedAt',v_existing.confirmed_at
    );
  end if;

  insert into public.vh_conversation_proposal_confirmations(
    account_id,message_id,block_id,proposal_type,proposed_payload,edited_fields,state
  ) values (
    p_account_id,p_message_id,p_block_id,v_kind,v_block,p_edited_fields,'USER_CONFIRMED'
  ) returning id into v_id;

  return jsonb_build_object(
    'confirmationId',v_id,
    'messageId',p_message_id,
    'blockId',p_block_id,
    'proposalType',v_kind,
    'state','USER_CONFIRMED',
    'editedFields',p_edited_fields
  );
end $$;

alter table public.vh_conversation_proposal_confirmations enable row level security;
revoke all on table public.vh_conversation_proposal_confirmations from public,anon,authenticated;
grant select,insert,update,delete on table public.vh_conversation_proposal_confirmations to service_role;

revoke all on function public.vh_submit_interactive_test_answer(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.vh_submit_interactive_test_answer(uuid,uuid,text,text,text) to service_role;
revoke all on function public.vh_confirm_conversation_proposal(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.vh_confirm_conversation_proposal(uuid,uuid,text,jsonb) to service_role;
