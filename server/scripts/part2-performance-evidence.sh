#!/usr/bin/env bash
set -euo pipefail
: "${PGHOST:?PGHOST is required}"; : "${PGPORT:?PGPORT is required}"; : "${PGUSER:?PGUSER is required}"; : "${PGPASSWORD:?PGPASSWORD is required}"; : "${PGDATABASE:?PGDATABASE is required}"
PSQL=(psql -X -v ON_ERROR_STOP=1)
ACCOUNT='77777777-7777-4777-8777-777777777777'
PROJECT='77777777-7777-4777-8777-777777777778'
NOTEBOOK='77777777-7777-4777-8777-777777777779'
cleanup() { "${PSQL[@]}" -qAtc "delete from public.vh_accounts where id='$ACCOUNT'" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

"${PSQL[@]}" <<SQL
insert into public.vh_accounts(id,email) values ('$ACCOUNT','part2-perf@example.invalid');
insert into public.vh_projects(id,account_id,name) values ('$PROJECT','$ACCOUNT','Part2 Performance Project');
insert into public.vh_notebooks(id,account_id,name) values ('$NOTEBOOK','$ACCOUNT','Part2 Performance Notebook');
insert into public.vh_library_assets(id,account_id,original_filename,display_title,declared_mime,detected_mime,source_kind,asset_class,original_size_bytes,origin_surface,content_sha256,processing_status,extraction_status,favorite,created_at,updated_at)
select gen_random_uuid(),'$ACCOUNT',format('asset-%s.txt',g),format('Physics asset %s',g),'text/plain','text/plain','text','text',1024+(g%2048),'performance',encode(digest(g::text,'sha256'),'hex'),'READY','READY',(g%7=0),now()-(g||' seconds')::interval,now()-(g||' seconds')::interval from generate_series(1,10000) g;
insert into public.vh_project_references(account_id,project_id,asset_id,source_size_bytes)
select '$ACCOUNT','$PROJECT',id,original_size_bytes from public.vh_library_assets where account_id='$ACCOUNT' order by created_at desc limit 20;
insert into public.vh_notebook_sources(account_id,notebook_id,asset_id,source_size_bytes,added_via)
select '$ACCOUNT','$NOTEBOOK',id,original_size_bytes,'library' from public.vh_library_assets where account_id='$ACCOUNT' order by created_at desc limit 1000;
insert into public.vh_source_chunks(account_id,asset_id,source_revision,chunk_index,content,locator,text_range,content_hash,extraction_version)
select '$ACCOUNT',ns.asset_id,1,g,format('alpha evidence physics chunk %s for source %s',g,ns.asset_id),jsonb_build_object('page',g+1),jsonb_build_object('start',g*40,'end',g*40+39),encode(digest(ns.asset_id::text||':'||g::text,'sha256'),'hex'),'perf-v1'
from public.vh_notebook_sources ns cross join generate_series(0,19) g where ns.account_id='$ACCOUNT' and ns.notebook_id='$NOTEBOOK';
analyze public.vh_library_assets; analyze public.vh_notebook_sources; analyze public.vh_source_chunks; analyze public.vh_project_references;
SQL

"${PSQL[@]}" <<SQL
\echo 'PART2_PERFORMANCE_FIXTURE assets=10000 notebook_sources=1000 chunks=20000 project_refs=20'
\echo '--- EXPLAIN Library raw keyset page ---'
explain (analyze,buffers) select id from public.vh_library_assets where account_id='$ACCOUNT' and trashed_at is null order by created_at desc,id desc limit 40;
\echo '--- EXPLAIN scoped Notebook retrieval ---'
explain (analyze,buffers) select * from public.vh_search_notebook_chunks_scoped('$ACCOUNT','$NOTEBOOK','alpha',null,12);
SQL

"${PSQL[@]}" <<SQL
create temporary table vh_perf_results(metric text primary key, elapsed_ms numeric, rows_returned integer);
do \$\$
declare t timestamptz; n int; ms numeric;
begin
  t:=clock_timestamp(); select count(*) into n from public.vh_query_library_assets(p_account_id=>'$ACCOUNT',p_sort=>'created',p_dir=>'desc',p_limit=>40); ms:=extract(epoch from(clock_timestamp()-t))*1000; insert into vh_perf_results values('library_page_10k',ms,n); if n<>40 or ms>1000 then raise exception 'library_page_perf_regression rows=% ms=%',n,ms; end if;
  t:=clock_timestamp(); select count(*) into n from public.vh_query_library_assets(p_account_id=>'$ACCOUNT',p_q=>'physics',p_sort=>'created',p_dir=>'desc',p_limit=>40); ms:=extract(epoch from(clock_timestamp()-t))*1000; insert into vh_perf_results values('library_search_10k_20kchunks',ms,n); if n<>40 or ms>1500 then raise exception 'library_search_perf_regression rows=% ms=%',n,ms; end if;
  t:=clock_timestamp(); select count(*) into n from public.vh_search_notebook_chunks_scoped('$ACCOUNT','$NOTEBOOK','alpha',null,12); ms:=extract(epoch from(clock_timestamp()-t))*1000; insert into vh_perf_results values('notebook_retrieval_20k',ms,n); if n<>12 or ms>1000 then raise exception 'retrieval_perf_regression rows=% ms=%',n,ms; end if;
  t:=clock_timestamp(); select count(*) into n from (select id from public.vh_projects where account_id='$ACCOUNT' and trashed_at is null order by updated_at desc,id desc limit 50) q; ms:=extract(epoch from(clock_timestamp()-t))*1000; insert into vh_perf_results values('project_list_bounded',ms,n); if ms>250 then raise exception 'project_list_perf_regression ms=%',ms; end if;
  t:=clock_timestamp(); select count(*) into n from (select id from public.vh_notebooks where account_id='$ACCOUNT' and trashed_at is null order by updated_at desc,id desc limit 50) q; ms:=extract(epoch from(clock_timestamp()-t))*1000; insert into vh_perf_results values('notebook_list_bounded',ms,n); if ms>250 then raise exception 'notebook_list_perf_regression ms=%',ms; end if;
end \$\$;
select 'PART2_PERF='||metric||' elapsed_ms='||round(elapsed_ms,3)||' rows='||rows_returned from vh_perf_results order by metric;
SQL

echo 'PART2_PERFORMANCE_EVIDENCE=PASS'
