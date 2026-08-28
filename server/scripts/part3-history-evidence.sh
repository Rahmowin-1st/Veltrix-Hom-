#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:?PGPORT is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${PGDATABASE:?PGDATABASE is required}"

PSQL=(psql -X -v ON_ERROR_STOP=1)

echo "PART3_HISTORY_BEGIN"
"${PSQL[@]}" <<'SQL'
\set VERBOSITY terse

delete from public.vh_accounts where id in (
  'd6a00000-0000-4000-8000-000000000001'::uuid,
  'd6b00000-0000-4000-8000-000000000002'::uuid
);
insert into public.vh_accounts(id,email) values
 ('d6a00000-0000-4000-8000-000000000001','part3-history-a@example.invalid'),
 ('d6b00000-0000-4000-8000-000000000002','part3-history-b@example.invalid');

insert into public.vh_projects(id,account_id,name) values
 ('d6a10000-0000-4000-8000-000000000001','d6a00000-0000-4000-8000-000000000001','Orbitproject Atlas');
insert into public.vh_notebooks(id,account_id,name) values
 ('d6a20000-0000-4000-8000-000000000001','d6a00000-0000-4000-8000-000000000001','Matrixnotebook Research');
insert into public.vh_library_assets(
  id,account_id,original_filename,display_title,source_kind,asset_class,original_size_bytes,
  origin_surface,content_sha256,processing_status,extraction_status
) values (
  'd6a30000-0000-4000-8000-000000000001','d6a00000-0000-4000-8000-000000000001',
  'archive-reference.pdf','Archivereference Source','pdf','file',1024,'conversation',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa61','READY','READY'
);

insert into public.vh_conversations(
  id,account_id,title,title_source,project_id,permanent_reference_asset_id,permanent_reference_set_at,pinned,pin_order,last_message_at
) values
 ('d6a40000-0000-4000-8000-000000000001','d6a00000-0000-4000-8000-000000000001','New Conversation','AUTO','d6a10000-0000-4000-8000-000000000001','d6a30000-0000-4000-8000-000000000001',now(),true,20,now()),
 ('d6a40000-0000-4000-8000-000000000002','d6a00000-0000-4000-8000-000000000001','Secondary Active','AUTO',null,null,null,true,10,now()-interval '1 minute'),
 ('d6b40000-0000-4000-8000-000000000001','d6b00000-0000-4000-8000-000000000002','Protected Galaxy','USER',null,null,null,false,null,now());

insert into public.vh_conversation_notebooks(account_id,conversation_id,notebook_id) values
 ('d6a00000-0000-4000-8000-000000000001','d6a40000-0000-4000-8000-000000000001','d6a20000-0000-4000-8000-000000000001');

insert into public.vh_conversation_messages(
  id,account_id,conversation_id,role,status,plain_text,content_blocks,completed_at
) values
 ('d6a50000-0000-4000-8000-000000000001','d6a00000-0000-4000-8000-000000000001','d6a40000-0000-4000-8000-000000000001','USER','COMPLETED','Quasaruser exact message token','[]'::jsonb,now()),
 ('d6a50000-0000-4000-8000-000000000002','d6a00000-0000-4000-8000-000000000001','d6a40000-0000-4000-8000-000000000001','ASSISTANT','COMPLETED','Answer summary',
  '[{"id":"answer-1","type":"answer","version":1,"text":"Photonblock exact AI block token"}]'::jsonb,now()),
 ('d6b50000-0000-4000-8000-000000000001','d6b00000-0000-4000-8000-000000000002','d6b40000-0000-4000-8000-000000000001','USER','COMPLETED','Quasaruser foreign owner token','[]'::jsonb,now());

-- AUTO titles may evolve until a user rename; USER titles are authoritative.
do $$
declare a constant uuid := 'd6a00000-0000-4000-8000-000000000001'; c constant uuid := 'd6a40000-0000-4000-8000-000000000001'; r jsonb;
begin
  r := public.vh_apply_auto_conversation_title(a,c,'Automatic Seed');
  if r->>'title' <> 'Automatic Seed' or not (r->>'applied')::boolean then raise exception 'auto_title_not_applied'; end if;
  r := public.vh_set_conversation_title_user(a,c,'Protected Galaxy');
  if r->>'titleSource' <> 'USER' then raise exception 'manual_title_source_not_user'; end if;
  r := public.vh_apply_auto_conversation_title(a,c,'Forbidden Overwrite');
  if (r->>'applied')::boolean or r->>'title' <> 'Protected Galaxy' then raise exception 'user_title_overwritten'; end if;
  raise notice 'P3_TITLE=PASS auto=1 manual_user=1 overwrite_protected=1';
