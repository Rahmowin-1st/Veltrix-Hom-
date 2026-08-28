#!/usr/bin/env bash
set -euo pipefail

psql -X -v ON_ERROR_STOP=1 <<'SQL'
\set VERBOSITY verbose

do $$
declare
  a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  p uuid := '11111111-1111-4111-8111-111111111111';
  g1 uuid; g2 uuid; j1 uuid; j1b uuid; art uuid;
  replay1 boolean; replay2 boolean; fp1 text; fp2 text;
  v_ver integer; v_rev bigint;
  caught boolean;
  small_ids jsonb := jsonb_build_array(
    '21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000003',
    '21000000-0000-4000-8000-000000000004','21000000-0000-4000-8000-000000000005','21000000-0000-4000-8000-000000000006');
  big_ids jsonb := jsonb_build_array(
    '22000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000003',
    '22000000-0000-4000-8000-000000000004','22000000-0000-4000-8000-000000000005');
begin
  insert into public.vh_accounts(id,email,status) values(a,'p4-studio-a@example.test','active'),(b,'p4-studio-b@example.test','active') on conflict(id) do nothing;
  insert into public.vh_projects(id,account_id,name,purpose,revision) values(p,a,'Physics Project','Initial project state',1);

  insert into public.vh_library_assets(id,account_id,original_filename,display_title,source_kind,asset_class,original_size_bytes,origin_surface,content_sha256,processing_status,extraction_status,source_revision)
  select id,a,'small-'||n||'.txt','Small '||n,'text','text',1024*1024,'studio-test',encode(digest('small-'||n,'sha256'),'hex'),'READY','READY',1
  from unnest(array[
    '21000000-0000-4000-8000-000000000001'::uuid,'21000000-0000-4000-8000-000000000002'::uuid,'21000000-0000-4000-8000-000000000003'::uuid,
    '21000000-0000-4000-8000-000000000004'::uuid,'21000000-0000-4000-8000-000000000005'::uuid,'21000000-0000-4000-8000-000000000006'::uuid
  ]) with ordinality t(id,n);

  insert into public.vh_library_assets(id,account_id,original_filename,display_title,source_kind,asset_class,original_size_bytes,origin_surface,content_sha256,processing_status,extraction_status,source_revision)
  select id,a,'big-'||n||'.txt','Big '||n,'text','text',5*1024*1024,'studio-test',encode(digest('big-'||n,'sha256'),'hex'),'READY','READY',1
  from unnest(array[
    '22000000-0000-4000-8000-000000000001'::uuid,'22000000-0000-4000-8000-000000000002'::uuid,'22000000-0000-4000-8000-000000000003'::uuid,
    '22000000-0000-4000-8000-000000000004'::uuid,'22000000-0000-4000-8000-000000000005'::uuid
  ]) with ordinality t(id,n);

  select generation_id,job_id,replayed,resolved_context_fingerprint into g1,j1,replay1,fp1
  from public.vh_create_studio_generation(a,null::uuid,'summary',1,'idem-live-1','Summarize',
    jsonb_build_array(jsonb_build_object('kind','project','targetId',p::text)),jsonb_build_array('21000000-0000-4000-8000-000000000001'));
  if replay1 or g1 is null or j1 is null or fp1 is null then raise exception 'P4_STUDIO_CREATE_FAILED'; end if;

  select generation_id,job_id,replayed,resolved_context_fingerprint into g2,j1b,replay2,fp2
  from public.vh_create_studio_generation(a,null::uuid,'summary',1,'idem-live-1','Summarize',
    jsonb_build_array(jsonb_build_object('kind','project','targetId',p::text)),jsonb_build_array('21000000-0000-4000-8000-000000000001'));
  if not replay2 or g2<>g1 or j1b<>j1 or fp2<>fp1 then raise exception 'P4_STUDIO_IDEMPOTENT_REPLAY_FAILED'; end if;

  caught:=false;
  begin
    perform * from public.vh_create_studio_generation(a,null::uuid,'summary',1,'idem-live-1','DIFFERENT',
      jsonb_build_array(jsonb_build_object('kind','project','targetId',p::text)),'[]'::jsonb);
  exception when others then caught:=true; end;
  if not caught then raise exception 'P4_STUDIO_IDEMPOTENCY_CONFLICT_NOT_ENFORCED'; end if;

  update public.vh_projects set purpose='Latest project state',revision=revision+1,updated_at=now()+interval '1 second' where id=p and account_id=a;
  select generation_id,job_id,replayed,resolved_context_fingerprint into g2,j1b,replay2,fp2
  from public.vh_create_studio_generation(a,null::uuid,'summary',1,'idem-live-2','Summarize',
    jsonb_build_array(jsonb_build_object('kind','project','targetId',p::text)),jsonb_build_array('21000000-0000-4000-8000-000000000001'));
  if replay2 or fp2=fp1 then raise exception 'P4_STUDIO_LIVE_BINDING_DID_NOT_RESOLVE_LATEST'; end if;

  caught:=false;
  begin
    perform * from public.vh_create_studio_generation(b,null::uuid,'summary',1,'idem-cross-user','No leak',
      jsonb_build_array(jsonb_build_object('kind','project','targetId',p::text)),'[]'::jsonb);
  exception when others then caught:=true; end;
  if not caught then raise exception 'P4_STUDIO_CROSS_USER_BINDING_ALLOWED'; end if;

  caught:=false;
  begin
    perform * from public.vh_create_studio_generation(a,null::uuid,'summary',1,'idem-six','limit','[]'::jsonb,small_ids);
  exception when others then caught:=true; end;
  if not caught then raise exception 'P4_STUDIO_6_ATTACHMENTS_ALLOWED'; end if;

  caught:=false;
  begin
    perform * from public.vh_create_studio_generation(a,null::uuid,'summary',1,'idem-25mb','limit','[]'::jsonb,big_ids);
  exception when others then caught:=true; end;
  if not caught then raise exception 'P4_STUDIO_OVER_20MB_ALLOWED'; end if;

  art := public.vh_create_studio_artifact_from_generation(a,g2,'Latest Summary',jsonb_build_object('sections',jsonb_build_array(jsonb_build_object('heading','H','text','T'))),null,jsonb_build_object('proof','stage30'));
  if art is null then raise exception 'P4_STUDIO_ARTIFACT_CREATE_FAILED'; end if;

  select version_no,new_revision into v_ver,v_rev from public.vh_append_studio_artifact_version(a,art,1,'USER_EDIT',jsonb_build_object('sections',jsonb_build_array(jsonb_build_object('heading','H2','text','T2'))),null,null,'{}'::jsonb);
  if v_ver<>2 or v_rev<>2 then raise exception 'P4_STUDIO_VERSION_APPEND_FAILED'; end if;

  caught:=false;
  begin
    perform * from public.vh_append_studio_artifact_version(a,art,1,'USER_EDIT','{}'::jsonb,null,null,'{}'::jsonb);
  exception when others then caught:=true; end;
  if not caught then raise exception 'P4_STUDIO_STALE_EDIT_OVERWROTE_NEWER_STATE'; end if;

  if (select count(*) from public.vh_studio_artifact_versions where account_id=a and artifact_id=art)<>2 then raise exception 'P4_STUDIO_VERSION_HISTORY_INCORRECT'; end if;
  if not exists(select 1 from public.vh_jobs where id=j1 and account_id=a and kind='studio.generate') then raise exception 'P4_STUDIO_JOB_NOT_BACKED'; end if;
  if (select count(*) from public.vh_studio_artifact_registry where active)<14 then raise exception 'P4_STUDIO_REGISTRY_LT_14'; end if;

  raise notice 'P4_STUDIO_LIVE_BINDING=PASS before=% after=%',fp1,fp2;
  raise notice 'P4_STUDIO_IDEMPOTENCY=PASS generation=% job=%',g1,j1;
  raise notice 'P4_STUDIO_LIMITS=PASS max_count=5 max_combined_bytes=20971520';
  raise notice 'P4_STUDIO_ISOLATION=PASS';
  raise notice 'P4_STUDIO_VERSIONS=PASS artifact=% versions=2',art;
end $$;

select 'P4_STUDIO_REGISTRY=PASS count=' || count(*) from public.vh_studio_artifact_registry where active;
select 'P4_STAGE30_STUDIO=PASS';
SQL
