#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:?PGPORT is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${PGDATABASE:?PGDATABASE is required}"

PSQL=(psql -X -v ON_ERROR_STOP=1)

echo "PART3_CORE_BEGIN"
"${PSQL[@]}" <<'SQL'
\set VERBOSITY terse

-- Isolated acceptance identities.
delete from public.vh_accounts where id in (
  'c3a00000-0000-4000-8000-000000000001'::uuid,
  'c3b00000-0000-4000-8000-000000000002'::uuid
);
insert into public.vh_accounts(id,email) values
 ('c3a00000-0000-4000-8000-000000000001','part3-core-a@example.invalid'),
 ('c3b00000-0000-4000-8000-000000000002','part3-core-b@example.invalid');

create or replace function pg_temp.p3_asset(
  p_account uuid,p_id uuid,p_size bigint,p_seed text,p_title text
) returns void language plpgsql as $$
begin
  insert into public.vh_library_assets(
    id,account_id,original_filename,display_title,declared_mime,detected_mime,
    source_kind,asset_class,original_size_bytes,origin_surface,content_sha256,
    processing_status,extraction_status,provenance
  ) values (
    p_id,p_account,p_title||'.txt',p_title,'text/plain','text/plain','text','file',
    p_size,'part3-core',encode(digest(p_seed,'sha256'),'hex'),'READY','READY',
    jsonb_build_object('fixture','part3-core')
  );
end $$;

-- P3-02/P3-03: Conversation + optional one owner-safe Project.
do $$
declare
  a constant uuid := 'c3a00000-0000-4000-8000-000000000001';
  b constant uuid := 'c3b00000-0000-4000-8000-000000000002';
  pa uuid := 'c3a10000-0000-4000-8000-000000000001';
  pb uuid := 'c3b10000-0000-4000-8000-000000000002';
  c uuid := 'c3a20000-0000-4000-8000-000000000001';
begin
  insert into public.vh_projects(id,account_id,name) values(pa,a,'P3 own project'),(pb,b,'P3 foreign project');
  insert into public.vh_conversations(id,account_id,title,project_id) values(c,a,'Part 3 core',pa);
  if (select project_id from public.vh_conversations where id=c) <> pa then raise exception 'conversation_project_attach_failed'; end if;
  update public.vh_conversations set project_id=null where id=c;
  if (select project_id from public.vh_conversations where id=c) is not null then raise exception 'conversation_project_detach_failed'; end if;
  update public.vh_conversations set project_id=pa where id=c;
  begin
    update public.vh_conversations set project_id=pb where id=c;
    raise exception 'cross_owner_project_accepted';
  exception when foreign_key_violation then null; end;
  if (select count(*) from public.vh_conversations where id=c and account_id=a) <> 1 then raise exception 'conversation_domain_failed'; end if;
  raise notice 'P3_CONVERSATION_PROJECT=PASS optional_project=1 cross_owner_rejected=1';
end $$;

-- P3-04: business-semantic unlimited Notebook relation. Prove a non-trivial 150 links.
do $$
declare
  a constant uuid := 'c3a00000-0000-4000-8000-000000000001';
  b constant uuid := 'c3b00000-0000-4000-8000-000000000002';
  c constant uuid := 'c3a20000-0000-4000-8000-000000000001';
  n uuid;
  foreign_n uuid := 'c3b30000-0000-4000-8000-000000000001';
  first_n uuid;
  first_link uuid;
  retry_link uuid;
  i integer;