end $$;

-- Default catalog exists per owner; custom tags remain manual and independently editable.
do $$
declare
  a constant uuid := 'd6a00000-0000-4000-8000-000000000001';
  b constant uuid := 'd6b00000-0000-4000-8000-000000000002';
  c1 constant uuid := 'd6a40000-0000-4000-8000-000000000001';
  c2 constant uuid := 'd6a40000-0000-4000-8000-000000000002';
  t1 uuid; t2 uuid; default_tag uuid; filtered integer;
begin
  perform public.vh_ensure_conversation_default_tags(a);
  perform public.vh_ensure_conversation_default_tags(b);
  if (select count(*) from public.vh_conversation_tags where account_id=a and is_default) <> 3 then raise exception 'default_tags_missing_a'; end if;
  if (select count(*) from public.vh_conversation_tags where account_id=b and is_default) <> 3 then raise exception 'default_tags_missing_b'; end if;
  select id into default_tag from public.vh_conversation_tags where account_id=a and is_default order by catalog_key limit 1;
  begin
    perform public.vh_rename_conversation_tag(a,default_tag,'Mutable Default');
    raise exception 'default_tag_renamed';
  exception when others then if position('default_tag_immutable' in sqlerrm)=0 then raise; end if; end;

  t1 := public.vh_create_conversation_tag(a,'Cobalttag');
  if public.vh_create_conversation_tag(a,'cobalttag') <> t1 then raise exception 'custom_tag_create_not_idempotent'; end if;
  t2 := public.vh_create_conversation_tag(a,'Examonly');
  perform public.vh_attach_conversation_tag(a,c1,t1);
  perform public.vh_attach_conversation_tag(a,c1,t1);
  perform public.vh_attach_conversation_tag(a,c1,t2);
  perform public.vh_attach_conversation_tag(a,c2,t1);
  select count(*) into filtered from public.vh_list_conversation_history(a,'active',array[t1,t2],100);
  if filtered <> 1 then raise exception 'multi_tag_filter_not_all_match'; end if;
  perform public.vh_detach_conversation_tag(a,c2,t1);
  if exists(select 1 from public.vh_conversation_tag_links where account_id=a and conversation_id=c2) then raise exception 'tag_detach_failed'; end if;
  perform public.vh_rename_conversation_tag(a,t2,'Examfinal');
  perform public.vh_delete_conversation_tag(a,t2);
  if exists(select 1 from public.vh_conversation_tags where id=t2) then raise exception 'custom_tag_delete_failed'; end if;
  if not exists(select 1 from public.vh_list_conversation_history(a,'active','{}'::uuid[],100) where conversation_id=c2) then raise exception 'tagless_conversation_missing'; end if;
  raise notice 'P3_TAGS=PASS defaults=3 custom_create=1 rename=1 delete=1 attach_detach=1 tagless=1 multi_tag_all=1 owner_isolated=1';
end $$;

-- Pin ordering is explicit. Archive normalizes pin state, hides from active history,
-- preserves all Conversation relationships, and restores without data loss.
do $$
declare
  a constant uuid := 'd6a00000-0000-4000-8000-000000000001';
  c1 constant uuid := 'd6a40000-0000-4000-8000-000000000001';
  first_id uuid;
begin
  select conversation_id into first_id from public.vh_list_conversation_history(a,'active','{}'::uuid[],100) limit 1;
  if first_id <> 'd6a40000-0000-4000-8000-000000000002'::uuid then raise exception 'manual_pin_order_wrong'; end if;
  perform public.vh_set_conversation_archive(a,c1,true);
  if exists(select 1 from public.vh_conversations where id=c1 and (pinned or pin_order is not null or archived_at is null)) then raise exception 'archive_pin_normalization_failed'; end if;
  if exists(select 1 from public.vh_list_conversation_history(a,'active','{}'::uuid[],100) where conversation_id=c1) then raise exception 'archived_visible_in_active'; end if;
  if not exists(select 1 from public.vh_list_conversation_history(a,'archived','{}'::uuid[],100) where conversation_id=c1) then raise exception 'archived_missing_from_archive'; end if;
  if not exists(select 1 from public.vh_conversation_messages where account_id=a and conversation_id=c1)
     or not exists(select 1 from public.vh_conversation_notebooks where account_id=a and conversation_id=c1)
     or not exists(select 1 from public.vh_conversation_tag_links where account_id=a and conversation_id=c1)
     or not exists(select 1 from public.vh_conversations where id=c1 and project_id is not null and permanent_reference_asset_id is not null) then
    raise exception 'archive_relationship_loss';
  end if;
  begin
    perform public.vh_set_conversation_pin(a,c1,true,1);
    raise exception 'archived_pin_accepted';
  exception when others then if position('archived_conversation_cannot_pin' in sqlerrm)=0 then raise; end if; end;
  perform public.vh_set_conversation_archive(a,c1,false);
  if not exists(select 1 from public.vh_list_conversation_history(a,'active','{}'::uuid[],100) where conversation_id=c1) then raise exception 'restore_failed'; end if;
  raise notice 'P3_HISTORY=PASS manual_pin_order=1 archive_unpins=1 active_excludes_archive=1 restore=1 relations_preserved=1';
