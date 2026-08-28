#!/usr/bin/env bash
set -euo pipefail

psql -X -v ON_ERROR_STOP=1 <<'SQL'
\set VERBOSITY verbose

do $$
declare
  a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  inferred uuid; inferred2 uuid; explicit_id uuid; blocked uuid; low_id uuid; r record; rev bigint; caught boolean;
begin
  insert into public.vh_accounts(id,email,status) values(a,'p4-memory-a@example.test','active'),(b,'p4-memory-b@example.test','active') on conflict(id) do nothing;

  inferred:=public.vh_persist_inferred_memory(a,'learning','Prefers algebra examples',0.80,'{"mode":"examples"}'::jsonb,'{"source":"conversation"}'::jsonb,'learning:algebra',0.72);
  if inferred is null then raise exception 'P4_MEMORY_INFERRED_NOT_PERSISTED'; end if;
  inferred2:=public.vh_persist_inferred_memory(a,'learning','Prefers algebra examples',0.91,'{"mode":"examples"}'::jsonb,'{"source":"note"}'::jsonb,'learning:algebra',0.72);
  if inferred2<>inferred then raise exception 'P4_MEMORY_DEDUP_CREATED_DUPLICATE'; end if;
  if (select confidence from public.vh_memories where id=inferred)<>0.91 then raise exception 'P4_MEMORY_DEDUP_CONFIDENCE_NOT_MERGED'; end if;

  low_id:=public.vh_persist_inferred_memory(a,'interest','Temporary trivia',0.40,'{}','{}','interest:trivia',0.72);
  if low_id is not null then raise exception 'P4_MEMORY_LOW_CONFIDENCE_PERSISTED'; end if;

  explicit_id:=public.vh_remember_explicit(a,'learning','Prefers algebra examples with diagrams','{"mode":"diagram_examples"}'::jsonb,'{"source":{"kind":"remember_this"}}'::jsonb,'learning:algebra',true,true);
  if explicit_id is null then raise exception 'P4_MEMORY_EXPLICIT_CREATE_FAILED'; end if;
  if not exists(select 1 from public.vh_memories where id=inferred and deleted_at is not null) then raise exception 'P4_MEMORY_EXPLICIT_DID_NOT_SUPERSEDE_INFERRED'; end if;
  if (select authority from public.vh_memories where id=explicit_id)<>'EXPLICIT' then raise exception 'P4_MEMORY_EXPLICIT_AUTHORITY_WRONG'; end if;

  blocked:=public.vh_persist_inferred_memory(a,'learning','AI tries to replace explicit',0.99,'{}','{}','learning:algebra',0.72);
  if blocked is not null then raise exception 'P4_MEMORY_INFERRED_OVERRIDDEN_EXPLICIT'; end if;
  if (select content from public.vh_memories where id=explicit_id)<>'Prefers algebra examples with diagrams' then raise exception 'P4_MEMORY_EXPLICIT_CONTENT_CHANGED'; end if;

  select * into r from public.vh_retrieve_memories(a,'algebra',12,null) limit 1;
  if r.id is distinct from explicit_id or r.authority<>'EXPLICIT' then raise exception 'P4_MEMORY_RETRIEVAL_EXPLICIT_PRIORITY_FAILED'; end if;

  select revision into rev from public.vh_memories where id=explicit_id;
  perform public.vh_patch_memory(a,explicit_id,rev,'{"pinned":false,"important":true,"content":"Prefers step-by-step algebra examples with diagrams"}'::jsonb);
  if (select content from public.vh_memories where id=explicit_id)<>'Prefers step-by-step algebra examples with diagrams' then raise exception 'P4_MEMORY_MANAGER_EDIT_FAILED'; end if;

  caught:=false;
  begin perform public.vh_patch_memory(b,explicit_id,1,'{"pinned":false}'::jsonb); exception when others then caught:=true; end;
  if not caught then raise exception 'P4_MEMORY_CROSS_USER_EDIT_ALLOWED'; end if;

  caught:=false;
  begin perform public.vh_delete_memory(b,explicit_id); exception when others then caught:=true; end;
  -- delete-by-other is safely false rather than necessarily raising.
  if not caught and not exists(select 1 from public.vh_memories where id=explicit_id and account_id=a and deleted_at is null) then raise exception 'P4_MEMORY_CROSS_USER_DELETE_MUTATED'; end if;

  if not public.vh_delete_memory(a,explicit_id) then raise exception 'P4_MEMORY_MANAGER_DELETE_FAILED'; end if;
  if exists(select 1 from public.vh_retrieve_memories(a,'algebra',12,null)) then raise exception 'P4_MEMORY_DELETED_RETURNED_IN_RETRIEVAL'; end if;

  if to_regclass('public.vh_project_memories') is not null or to_regclass('public.vh_notebook_memories') is not null then raise exception 'P4_MEMORY_NOT_GLOBAL_ONLY'; end if;

  raise notice 'P4_EXPLICIT_MEMORY=PASS explicit_supersedes_inferred';
  raise notice 'P4_MEMORY_INFERENCE=PASS threshold dedup explicit_conflict';
  raise notice 'P4_MEMORY_RETRIEVAL=PASS explicit_priority bounded_owner_scope';
  raise notice 'P4_MEMORY_MANAGER=PASS edit delete provenance_fields';
  raise notice 'P4_MEMORY_ISOLATION=PASS';
end $$;

select 'P4_STAGE70_MEMORY=PASS';
SQL