begin
  insert into public.vh_notebooks(id,account_id,name) values(foreign_n,b,'Foreign Notebook');
  for i in 1..150 loop
    n := md5('part3-notebook-'||i::text)::uuid;
    if i=1 then first_n := n; end if;
    insert into public.vh_notebooks(id,account_id,name) values(n,a,'P3 Notebook '||i::text);
    perform public.vh_attach_conversation_notebook(a,c,n);
  end loop;
  if (select count(*) from public.vh_conversation_notebooks where account_id=a and conversation_id=c) <> 150 then
    raise exception 'conversation_notebook_count_wrong';
  end if;
  select id into first_link from public.vh_conversation_notebooks where conversation_id=c and notebook_id=first_n;
  retry_link := public.vh_attach_conversation_notebook(a,c,first_n);
  if retry_link <> first_link then raise exception 'conversation_notebook_retry_not_idempotent'; end if;
  begin
    perform public.vh_attach_conversation_notebook(a,c,foreign_n);
    raise exception 'foreign_notebook_accepted';
  exception when others then if position('notebook_not_found' in sqlerrm)=0 then raise; end if; end;
  delete from public.vh_conversation_notebooks where conversation_id=c and notebook_id=first_n;
  if not exists(select 1 from public.vh_notebooks where id=first_n and account_id=a) then raise exception 'notebook_detach_deleted_notebook'; end if;
  raise notice 'P3_CONVERSATION_NOTEBOOKS=PASS attached=150 idempotent=1 cross_owner_rejected=1 detach_preserves_notebook=1';
end $$;

-- P3-05/P3-06: exact 20 MiB reference, over-limit rejection, immutable identity through Trash/restore/purge.
do $$
declare
  a constant uuid := 'c3a00000-0000-4000-8000-000000000001';
  c_limit uuid := 'c3a21000-0000-4000-8000-000000000001';
  c_immut uuid := 'c3a21000-0000-4000-8000-000000000002';
  exact_asset uuid := 'c3a40000-0000-4000-8000-000000000001';
  over_asset uuid := 'c3a40000-0000-4000-8000-000000000002';
  first_asset uuid := 'c3a40000-0000-4000-8000-000000000003';
  second_asset uuid := 'c3a40000-0000-4000-8000-000000000004';
  marker timestamptz;
  tomb text;
begin
  insert into public.vh_conversations(id,account_id,title) values
    (c_limit,a,'Reference limit'),(c_immut,a,'Reference immutable');
  perform pg_temp.p3_asset(a,exact_asset,20*1024*1024,'p3-ref-exact','Reference exact');
  perform pg_temp.p3_asset(a,over_asset,20*1024*1024+1,'p3-ref-over','Reference over');
  perform pg_temp.p3_asset(a,first_asset,1024,'p3-ref-first','Reference first');
  perform pg_temp.p3_asset(a,second_asset,1024,'p3-ref-second','Reference second');

  if public.vh_set_conversation_reference(a,c_limit,exact_asset) <> exact_asset then raise exception 'exact_reference_failed'; end if;
  if public.vh_set_conversation_reference(a,c_limit,exact_asset) <> exact_asset then raise exception 'same_reference_retry_failed'; end if;
  begin
    perform public.vh_set_conversation_reference(a,'c3a21000-0000-4000-8000-000000000003',over_asset);
    raise exception 'over_reference_setup_wrong';
  exception when others then
    if position('conversation_not_found' in sqlerrm)=0 then raise; end if;
  end;
  insert into public.vh_conversations(id,account_id,title) values('c3a21000-0000-4000-8000-000000000003',a,'Reference over');
  begin
    perform public.vh_set_conversation_reference(a,'c3a21000-0000-4000-8000-000000000003',over_asset);
    raise exception 'reference_over_20mib_accepted';
  exception when others then if position('conversation_reference_bytes_exceeded' in sqlerrm)=0 then raise; end if; end;

  perform public.vh_set_conversation_reference(a,c_immut,first_asset);
  select permanent_reference_set_at into marker from public.vh_conversations where id=c_immut;
  begin
    perform public.vh_set_conversation_reference(a,c_immut,second_asset);
    raise exception 'reference_replacement_accepted';
  exception when others then if position('conversation_reference_immutable' in sqlerrm)=0 then raise; end if; end;

  update public.vh_library_assets set trashed_at=now(),purge_after=now()+interval '30 days' where id=first_asset;
  select permanent_reference_tombstone->>'status' into tomb from public.vh_conversations where id=c_immut;
  if tomb <> 'TRASHED' then raise exception 'reference_trash_state_wrong'; end if;
  update public.vh_library_assets set trashed_at=null,purge_after=null where id=first_asset;
  select permanent_reference_tombstone->>'status' into tomb from public.vh_conversations where id=c_immut;
  if tomb <> 'ACTIVE' then raise exception 'reference_restore_state_wrong'; end if;
  delete from public.vh_library_assets where id=first_asset;
  select permanent_reference_tombstone->>'status' into tomb from public.vh_conversations where id=c_immut;
  if tomb <> 'PURGED' then raise exception 'reference_purge_state_wrong'; end if;
  if (select permanent_reference_asset_id from public.vh_conversations where id=c_immut) is not null then raise exception 'reference_purge_pointer_not_cleared'; end if;
  if (select permanent_reference_set_at from public.vh_conversations where id=c_immut) is distinct from marker then raise exception 'reference_identity_marker_changed'; end if;
  begin
    perform public.vh_set_conversation_reference(a,c_immut,second_asset);
    raise exception 'post_purge_reference_replacement_accepted';
  exception when others then if position('conversation_reference_immutable' in sqlerrm)=0 then raise; end if; end;
  raise notice 'P3_REFERENCE=PASS exact_bytes=% over_rejected=1 immutable=1 trash_restore_purge=1 post_purge_replacement_rejected=1',20*1024*1024;
