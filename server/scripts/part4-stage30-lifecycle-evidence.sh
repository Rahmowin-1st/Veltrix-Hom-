#!/usr/bin/env bash
set -euo pipefail

psql -X -v ON_ERROR_STOP=1 <<'SQL'
\set VERBOSITY verbose

do $$
declare
  a constant uuid := 'a3100000-0000-4000-8000-000000000001';
  b constant uuid := 'b3100000-0000-4000-8000-000000000002';
  p constant uuid := 'c3100000-0000-4000-8000-000000000003';
  g1 uuid; j1 uuid; art uuid; dup uuid; rg uuid; rj uuid; rg2 uuid; rj2 uuid; vg uuid; vj uuid;
  replay boolean; replay2 boolean; fp1 text; rfp text; rfp2 text; vfp text;
  vno integer; rev bigint; renamed_rev bigint; before_rev bigint; before_ver integer;
  caught boolean; source_kind text; dup_source_kind text; dup_content jsonb;
begin
  insert into public.vh_accounts(id,email,status)
  values(a,'p4-lifecycle-a@example.test','active'),(b,'p4-lifecycle-b@example.test','active')
  on conflict(id) do nothing;
  insert into public.vh_projects(id,account_id,name,purpose,revision)
  values(p,a,'Lifecycle Project','Original source state',1);

  select generation_id,job_id,replayed,resolved_context_fingerprint
    into g1,j1,replay,fp1
  from public.vh_create_studio_generation(
    a,null,'summary',1,'lifecycle-origin','Create summary',
    jsonb_build_array(jsonb_build_object('kind','project','targetId',p::text)),
    '[]'::jsonb
  );
  if replay or g1 is null or j1 is null or fp1 is null then raise exception 'P4_LIFECYCLE_ORIGIN_CREATE_FAILED'; end if;

  art:=public.vh_create_studio_artifact_from_generation(
    a,g1,'Lifecycle Summary',
    jsonb_build_object('sections',jsonb_build_array(jsonb_build_object('heading','Initial','text','Version one'))),
    null,jsonb_build_object('proof','lifecycle-origin')
  );
  if art is null then raise exception 'P4_LIFECYCLE_ARTIFACT_CREATE_FAILED'; end if;

  select version_no,new_revision into vno,rev from public.vh_append_studio_artifact_version(
    a,art,1,'USER_EDIT',
    jsonb_build_object('sections',jsonb_build_array(jsonb_build_object('heading','Edited','text','Version two'))),
    null,null,jsonb_build_object('proof','user-edit')
  );
  if vno<>2 or rev<>2 then raise exception 'P4_LIFECYCLE_USER_EDIT_FAILED'; end if;

  renamed_rev:=public.vh_rename_studio_artifact(a,art,2,'Renamed Lifecycle Summary');
  if renamed_rev<>3 or (select title from public.vh_studio_artifacts where id=art)<>'Renamed Lifecycle Summary' then
    raise exception 'P4_STUDIO_RENAME_FAILED';
  end if;
  caught:=false;
  begin perform public.vh_rename_studio_artifact(a,art,2,'Stale rename'); exception when sqlstate '40001' then caught:=true; end;
  if not caught then raise exception 'P4_STUDIO_STALE_RENAME_ALLOWED'; end if;

  dup:=public.vh_duplicate_studio_artifact(a,art,'Lifecycle Copy');
  if dup is null or dup=art then raise exception 'P4_STUDIO_DUPLICATE_FAILED'; end if;
  select v.source_kind,v.content into dup_source_kind,dup_content
  from public.vh_studio_artifacts da join public.vh_studio_artifact_versions v
    on v.artifact_id=da.id and v.account_id=da.account_id and v.version_no=da.current_version
  where da.id=dup and da.account_id=a;
  select v.source_kind into source_kind from public.vh_studio_artifact_versions v
  where v.artifact_id=art and v.account_id=a and v.version_no=2;
  if dup_source_kind is distinct from source_kind
     or dup_content is distinct from jsonb_build_object('sections',jsonb_build_array(jsonb_build_object('heading','Edited','text','Version two')))
     or not exists(select 1 from public.vh_studio_artifact_versions v where v.artifact_id=dup and v.account_id=a and v.provenance->>'operation'='DUPLICATE' and v.provenance->>'sourceArtifactId'=art::text) then
    raise exception 'P4_STUDIO_DUPLICATE_PROVENANCE_FAILED';
  end if;

  update public.vh_projects set purpose='Latest source state after artifact creation',revision=revision+1,updated_at=now()+interval '1 second'
  where id=p and account_id=a;
  select revision,current_version into before_rev,before_ver from public.vh_studio_artifacts where id=art and account_id=a;

  select generation_id,job_id,replayed,resolved_context_fingerprint
    into rg,rj,replay,rfp
  from public.vh_create_studio_revision_generation(a,art,'regen-1','REGENERATE',null);
  if replay or rg is null or rj is null or rfp is null or rfp=fp1 then raise exception 'P4_STUDIO_REGENERATE_LATEST_BINDING_FAILED'; end if;
  if not exists(select 1 from public.vh_studio_generations where id=rg and account_id=a and target_artifact_id=art and generation_mode='REGENERATE') then raise exception 'P4_STUDIO_REGENERATE_TARGET_FAILED'; end if;
  if not exists(select 1 from public.vh_jobs where id=rj and account_id=a and kind='studio.revise' and state='queued') then raise exception 'P4_STUDIO_REGENERATE_JOB_FAILED'; end if;
  if exists(select 1 from public.vh_studio_artifacts where id=art and account_id=a and (revision<>before_rev or current_version<>before_ver)) then raise exception 'P4_STUDIO_REGENERATE_MUTATED_BEFORE_WORKER'; end if;

  select generation_id,job_id,replayed,resolved_context_fingerprint
    into rg2,rj2,replay2,rfp2
  from public.vh_create_studio_revision_generation(a,art,'regen-1','REGENERATE',null);
  if not replay2 or rg2<>rg or rj2<>rj or rfp2<>rfp then raise exception 'P4_STUDIO_REGENERATE_REPLAY_FAILED'; end if;

  select generation_id,job_id,replayed,resolved_context_fingerprint
    into vg,vj,replay,vfp
  from public.vh_create_studio_revision_generation(a,art,'revise-1','REVISE','Make it shorter and emphasize the newest source state');
  if replay or vg is null or vj is null or vfp<>rfp then raise exception 'P4_STUDIO_REVISE_CREATE_FAILED'; end if;
  if not exists(select 1 from public.vh_studio_generations where id=vg and account_id=a and target_artifact_id=art and generation_mode='REVISE' and prompt='Make it shorter and emphasize the newest source state') then
    raise exception 'P4_STUDIO_REVISE_PROMPT_FAILED';
  end if;
  if not exists(select 1 from public.vh_jobs where id=vj and account_id=a and kind='studio.revise' and state='queued') then raise exception 'P4_STUDIO_REVISE_JOB_FAILED'; end if;

  caught:=false;
  begin perform public.vh_rename_studio_artifact(b,art,3,'Foreign rename'); exception when others then caught:=true; end;
  if not caught then raise exception 'P4_STUDIO_FOREIGN_RENAME_ALLOWED'; end if;
  caught:=false;
  begin perform public.vh_duplicate_studio_artifact(b,art,'Foreign copy'); exception when others then caught:=true; end;
  if not caught then raise exception 'P4_STUDIO_FOREIGN_DUPLICATE_ALLOWED'; end if;
  caught:=false;
  begin perform * from public.vh_create_studio_revision_generation(b,art,'foreign-regen','REGENERATE',null); exception when others then caught:=true; end;
  if not caught then raise exception 'P4_STUDIO_FOREIGN_REVISION_ALLOWED'; end if;

  raise notice 'P4_STUDIO_RENAME=PASS optimistic_concurrency=true';
  raise notice 'P4_STUDIO_DUPLICATE=PASS current_version_provenance=true';
  raise notice 'P4_STUDIO_REGENERATE=PASS latest_live_context=true idempotent=true queued_no_mutation=true';
  raise notice 'P4_STUDIO_REVISE=PASS prompt_revision_queued=true';
  raise notice 'P4_STUDIO_LIFECYCLE_ISOLATION=PASS';
end $$;

select 'P4_STAGE30_LIFECYCLE=PASS';
SQL
