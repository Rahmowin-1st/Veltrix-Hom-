#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:?PGPORT is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${PGDATABASE:?PGDATABASE is required}"

PSQL=(psql -X -v ON_ERROR_STOP=1)

echo "PART2_ACCEPTANCE_BEGIN"
"${PSQL[@]}" <<'SQL'
\set VERBOSITY terse

delete from public.vh_accounts where id in (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid
);
insert into public.vh_accounts(id,email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','part2-a@example.invalid'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','part2-b@example.invalid');

create or replace function pg_temp.make_asset(
  p_account uuid,
  p_id uuid,
  p_size bigint,
  p_seed text,
  p_title text,
  p_class text default 'file',
  p_kind text default 'text',
  p_status text default 'READY'
) returns void language plpgsql as $$
begin
  insert into public.vh_library_assets(
    id,account_id,original_filename,display_title,declared_mime,detected_mime,
    source_kind,asset_class,original_size_bytes,origin_surface,content_sha256,
    processing_status,extraction_status,provenance
  ) values (
    p_id,p_account,p_title||'.bin',p_title,'text/plain','text/plain',p_kind,p_class,
    p_size,'acceptance',encode(digest(p_seed,'sha256'),'hex'),p_status,
    case when p_status='READY' then 'READY' else 'PENDING' end,
    jsonb_build_object('fixture',true)
  );
end $$;