end $$;

-- P3-07/P3-08: Message Add-from-Library exactly 5 / 10 MiB, race-safe direct-write guard, owner isolation.
do $$
declare
  a constant uuid := 'c3a00000-0000-4000-8000-000000000001';
  b constant uuid := 'c3b00000-0000-4000-8000-000000000002';
  c constant uuid := 'c3a20000-0000-4000-8000-000000000001';
  m uuid := 'c3a50000-0000-4000-8000-000000000001';
  m_bytes uuid := 'c3a50000-0000-4000-8000-000000000002';
  m_direct uuid := 'c3a50000-0000-4000-8000-000000000003';
  asset uuid;
  first_asset uuid;
  first_link uuid;
  retry_link uuid;
  foreign_asset uuid := 'c3b40000-0000-4000-8000-000000000001';
  big_a uuid := 'c3a41000-0000-4000-8000-000000000001';
  big_b uuid := 'c3a41000-0000-4000-8000-000000000002';
  direct_asset uuid := 'c3a41000-0000-4000-8000-000000000003';
  i integer;
begin
  insert into public.vh_conversation_messages(id,account_id,conversation_id,role,status,plain_text) values
    (m,a,c,'USER','COMPLETED','attachment count'),
    (m_bytes,a,c,'USER','COMPLETED','attachment bytes'),
    (m_direct,a,c,'USER','COMPLETED','attachment direct');
  for i in 1..6 loop
    asset := ('c3a42000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    if i=1 then first_asset := asset; end if;
    perform pg_temp.p3_asset(a,asset,2*1024*1024,'p3-msg-'||i,'Message asset '||i);
    if i <= 5 then perform public.vh_add_message_attachment(a,m,asset); end if;
  end loop;
  if (select count(*) from public.vh_message_attachments where message_id=m) <> 5 then raise exception 'message_attachment_count_wrong'; end if;
  if (select sum(source_size_bytes) from public.vh_message_attachments where message_id=m) <> 10*1024*1024 then raise exception 'message_attachment_bytes_wrong'; end if;
  select id into first_link from public.vh_message_attachments where message_id=m and asset_id=first_asset;
  retry_link := public.vh_add_message_attachment(a,m,first_asset);
  if retry_link <> first_link then raise exception 'message_add_from_library_not_idempotent'; end if;
  begin
    perform public.vh_add_message_attachment(a,m,'c3a42000-0000-4000-8000-000000000006');
    raise exception 'message_sixth_attachment_accepted';
  exception when others then if position('attachment_count_exceeded' in sqlerrm)=0 and position('message_attachment_count_exceeded' in sqlerrm)=0 then raise; end if; end;

  perform pg_temp.p3_asset(a,big_a,6*1024*1024,'p3-msg-big-a','Big A');
  perform pg_temp.p3_asset(a,big_b,5*1024*1024,'p3-msg-big-b','Big B');
  perform public.vh_add_message_attachment(a,m_bytes,big_a);
  begin
    perform public.vh_add_message_attachment(a,m_bytes,big_b);
    raise exception 'message_attachment_over_10mib_accepted';
  exception when others then if position('attachment_bytes_exceeded' in sqlerrm)=0 and position('message_attachment_bytes_exceeded' in sqlerrm)=0 then raise; end if; end;

  perform pg_temp.p3_asset(a,direct_asset,2*1024*1024,'p3-msg-direct','Direct guard');
  begin
    insert into public.vh_message_attachments(account_id,message_id,asset_id,source_size_bytes)
    values(a,m_direct,direct_asset,1);
    raise exception 'direct_size_understatement_accepted';
  exception when others then if position('attachment_size_mismatch' in sqlerrm)=0 then raise; end if; end;

  perform pg_temp.p3_asset(b,foreign_asset,1024,'p3-msg-foreign','Foreign asset');
  begin
    perform public.vh_add_message_attachment(a,m_direct,foreign_asset);
    raise exception 'foreign_message_asset_accepted';
  exception when others then if position('asset_not_found' in sqlerrm)=0 then raise; end if; end;
  raise notice 'P3_MESSAGE_ATTACHMENTS=PASS count=5 bytes=% idempotent_add_from_library=1 direct_understate_rejected=1 cross_owner_rejected=1',10*1024*1024;
end $$;

-- Fast Ask attachment cap uses the same durable aggregate invariant.
do $$
declare
  a constant uuid := 'c3a00000-0000-4000-8000-000000000001';
  f uuid := 'c3a60000-0000-4000-8000-000000000001';
  asset uuid;
  i integer;
begin
  insert into public.vh_fast_ask_sessions(id,account_id,prompt) values(f,a,'Fast Ask attachment fixture');
  for i in 1..6 loop
    asset := ('c3a62000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    perform pg_temp.p3_asset(a,asset,2*1024*1024,'p3-fast-'||i,'Fast asset '||i);
    if i <= 5 then perform public.vh_add_fast_ask_attachment(a,f,asset); end if;
  end loop;
  if (select count(*) from public.vh_fast_ask_attachments where fast_ask_id=f) <> 5 then raise exception 'fast_ask_attachment_count_wrong'; end if;
  if (select sum(source_size_bytes) from public.vh_fast_ask_attachments where fast_ask_id=f) <> 10*1024*1024 then raise exception 'fast_ask_attachment_bytes_wrong'; end if;
  begin
    perform public.vh_add_fast_ask_attachment(a,f,'c3a62000-0000-4000-8000-000000000006');
    raise exception 'fast_ask_sixth_attachment_accepted';
  exception when others then if position('attachment_count_exceeded' in sqlerrm)=0 and position('fast_ask_attachment_count_exceeded' in sqlerrm)=0 then raise; end if; end;
  raise notice 'P3_FAST_ASK_ATTACHMENTS=PASS count=5 bytes=%',10*1024*1024;
end $$;

-- P3 security baseline: every canonical Part-3 table RLS ON; client roles have no DML; service role does.
do $$
declare
  t text;
  tables text[] := array[
    'vh_conversations','vh_conversation_notebooks','vh_conversation_messages','vh_message_attachments','vh_stream_events',
    'vh_conversation_tags','vh_conversation_tag_links','vh_interactive_test_answers','vh_fast_ask_sessions','vh_fast_ask_attachments','vh_tool_runs'
  ];
begin
  foreach t in array tables loop
    if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then
      raise exception 'rls_disabled:%',t;
    end if;
    if has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE')
       or has_table_privilege('authenticated','public.'||t,'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'client_dml_granted:%',t;
    end if;
    if not has_table_privilege('service_role','public.'||t,'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'service_role_dml_missing:%',t;
    end if;
  end loop;
  raise notice 'P3_SECURITY_BASELINE=PASS tables=%',array_length(tables,1);
end $$;

-- Cleanup proves cascades remain usable.
delete from public.vh_accounts where id in (
  'c3a00000-0000-4000-8000-000000000001'::uuid,
  'c3b00000-0000-4000-8000-000000000002'::uuid
);
SQL

echo "PART3_CORE=PASS postgres=16 conversation=pass project=pass notebooks=150 reference=pass attachments=pass fast_ask_attachments=pass security=pass"