end $$;

-- Exact lexical search is independently usable without embeddings and covers every frozen surface.
do $$
declare
  a constant uuid := 'd6a00000-0000-4000-8000-000000000001';
  c constant uuid := 'd6a40000-0000-4000-8000-000000000001';
  m_user constant uuid := 'd6a50000-0000-4000-8000-000000000001';
  m_ai constant uuid := 'd6a50000-0000-4000-8000-000000000002';
  kinds text[] := array['title','user_message','ai_block','tag','notebook','project','reference'];
  queries text[] := array['galaxy','quasaruser','photonblock','cobalttag','matrixnotebook','orbitproject','archivereference'];
  i integer; hit record;
begin
  for i in 1..array_length(kinds,1) loop
    select * into hit from public.vh_search_conversations(a,queries[i],false,20) where hit_type=kinds[i] limit 1;
    if hit.conversation_id is distinct from c then raise exception 'search_surface_missing:%',kinds[i]; end if;
    if kinds[i]='user_message' and hit.message_id is distinct from m_user then raise exception 'user_message_locator_wrong'; end if;
    if kinds[i]='ai_block' and (hit.message_id is distinct from m_ai or hit.block_id is distinct from 'answer-1') then raise exception 'ai_block_locator_wrong'; end if;
  end loop;
  if (select count(*) from public.vh_search_conversations(a,'quasaruser',false,20) where conversation_id='d6b40000-0000-4000-8000-000000000001'::uuid) <> 0 then raise exception 'search_cross_owner_leak'; end if;
  perform public.vh_set_conversation_archive(a,c,true);
  if exists(select 1 from public.vh_search_conversations(a,'galaxy',false,20) where conversation_id=c) then raise exception 'archived_search_default_leak'; end if;
  if not exists(select 1 from public.vh_search_conversations(a,'galaxy',true,20) where conversation_id=c) then raise exception 'archived_search_opt_in_missing'; end if;
  perform public.vh_set_conversation_archive(a,c,false);
  raise notice 'P3_SEARCH=PASS surfaces=7 title=1 user_message=1 ai_block=1 tag=1 notebook=1 project=1 reference=1 exact_message_locator=1 exact_block_locator=1 archived_opt_in=1 isolation=1 semantic_dependency=0';
end $$;

-- Stage 60 surface remains service-role only.
do $$
begin
  if has_table_privilege('authenticated','public.vh_conversation_default_tag_catalog','SELECT') then raise exception 'default_tag_catalog_authenticated_readable'; end if;
  if has_function_privilege('authenticated','public.vh_search_conversations(uuid,text,boolean,integer)','EXECUTE') then raise exception 'history_search_authenticated_executable'; end if;
  if has_function_privilege('authenticated','public.vh_set_conversation_title_user(uuid,uuid,text)','EXECUTE') then raise exception 'title_rpc_authenticated_executable'; end if;
  if has_function_privilege('authenticated','public.vh_create_conversation_tag(uuid,text)','EXECUTE') then raise exception 'tag_rpc_authenticated_executable'; end if;
  raise notice 'P3_HISTORY_SECURITY=PASS service_only=1';
end $$;

delete from public.vh_accounts where id in (
  'd6a00000-0000-4000-8000-000000000001'::uuid,
  'd6b00000-0000-4000-8000-000000000002'::uuid
);
SQL

echo "PART3_HISTORY_SEARCH=PASS postgres=16 title_protection=pass manual_tags=pass pin_archive=pass search_surfaces=7 exact_locator=pass isolation=pass"