do $$
declare p uuid := 'aaaaaaaa-1000-4000-8000-000000000001';
begin
  insert into public.vh_projects(id,account_id,name,purpose) values(p,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','Physics Project','Acceptance fixture');
  update public.vh_projects set name='Physics Project 2',revision=revision+1,updated_at=now() where id=p and account_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  if not exists(select 1 from public.vh_projects where id=p and name='Physics Project 2' and revision=2) then raise exception 'project_crud_failed'; end if;
  begin
    insert into public.vh_projects(account_id,name) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','   ');
    raise exception 'blank_project_name_accepted';
  exception when check_violation then null; end;
  insert into public.vh_idempotency(account_id,route,idempotency_key,request_hash)
    values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','/api/v1/projects','same-key',repeat('a',64));
  begin
    insert into public.vh_idempotency(account_id,route,idempotency_key,request_hash)
      values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','/api/v1/projects','same-key',repeat('a',64));
    raise exception 'idempotency_duplicate_accepted';
  exception when unique_violation then null; end;
  raise notice 'P2_PROJECT_CRUD_IDEMPOTENCY=PASS';
end $$;

do $$
declare
  a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  p_count uuid := 'aaaaaaaa-2000-4000-8000-000000000001';
  p_bytes uuid := 'aaaaaaaa-2000-4000-8000-000000000002';
  asset uuid;
  i int;
  kept uuid := 'aaaaaaaa-3000-4000-8000-000000000100';
begin
  insert into public.vh_projects(id,account_id,name) values(p_count,a,'Ref Count'),(p_bytes,a,'Ref Bytes');
  for i in 1..21 loop
    asset := ('aaaaaaaa-3000-4000-8000-' || lpad(i::text,12,'0'))::uuid;
    perform pg_temp.make_asset(a,asset,1,'count-'||i,'Count '||i);
    if i <= 20 then perform public.vh_add_project_reference(a,p_count,asset); end if;
  end loop;
  asset := 'aaaaaaaa-3000-4000-8000-000000000021';
  begin
    perform public.vh_add_project_reference(a,p_count,asset);
    raise exception 'reference_21_accepted';
  exception when others then if position('project_reference_count_exceeded' in sqlerrm)=0 then raise; end if; end;
  if (select count(*) from public.vh_project_references where project_id=p_count) <> 20 then raise exception 'reference_count_wrong'; end if;

  perform pg_temp.make_asset(a,kept,49*1024*1024,'bytes-49','Bytes 49');
  perform pg_temp.make_asset(a,'aaaaaaaa-3000-4000-8000-000000000101',1*1024*1024,'bytes-1a','Bytes 1A');
  perform pg_temp.make_asset(a,'aaaaaaaa-3000-4000-8000-000000000102',1*1024*1024,'bytes-1b','Bytes 1B');
  perform public.vh_add_project_reference(a,p_bytes,kept);
  perform public.vh_add_project_reference(a,p_bytes,'aaaaaaaa-3000-4000-8000-000000000101');
  if (select sum(source_size_bytes) from public.vh_project_references where project_id=p_bytes) <> 50*1024*1024 then raise exception 'reference_50mib_wrong'; end if;
  begin
    perform public.vh_add_project_reference(a,p_bytes,'aaaaaaaa-3000-4000-8000-000000000102');
    raise exception 'reference_over_50mib_accepted';
  exception when others then if position('project_reference_bytes_exceeded' in sqlerrm)=0 then raise; end if; end;
  delete from public.vh_project_references where project_id=p_bytes and asset_id=kept;
  if not exists(select 1 from public.vh_library_assets where id=kept) then raise exception 'reference_remove_deleted_library_asset'; end if;
  raise notice 'P2_PROJECT_REFERENCE_BOUNDARIES=PASS';
end $$;

do $$
declare
  a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  aa uuid := 'aaaaaaaa-4000-4000-8000-000000000001';
  bb uuid := 'bbbbbbbb-4000-4000-8000-000000000001';
  r uuid;
begin
  perform pg_temp.make_asset(a,aa,1234,'shared-hash','Dedup A');
  perform pg_temp.make_asset(b,bb,1234,'shared-hash','Dedup B');
  begin
    perform pg_temp.make_asset(a,'aaaaaaaa-4000-4000-8000-000000000002',1234,'shared-hash','Dedup A duplicate');
    raise exception 'same_owner_dedup_constraint_missing';
  exception when unique_violation then null; end;
  insert into public.vh_asset_usages(account_id,asset_id,origin_surface,context_kind,context_id)
    values(a,aa,'library','project','aaaaaaaa-1000-4000-8000-000000000001');
  begin
    insert into public.vh_asset_usages(account_id,asset_id,origin_surface,context_kind,context_id)
      values(a,aa,'library','project','aaaaaaaa-1000-4000-8000-000000000001');
    raise exception 'usage_dedup_constraint_missing';
  exception when unique_violation then null; end;

  insert into public.vh_quota_usage(account_id,scope,bytes_used,bytes_reserved) values(a,'library',900*1024*1024,0)
    on conflict(account_id,scope) do update set bytes_used=excluded.bytes_used,bytes_reserved=0;
  r := public.vh_reserve_quota(a,'library',124*1024*1024,1024*1024*1024);
  perform public.vh_finalize_quota_reservation(r,false);
  begin
    perform public.vh_reserve_quota(a,'library',125*1024*1024,1024*1024*1024);
    raise exception 'library_over_1gib_accepted';
  exception when others then if position('quota_exceeded' in sqlerrm)=0 then raise; end if; end;
  raise notice 'P2_LIBRARY_DEDUP_QUOTA=PASS warning_boundary=% hard=%',900*1024*1024,1024*1024*1024;
end $$;

do $$
declare
  a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  x1 uuid := 'aaaaaaaa-5000-4000-8000-000000000001';
  x2 uuid := 'aaaaaaaa-5000-4000-8000-000000000002';
  x3 uuid := 'aaaaaaaa-5000-4000-8000-000000000003';
  tag1 uuid := 'aaaaaaaa-5100-4000-8000-000000000001';
  tag2 uuid := 'aaaaaaaa-5100-4000-8000-000000000002';
  col uuid := 'aaaaaaaa-5200-4000-8000-000000000001';
  p uuid := 'aaaaaaaa-5300-4000-8000-000000000001';
  cursor_ts timestamptz;
  cursor_id uuid;
  second_count int;
begin
  perform pg_temp.make_asset(a,x1,100,'query-1','Alpha Notes','file','text');
  perform pg_temp.make_asset(a,x2,200,'query-2','Beta Notes','image','image');
  perform pg_temp.make_asset(a,x3,300,'query-3','Gamma Notes','text','text');
  update public.vh_library_assets set created_at='2026-08-25 10:00:00+00',updated_at='2026-08-25 10:00:00+00' where id=x1;
  update public.vh_library_assets set created_at='2026-08-25 10:00:01+00',updated_at='2026-08-25 10:00:01+00',favorite=true where id=x2;
  update public.vh_library_assets set created_at='2026-08-25 10:00:02+00',updated_at='2026-08-25 10:00:02+00' where id=x3;
  insert into public.vh_library_tags(id,account_id,name,normalized_name) values(tag1,a,'Science','science'),(tag2,a,'Exam','exam');
  begin
    insert into public.vh_library_tags(account_id,name,normalized_name) values(a,'SCIENCE','science');
    raise exception 'normalized_duplicate_tag_accepted';
  exception when unique_violation then null; end;
  insert into public.vh_library_asset_tags(account_id,asset_id,tag_id) values(a,x1,tag1),(a,x1,tag2),(a,x2,tag1);
  insert into public.vh_library_collections(id,account_id,name) values(col,a,'Files and images');
  perform public.vh_add_collection_asset(a,col,x1,2);
  perform public.vh_add_collection_asset(a,col,x2,1);
  begin
    perform public.vh_add_collection_asset(a,col,x3,3);
    raise exception 'text_asset_collection_accepted';
  exception when others then if position('collection_asset_type_not_allowed' in sqlerrm)=0 then raise; end if; end;
  insert into public.vh_projects(id,account_id,name) values(p,a,'Library Link');
  perform public.vh_add_project_reference(a,p,x1);

  if (select count(*) from public.vh_query_library_assets(p_account_id=>a,p_tag_ids=>array[tag1,tag2],p_limit=>20)) <> 1 then raise exception 'tag_all_filter_wrong'; end if;
  if (select count(*) from public.vh_query_library_assets(p_account_id=>a,p_collection_id=>col,p_limit=>20)) <> 2 then raise exception 'collection_filter_wrong'; end if;
  if (select count(*) from public.vh_query_library_assets(p_account_id=>a,p_favorite=>true,p_limit=>20)) <> 1 then raise exception 'favorite_filter_wrong'; end if;
  if (select count(*) from public.vh_query_library_assets(p_account_id=>a,p_linked=>false,p_limit=>20)) < 1 then raise exception 'linked_false_filter_empty'; end if;
  if (select count(*) from public.vh_query_library_assets(p_account_id=>a,p_unsorted=>true,p_limit=>20)) < 1 then raise exception 'unsorted_filter_empty'; end if;
  select q.sort_ts,q.id into cursor_ts,cursor_id from public.vh_query_library_assets(p_account_id=>a,p_sort=>'created',p_dir=>'asc',p_limit=>2) q order by q.sort_ts,q.id limit 1 offset 1;
  select count(*) into second_count from public.vh_query_library_assets(p_account_id=>a,p_sort=>'created',p_dir=>'asc',p_cursor_ts=>cursor_ts,p_cursor_id=>cursor_id,p_limit=>100) q where (q.sort_ts,q.id) <= (cursor_ts,cursor_id);
  if second_count <> 0 then raise exception 'keyset_cursor_overlap'; end if;
  if (select count(*) from public.vh_query_library_assets(p_account_id=>a,p_q=>'Alpha',p_limit=>20)) <> 1 then raise exception 'library_search_wrong'; end if;
  if not exists(select 1 from public.vh_library_assets where id=x1) then raise exception 'add_from_library_reuploaded_or_deleted_asset'; end if;
  raise notice 'P2_LIBRARY_QUERY_TAG_COLLECTION=PASS';
end $$;

do $$
declare
  a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  n1 uuid := 'aaaaaaaa-6000-4000-8000-000000000001';
  n2 uuid := 'aaaaaaaa-6000-4000-8000-000000000002';
  p uuid := 'aaaaaaaa-6100-4000-8000-000000000001';
  s1 uuid := 'aaaaaaaa-6200-4000-8000-000000000001';
  s2 uuid := 'aaaaaaaa-6200-4000-8000-000000000002';
  foreign_asset uuid := 'bbbbbbbb-6200-4000-8000-000000000001';
  j uuid := 'aaaaaaaa-6300-4000-8000-000000000001';
  source_id uuid;
begin
  insert into public.vh_notebooks(id,account_id,name) values(n1,a,'Notebook A'),(n2,a,'Notebook B');
  insert into public.vh_projects(id,account_id,name) values(p,a,'Notebook Project');
  perform pg_temp.make_asset(a,s1,1024,'source-1','Source One');
  perform pg_temp.make_asset(a,s2,1024,'source-2','Source Two');
  perform pg_temp.make_asset(b,foreign_asset,1024,'foreign-source','Foreign Source');
  source_id := public.vh_add_notebook_source(a,n1,s1,1,2048,'library','{"origin":"acceptance"}'::jsonb);
  if public.vh_add_notebook_source(a,n1,s1,1,2048,'library','{}'::jsonb) <> source_id then raise exception 'notebook_source_not_idempotent'; end if;
  begin
    perform public.vh_add_notebook_source(a,n1,s2,1,2048,'library','{}'::jsonb);
    raise exception 'notebook_source_count_limit_missing';
  exception when others then if position('notebook_source_count_exceeded' in sqlerrm)=0 then raise; end if; end;
  begin
    perform public.vh_add_notebook_source(a,n2,s2,5,512,'library','{}'::jsonb);
    raise exception 'notebook_source_bytes_limit_missing';
  exception when others then if position('notebook_source_bytes_exceeded' in sqlerrm)=0 then raise; end if; end;
  begin
    perform public.vh_add_notebook_source(a,n2,foreign_asset,5,4096,'library','{}'::jsonb);
    raise exception 'foreign_notebook_source_accepted';
  exception when others then if position('asset_not_found' in sqlerrm)=0 then raise; end if; end;

  insert into public.vh_project_notebooks(account_id,project_id,notebook_id) values(a,p,n1) on conflict do nothing;
  insert into public.vh_project_notebooks(account_id,project_id,notebook_id) values(a,p,n1) on conflict do nothing;
  if (select count(*) from public.vh_project_notebooks where project_id=p and notebook_id=n1) <> 1 then raise exception 'project_notebook_duplicate'; end if;

  insert into public.vh_source_chunks(account_id,asset_id,source_revision,chunk_index,content,locator,text_range,content_hash,extraction_version)
    values(a,s1,1,0,'velocity acceleration force','{"page":7,"section":"Mechanics"}', '{"start":0,"end":27}', encode(digest('chunk-a','sha256'),'hex'),'accept-v1');
  insert into public.vh_source_chunks(account_id,asset_id,source_revision,chunk_index,content,locator,text_range,content_hash,extraction_version)
    values(a,s2,1,0,'velocity hidden disabled','{"page":99}', '{"start":0,"end":24}', encode(digest('chunk-b','sha256'),'hex'),'accept-v1');
  perform public.vh_add_notebook_source(a,n2,s2,5,4096,'library','{}'::jsonb);
  update public.vh_notebook_sources set enabled=false where notebook_id=n2 and asset_id=s2;
  if (select count(*) from public.vh_search_notebook_chunks_scoped(a,n1,'velocity',null,12)) <> 1 then raise exception 'grounded_retrieval_wrong'; end if;
  if (select count(*) from public.vh_search_notebook_chunks_scoped(a,n1,'velocity',array[s2],12)) <> 0 then raise exception 'selected_source_scope_escape'; end if;
  if (select count(*) from public.vh_search_notebook_chunks_scoped(a,n2,'velocity',null,12)) <> 0 then raise exception 'disabled_source_retrieved'; end if;
  if exists(select 1 from public.vh_search_notebook_chunks_scoped(b,n1,'velocity',null,12)) then raise exception 'cross_owner_retrieval_leak'; end if;
  if not exists(select 1 from public.vh_source_chunks where asset_id=s1 and locator->>'page'='7' and text_range->>'start'='0' and extraction_version='accept-v1' and length(content_hash)=64) then raise exception 'citation_provenance_incomplete'; end if;

  insert into public.vh_jobs(id,account_id,kind,payload,state) values(j,a,'part2.source.process',jsonb_build_object('assetId',s1),'queued');
  update public.vh_library_assets set processing_status='PROCESSING',extraction_status='PROCESSING' where id=s1;
  update public.vh_jobs set state='failed' where id=j;
  if not exists(select 1 from public.vh_library_assets where id=s1 and processing_status='FAILED' and extraction_status='FAILED' and safe_failure_code='SOURCE_PROCESS_FAILED') then raise exception 'source_failure_sync_missing'; end if;
  if exists(select 1 from public.vh_source_chunks where asset_id=s1) then raise exception 'failed_source_chunks_not_cleaned'; end if;
  raise notice 'P2_NOTEBOOK_PROCESS_RETRIEVAL=PASS';
end $$;

do $$
declare
  a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  n uuid := 'aaaaaaaa-7000-4000-8000-000000000001';
  asset uuid := 'aaaaaaaa-7100-4000-8000-000000000001';
  foreign_asset uuid := 'bbbbbbbb-7100-4000-8000-000000000001';
  sess_fast uuid := 'aaaaaaaa-7200-4000-8000-000000000001';
  sess_deep uuid := 'aaaaaaaa-7200-4000-8000-000000000002';
  cand uuid := 'aaaaaaaa-7300-4000-8000-000000000001';
  job uuid := 'aaaaaaaa-7400-4000-8000-000000000001';
  foreign_job uuid := 'bbbbbbbb-7400-4000-8000-000000000001';
begin
  insert into public.vh_notebooks(id,account_id,name) values(n,a,'Research Notebook');
  perform pg_temp.make_asset(a,asset,2048,'research-asset','Research Accepted');
  perform pg_temp.make_asset(b,foreign_asset,2048,'research-foreign','Research Foreign');
  insert into public.vh_research_sessions(id,account_id,notebook_id,kind,query,plan,status,provenance)
    values(sess_fast,a,n,'fast','quantum sensors','{"steps":["search","review"]}','review','{"provider":"fixture"}'),
          (sess_deep,a,n,'deep','deep quantum sensors','{"steps":["search","synthesize"]}','queued','{"provider":"fixture"}');
  insert into public.vh_research_candidates(id,account_id,research_session_id,source_url,source_identity_hash,title,fetch_status,provenance)
    values(cand,a,sess_fast,'https://example.com/source',encode(digest('research-candidate','sha256'),'hex'),'Candidate','candidate','{"discoveredBy":"fast"}');
  if exists(select 1 from public.vh_research_candidates where id=cand and accepted_asset_id is not null) then raise exception 'candidate_auto_trusted'; end if;
  begin
    update public.vh_research_candidates set accepted_asset_id=foreign_asset where id=cand;
    raise exception 'foreign_candidate_asset_accepted';
  exception when foreign_key_violation then null; end;
  update public.vh_research_candidates set accepted_asset_id=asset,fetch_status='verified',provenance=provenance||'{"accepted":true}'::jsonb where id=cand;
  perform public.vh_add_notebook_source(a,n,asset,10,100000,'research',jsonb_build_object('researchCandidateId',cand,'researchSessionId',sess_fast,'url','https://example.com/source'));
  if not exists(select 1 from public.vh_notebook_sources where notebook_id=n and asset_id=asset and added_via='research' and discovery_provenance->>'researchCandidateId'=cand::text) then raise exception 'candidate_add_provenance_missing'; end if;

  insert into public.vh_jobs(id,account_id,kind,payload,state) values(job,a,'part2.research.deep',jsonb_build_object('sessionId',sess_deep),'queued');
  insert into public.vh_jobs(id,account_id,kind,payload,state) values(foreign_job,b,'part2.research.deep',jsonb_build_object('sessionId',sess_deep),'queued');
  update public.vh_research_sessions set job_id=job where id=sess_deep;
  begin
    update public.vh_research_sessions set job_id=foreign_job where id=sess_deep;
    raise exception 'foreign_research_job_accepted';
  exception when foreign_key_violation then null; end;
  update public.vh_jobs set state='retry' where id=job;
  if not exists(select 1 from public.vh_research_sessions where id=sess_deep and status='queued' and safe_error_code='RESEARCH_RETRY') then raise exception 'research_retry_sync_missing'; end if;
  update public.vh_jobs set state='failed' where id=job;
  if not exists(select 1 from public.vh_research_sessions where id=sess_deep and status='failed' and safe_error_code='RESEARCH_FAILED' and finished_at is not null) then raise exception 'research_failure_sync_missing'; end if;
  raise notice 'P2_RESEARCH_CANDIDATE_LIFECYCLE=PASS';
end $$;

do $$
declare
  a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  asset uuid := 'aaaaaaaa-8000-4000-8000-000000000001';
  storage uuid := 'aaaaaaaa-8100-4000-8000-000000000001';
  p uuid := 'aaaaaaaa-8200-4000-8000-000000000001';
  n uuid := 'aaaaaaaa-8300-4000-8000-000000000001';
  c uuid := 'aaaaaaaa-8400-4000-8000-000000000001';
  t uuid := 'aaaaaaaa-8500-4000-8000-000000000001';
begin
  insert into public.vh_storage_objects(id,account_id,bucket,object_path,kind,mime_type,size_bytes,state,trashed_at,purge_after)
    values(storage,a,'vh-library',a::text||'/trash/original','library','text/plain',4096,'trashed',now(),now()+interval '30 days');
  insert into public.vh_library_assets(id,account_id,storage_object_id,original_filename,display_title,declared_mime,detected_mime,source_kind,asset_class,original_size_bytes,origin_surface,content_sha256,processing_status,extraction_status,trashed_at,purge_after)
    values(asset,a,storage,'trash.txt','Trash Asset','text/plain','text/plain','text','file',4096,'acceptance',encode(digest('trash-asset','sha256'),'hex'),'READY','READY',now(),now()+interval '30 days');
  insert into public.vh_projects(id,account_id,name) values(p,a,'Trash Project');
  insert into public.vh_notebooks(id,account_id,name) values(n,a,'Trash Notebook');
  insert into public.vh_library_collections(id,account_id,name) values(c,a,'Trash Collection');
  insert into public.vh_library_tags(id,account_id,name,normalized_name) values(t,a,'TrashTag','trashtag');
  insert into public.vh_project_references(account_id,project_id,asset_id,source_size_bytes) values(a,p,asset,4096);
  insert into public.vh_notebook_sources(account_id,notebook_id,asset_id,source_size_bytes) values(a,n,asset,4096);
  insert into public.vh_collection_assets(account_id,collection_id,asset_id) values(a,c,asset);
  insert into public.vh_library_asset_tags(account_id,asset_id,tag_id) values(a,asset,t);
  insert into public.vh_source_chunks(account_id,asset_id,source_revision,chunk_index,content,locator,text_range,content_hash,extraction_version)
    values(a,asset,1,0,'trash chunk','{"page":1}','{"start":0,"end":11}',encode(digest('trash-chunk','sha256'),'hex'),'accept-v1');
  if public.vh_delete_part2_metadata(b,'asset',asset) then raise exception 'foreign_trash_delete_allowed'; end if;
  if not public.vh_delete_part2_metadata(a,'asset',asset) then raise exception 'owner_trash_delete_failed'; end if;
  if exists(select 1 from public.vh_library_assets where id=asset) or exists(select 1 from public.vh_storage_objects where id=storage) then raise exception 'trash_asset_storage_not_deleted'; end if;
  if exists(select 1 from public.vh_project_references where asset_id=asset) or exists(select 1 from public.vh_notebook_sources where asset_id=asset) or exists(select 1 from public.vh_collection_assets where asset_id=asset) or exists(select 1 from public.vh_source_chunks where asset_id=asset) then raise exception 'trash_relationship_cleanup_incomplete'; end if;

  update public.vh_projects set trashed_at=now(),purge_after=now()+interval '30 days' where id=p;
  update public.vh_projects set trashed_at=null,purge_after=null where id=p and purge_after>now();
  if not exists(select 1 from public.vh_projects where id=p and trashed_at is null and purge_after is null) then raise exception 'trash_restore_semantics_failed'; end if;
  raise notice 'P2_TRASH_RECOVERY_DELETE=PASS';
end $$;

do $$
declare
  missing_rls int;
  anon_dml int;
begin
  select count(*) into missing_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=any(array[
      'vh_projects','vh_library_assets','vh_asset_usages','vh_ingest_sessions','vh_project_references','vh_library_tags','vh_library_asset_tags','vh_library_collections','vh_collection_assets','vh_notebooks','vh_project_notebooks','vh_notebook_sources','vh_source_chunks','vh_research_sessions','vh_research_candidates'
    ]) and not c.relrowsecurity;
  if missing_rls <> 0 then raise exception 'part2_rls_missing=%',missing_rls; end if;
  select count(*) into anon_dml from information_schema.role_table_grants
    where grantee in ('anon','authenticated') and table_schema='public' and table_name like 'vh_%' and privilege_type in ('SELECT','INSERT','UPDATE','DELETE');
  if anon_dml <> 0 then raise exception 'direct_client_dml_grants=%',anon_dml; end if;
  if has_function_privilege('anon','public.vh_search_notebook_chunks_scoped(uuid,uuid,text,uuid[],integer)','EXECUTE') then raise exception 'anon_scoped_search_execute'; end if;
  if has_function_privilege('authenticated','public.vh_delete_part2_metadata(uuid,text,uuid)','EXECUTE') then raise exception 'authenticated_trash_rpc_execute'; end if;
  raise notice 'P2_SECURITY_ISOLATION=PASS';
end $$;

delete from public.vh_accounts where id in (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid
);
SQL

echo "PART2_ACCEPTANCE=PASS"
