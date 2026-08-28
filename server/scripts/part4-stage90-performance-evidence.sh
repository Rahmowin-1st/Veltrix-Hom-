#!/usr/bin/env bash
set -euo pipefail

ACCOUNT='9c000000-0000-4000-8000-000000000003'
SEARCH_LIMIT_MS=1500
TRASH_100_LIMIT_MS=5000
METRICS_FILE="${1:-part4-stage90-performance.env}"

psql -X -v ON_ERROR_STOP=1 -v aid="$ACCOUNT" <<'SQL' >/dev/null
insert into public.vh_accounts(id,email,status)
values(:'aid'::uuid,'p4-stage90-perf@example.test','active') on conflict(id) do nothing;
delete from public.vh_search_documents where account_id=:'aid'::uuid;
insert into public.vh_search_documents(account_id,entity_type,entity_id,title,body,match_metadata,deep_link,source_revision,deleted)
select :'aid'::uuid,
       (array['project','notebook','conversation','conversation_message','library_asset','library_content','note','todo','goal','studio_artifact','tag','collection'])[(g % 12)+1],
       gen_random_uuid(),
       'Algebra performance document '||g,
       'worked algebra examples equations geometry study searchable token '||g||' '||repeat('context ',8),
       '{}'::jsonb,'{}'::jsonb,'1',false
from generate_series(1,20000) g;
SQL

# Warmups keep runner cold-start/process startup noise out of the measured set as much as practical.
for _ in 1 2 3; do
  psql -X -Atqc "select count(*) from public.vh_global_search('$ACCOUNT'::uuid,'algebra equations',40,null)" >/dev/null
done

samples=()
for _ in $(seq 1 20); do
  start_ns=$(date +%s%N)
  psql -X -Atqc "select count(*) from public.vh_global_search('$ACCOUNT'::uuid,'algebra equations',40,null)" >/dev/null
  end_ns=$(date +%s%N)
  samples+=( $(( (end_ns - start_ns) / 1000000 )) )
done
mapfile -t sorted < <(printf '%s\n' "${samples[@]}" | sort -n)
search_p95_ms=${sorted[18]}
search_max_ms=${sorted[19]}
if (( search_p95_ms > SEARCH_LIMIT_MS )); then
  echo "P4_STAGE90_SEARCH_PERF=FAIL p95_ms=$search_p95_ms guard_ms=$SEARCH_LIMIT_MS" >&2
  exit 41
fi

psql -X -v ON_ERROR_STOP=1 -v aid="$ACCOUNT" <<'SQL' >/dev/null
insert into public.vh_goals(account_id,title,trashed_at,purge_after)
select :'aid'::uuid,'Expired Stage90 goal '||g,now()-interval '31 days',now()-interval '1 day'
from generate_series(1,100) g;
SQL

trash_start_ns=$(date +%s%N)
psql -X -v ON_ERROR_STOP=1 -v aid="$ACCOUNT" <<'SQL' >/dev/null
do $$
declare r record; n integer:=0;
begin
  for r in
    select id from public.vh_goals
    where account_id=:'aid'::uuid and trashed_at is not null and purge_after<now()
    order by purge_after,id limit 100
  loop
    if not public.vh_delete_part4_trash_metadata(:'aid'::uuid,'goal',r.id) then
      raise exception 'P4_STAGE90_PERF_PURGE_DELETE_FAILED';
    end if;
    n:=n+1;
  end loop;
  if n<>100 then raise exception 'P4_STAGE90_PERF_PURGE_COUNT_FAILED got=%',n; end if;
end $$;
SQL
trash_end_ns=$(date +%s%N)
trash_100_ms=$(( (trash_end_ns - trash_start_ns) / 1000000 ))
if (( trash_100_ms > TRASH_100_LIMIT_MS )); then
  echo "P4_STAGE90_TRASH_PERF=FAIL batch100_ms=$trash_100_ms guard_ms=$TRASH_100_LIMIT_MS" >&2
  exit 42
fi

cat >"$METRICS_FILE" <<EOF
P4_STAGE90_SEARCH_FIXTURE_DOCS=20000
P4_STAGE90_SEARCH_REPS=20
P4_STAGE90_SEARCH_P95_MS=$search_p95_ms
P4_STAGE90_SEARCH_MAX_MS=$search_max_ms
P4_STAGE90_SEARCH_REGRESSION_GUARD_MS=$SEARCH_LIMIT_MS
P4_STAGE90_TRASH_PURGE_BATCH=100
P4_STAGE90_TRASH_PURGE_MS=$trash_100_ms
P4_STAGE90_TRASH_REGRESSION_GUARD_MS=$TRASH_100_LIMIT_MS
EOF
cat "$METRICS_FILE"
echo "P4_STAGE90_PERFORMANCE=PASS search_p95_ms=$search_p95_ms trash_100_ms=$trash_100_ms"
