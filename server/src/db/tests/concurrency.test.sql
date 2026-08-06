-- =====================================================================
-- Executable concurrency / idempotency tests for migration-008.
--
-- Run against a scratch database that already has schema.sql +
-- migration-002..008 applied:
--   psql -v ON_ERROR_STOP=1 -d <db> -f concurrency.test.sql
--
-- Every check RAISEs on failure, so a clean run means all assertions held.
-- The genuinely concurrent case (two simultaneous claims) cannot be
-- expressed in one psql session; run scripts/concurrency-test.sh for that.
-- =====================================================================
\set ON_ERROR_STOP on
begin;

create temporary table _t(name text, ok boolean);

do $$
declare
  v_user   uuid := gen_random_uuid();
  v_cid    uuid := gen_random_uuid();
  v_req    uuid;
  v_lease  uuid;
  v_chat   uuid;
  v_out    text;
  v_count  int;
begin
  -- The profile trigger fires from auth.users in a real Supabase project.
  insert into auth.users(id, email, raw_user_meta_data)
    values (v_user, 'test@veltrix.local', '{}'::jsonb);

  -- 1. First claim creates exactly one chat + one user message.
  select outcome, request_id, chat_id, lease_token
    into v_out, v_req, v_chat, v_lease
    from public.claim_chat_request(v_user, v_cid, null, 'test savol', null, 'Test', null, 180);
  insert into _t values ('first claim -> claimed', v_out = 'claimed');

  select count(*) into v_count from public.chats where user_id = v_user;
  insert into _t values ('exactly one chat', v_count = 1);

  select count(*) into v_count from public.messages where request_id = v_req and role = 'user';
  insert into _t values ('exactly one user message', v_count = 1);

  -- 2. A duplicate submit while the lease is live must NOT call the model.
  select outcome into v_out
    from public.claim_chat_request(v_user, v_cid, null, 'test savol', null, 'Test', null, 180);
  insert into _t values ('duplicate while live -> processing', v_out = 'processing');

  select count(*) into v_count from public.chats where user_id = v_user;
  insert into _t values ('still one chat after duplicate', v_count = 1);

  -- 3. Completion writes exactly one assistant message.
  perform public.mark_request_provider_started(v_user, v_req, v_lease, 180);
  perform public.complete_chat_request(
    v_user, v_req, v_lease,
    '[{"type":"note","text":"javob"}]'::jsonb, '{"ok":true}'::jsonb,
    'matematika', 'none', 'test-model', 100);

  select count(*) into v_count from public.messages where request_id = v_req and role = 'assistant';
  insert into _t values ('exactly one assistant message', v_count = 1);

  -- 4. After completion, a replay returns the stored answer.
  select outcome into v_out
    from public.claim_chat_request(v_user, v_cid, null, 'test savol', null, 'Test', null, 180);
  insert into _t values ('after completion -> completed replay', v_out = 'completed');

  select count(*) into v_count from public.messages where role = 'assistant' and request_id = v_req;
  insert into _t values ('replay did not duplicate answer', v_count = 1);

  -- 5. A crash BEFORE the provider ran is safely retryable.
  declare v_cid2 uuid := gen_random_uuid(); v_req2 uuid;
  begin
    select request_id into v_req2
      from public.claim_chat_request(v_user, v_cid2, null, 'retry', null, 'R', null, 0);
    select outcome into v_out
      from public.claim_chat_request(v_user, v_cid2, null, 'retry', null, 'R', null, 180);
    insert into _t values ('expired lease, provider never ran -> claimed', v_out = 'claimed');
    select count(*) into v_count from public.messages where request_id = v_req2 and role = 'user';
    insert into _t values ('retry did not duplicate user message', v_count = 1);
  end;

  -- 6. A crash AFTER the provider ran must NOT silently re-invoke it.
  declare v_cid3 uuid := gen_random_uuid(); v_req3 uuid; v_lease3 uuid;
  begin
    select request_id, lease_token into v_req3, v_lease3
      from public.claim_chat_request(v_user, v_cid3, null, 'uncertain', null, 'U', null, 0);
    perform public.mark_request_provider_started(v_user, v_req3, v_lease3, 0);
    select outcome into v_out
      from public.claim_chat_request(v_user, v_cid3, null, 'uncertain', null, 'U', null, 180);
    insert into _t values ('expired lease after provider -> uncertain', v_out = 'uncertain');
  end;

  -- 7. Cross-account write is rejected.
  declare v_other uuid := gen_random_uuid(); v_blocked boolean := false;
  begin
    insert into auth.users(id, email, raw_user_meta_data)
      values (v_other, 'other@veltrix.local', '{}'::jsonb);
    begin
      perform public.claim_chat_request(v_other, gen_random_uuid(), v_chat, 'steal', null, null, null, 180);
    exception when others then v_blocked := true;
    end;
    insert into _t values ('cannot claim into another users chat', v_blocked);
  end;
end $$;

-- Report and fail loudly if anything did not hold.
select name, case when ok then 'PASS' else 'FAIL' end as result from _t order by name;

do $$
declare v_failed int;
begin
  select count(*) into v_failed from _t where not ok;
  if v_failed > 0 then
    raise exception '% assertion(s) FAILED', v_failed;
  end if;
  raise notice 'All % assertions passed.', (select count(*) from _t);
end $$;

rollback;
