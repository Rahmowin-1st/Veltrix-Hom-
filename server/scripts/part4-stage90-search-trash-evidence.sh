#!/usr/bin/env bash
set -euo pipefail

psql -X -v ON_ERROR_STOP=1 <<'SQL'
\set VERBOSITY verbose

do $$
declare
  a uuid := '9a000000-0000-4000-8000-000000000001';
  b uuid := '9b000000-0000-4000-8000-000000000002';
  g uuid; g_b uuid; t uuid; n uuid; c uuid; m uuid; s uuid;
  kinds text[] := array['project','notebook','conversation','conversation_message','library_asset','library_content','note','todo','goal','studio_artifact','tag','collection'];
  got text[];
  x text;
  ok boolean;
begin
  insert into public.vh_accounts(id,email,status) values
    (a,'p4-stage90-a@example.test','active'),(b,'p4-stage90-b@example.test','active')
  on conflict(id) do nothing;

  -- Global Search must cover every frozen domain while remaining owner-only.
  delete from public.vh_search_documents where account_id in (a,b);
  foreach x in array kinds loop
    insert into public.vh_search_documents(account_id,entity_type,entity_id,title,body,match_metadata,deep_link,source_revision,deleted)
    values(a,x,gen_random_uuid(),'Universal Alpha '||x,'veltrix universal alpha searchable body',jsonb_build_object('kind',x),jsonb_build_object('entityType',x),'1',false);
  end loop;
  insert into public.vh_search_documents(account_id,entity_type,entity_id,title,body,deep_link,source_revision,deleted)
  values(b,'goal',gen_random_uuid(),'Universal Alpha PRIVATE B','veltrix universal alpha searchable body','{}','1',false);

  select array_agg(entity_type order by entity_type) into got
  from public.vh_global_search(a,'Universal Alpha',100,null);
  if got is distinct from (select array_agg(v order by v) from unnest(kinds) v) then
    raise exception 'P4_SEARCH_DOMAIN_COVERAGE_FAILED got=%',got;
  end if;
  if exists(select 1 from public.vh_global_search(a,'PRIVATE B',100,null)) then raise exception 'P4_SEARCH_CROSS_USER_LEAK'; end if;
  if (select count(*) from public.vh_global_search(b,'Universal Alpha',100,null))<>1 then raise exception 'P4_SEARCH_OWNER_B_SCOPE_FAILED'; end if;

  -- Real trigger -> queue -> durable job -> projection proof on Goal.
  insert into public.vh_goals(account_id,title,description) values(a,'Stage90 Indexed Goal','unique-goal-token-90') returning id into g;
  insert into public.vh_goals(account_id,title,description) values(b,'Foreign Indexed Goal','foreign-goal-token-90') returning id into g_b;
  if not exists(select 1 from public.vh_search_reindex_queue where account_id=a and entity_type='goal' and entity_id=g) then raise exception 'P4_SEARCH_TRIGGER_QUEUE_MISSING'; end if;
  if not exists(select 1 from public.vh_jobs where account_id=a and kind='search.reindex' and payload->>'entityId'=g::text) then raise exception 'P4_SEARCH_TRIGGER_JOB_MISSING'; end if;
  if not public.vh_reindex_search_entity(a,'goal',g) then raise exception 'P4_SEARCH_REINDEX_GOAL_FAILED'; end if;
  if not exists(select 1 from public.vh_global_search(a,'unique-goal-token-90',20,array['goal'])) then raise exception 'P4_SEARCH_REINDEX_NOT_QUERYABLE'; end if;
  if public.vh_reindex_search_entity(a,'goal',g_b) then raise exception 'P4_SEARCH_FOREIGN_REINDEX_CLAIMED'; end if;
  if exists(select 1 from public.vh_search_documents where account_id=a and entity_type='goal' and entity_id=g_b) then raise exception 'P4_SEARCH_FOREIGN_PROJECTION_CREATED'; end if;

  -- Deep-linked relationship: a message follows its parent Conversation Trash lifecycle.
  insert into public.vh_conversations(account_id,title) values(a,'Stage90 Deep Conversation') returning id into c;
  insert into public.vh_conversation_messages(account_id,conversation_id,role,status,plain_text)
  values(a,c,'USER','COMPLETED','deep-link-message-token-90') returning id into m;
  perform public.vh_reindex_search_entity(a,'conversation_message',m);
  if not exists(select 1 from public.vh_global_search(a,'deep-link-message-token-90',20,array['conversation_message'])) then raise exception 'P4_SEARCH_DEEP_LINK_INITIAL_FAILED'; end if;
  if not public.vh_set_trash_state(a,'conversation',c,true) then raise exception 'P4_TRASH_CONVERSATION_FAILED'; end if;
  perform public.vh_reindex_search_entity(a,'conversation_message',m);
  if exists(select 1 from public.vh_global_search(a,'deep-link-message-token-90',20,array['conversation_message'])) then raise exception 'P4_TRASH_DEEP_LINK_SEARCH_LEAK'; end if;
  if not public.vh_set_trash_state(a,'conversation',c,false) then raise exception 'P4_TRASH_CONVERSATION_RESTORE_FAILED'; end if;
  perform public.vh_reindex_search_entity(a,'conversation_message',m);
  if not exists(select 1 from public.vh_global_search(a,'deep-link-message-token-90',20,array['conversation_message'])) then raise exception 'P4_TRASH_DEEP_LINK_RESTORE_REINDEX_FAILED'; end if;

  -- Part4-native Trash types: Note, Todo, Goal, Studio Artifact.
  insert into public.vh_notes(account_id,title) values(a,'Stage90 Trash Note') returning id into n;
  insert into public.vh_todos(account_id,title) values(a,'Stage90 Trash Todo') returning id into t;
  insert into public.vh_studio_artifacts(account_id,artifact_type,title) values(a,'summary','Stage90 Trash Studio') returning id into s;

  if public.vh_set_trash_state(b,'goal',g,true) then raise exception 'P4_TRASH_FOREIGN_OWNER_CLAIMED'; end if;
  if (select trashed_at from public.vh_goals where id=g) is not null then raise exception 'P4_TRASH_FOREIGN_OWNER_MUTATED'; end if;

  foreach x in array array['note','todo','goal','studio_artifact'] loop
    ok := public.vh_set_trash_state(a,x,case x when 'note' then n when 'todo' then t when 'goal' then g else s end,true);
    if not ok then raise exception 'P4_TRASH_TYPE_FAILED %',x; end if;
  end loop;
  if exists(
    select 1 from (
      select trashed_at,purge_after from public.vh_notes where id=n union all
      select trashed_at,purge_after from public.vh_todos where id=t union all
      select trashed_at,purge_after from public.vh_goals where id=g union all
      select trashed_at,purge_after from public.vh_studio_artifacts where id=s
    ) q where trashed_at is null or purge_after is null or purge_after < trashed_at + interval '29 days 23 hours'
  ) then raise exception 'P4_TRASH_30_DAY_WINDOW_FAILED'; end if;

  foreach x in array array['note','todo','goal','studio_artifact'] loop
    ok := public.vh_set_trash_state(a,x,case x when 'note' then n when 'todo' then t when 'goal' then g else s end,false);
    if not ok then raise exception 'P4_TRASH_RESTORE_TYPE_FAILED %',x; end if;
  end loop;
  if exists(
    select 1 from (
      select trashed_at,purge_after from public.vh_notes where id=n union all
      select trashed_at,purge_after from public.vh_todos where id=t union all
      select trashed_at,purge_after from public.vh_goals where id=g union all
      select trashed_at,purge_after from public.vh_studio_artifacts where id=s
    ) q where trashed_at is not null or purge_after is not null
  ) then raise exception 'P4_TRASH_RESTORE_DID_NOT_CLEAR'; end if;

  -- Permanent delete only after owner Trash state.
  perform public.vh_set_trash_state(a,'note',n,true);
  if not public.vh_delete_part4_trash_metadata(a,'note',n) then raise exception 'P4_TRASH_PERMANENT_DELETE_FAILED'; end if;
  if exists(select 1 from public.vh_notes where id=n) then raise exception 'P4_TRASH_PERMANENT_DELETE_ROW_REMAINS'; end if;

  -- RLS + function privileges: client roles cannot bypass owner-scoped service RPCs.
  if not (select relrowsecurity from pg_class where oid='public.vh_search_documents'::regclass) then raise exception 'P4_SEARCH_DOCS_RLS_OFF'; end if;
  if not (select relrowsecurity from pg_class where oid='public.vh_search_reindex_queue'::regclass) then raise exception 'P4_SEARCH_QUEUE_RLS_OFF'; end if;
  if has_function_privilege('anon','public.vh_global_search(uuid,text,integer,text[])','EXECUTE') then raise exception 'P4_SEARCH_ANON_EXECUTE_ALLOWED'; end if;
  if has_function_privilege('authenticated','public.vh_set_trash_state(uuid,text,uuid,boolean)','EXECUTE') then raise exception 'P4_TRASH_AUTHENTICATED_EXECUTE_ALLOWED'; end if;
  if not has_function_privilege('service_role','public.vh_global_search(uuid,text,integer,text[])','EXECUTE') then raise exception 'P4_SEARCH_SERVICE_ROLE_EXECUTE_MISSING'; end if;

  raise notice 'P4_GLOBAL_SEARCH=PASS domains=12 owner_only=true async_projection=true';
  raise notice 'P4_TRASH_RECOVERY=PASS part4_native=true deep_link=true retention_days=30';
  raise notice 'P4_STAGE90_SECURITY=PASS search_owner_only trash_foreign_claim_blocked rls=true';
end $$;

select 'P4_STAGE90_SEARCH_TRASH=PASS';
SQL
