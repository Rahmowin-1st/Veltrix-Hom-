#!/usr/bin/env bash
set -euo pipefail

ACCOUNT='9c000000-0000-4000-8000-000000000003'
REPS=20
WARMUPS=3
STUDIO_LIMIT_MS=1000
NOTE_LIMIT_MS=1500
GOAL_LIMIT_MS=1000
MEMORY_LIMIT_MS=1000
NOTIFICATION_LIMIT_MS=500
SEARCH_LIMIT_MS=1500
TRASH_100_LIMIT_MS=5000
METRICS_FILE="${1:-part4-stage90-performance.env}"

measure_sql() {
  local reps
  reps="$1"
  local warmups
  warmups="$2"
  local sql
  sql="$3"
  local samples=()
  local start_ns
  local end_ns
  local p95_index
  local max_index

  for _ in $(seq 1 "$warmups"); do
    psql -X -Atqc "$sql" >/dev/null
  done
  for _ in $(seq 1 "$reps"); do
    start_ns=$(date +%s%N)
    psql -X -Atqc "$sql" >/dev/null
    end_ns=$(date +%s%N)
    samples+=("$(( (end_ns - start_ns) / 1000000 ))")
  done
  mapfile -t sorted < <(printf '%s\n' "${samples[@]}" | sort -n)
  p95_index=$(( (reps * 95 + 99) / 100 - 1 ))
  max_index=$(( reps - 1 ))
  printf '%s %s\n' "${sorted[$p95_index]}" "${sorted[$max_index]}"
}

psql -X -v ON_ERROR_STOP=1 -v aid="$ACCOUNT" <<'SQL' >/dev/null
insert into public.vh_accounts(id,email,status)
values(:'aid'::uuid,'p4-stage90-perf@example.test','active') on conflict(id) do nothing;

-- Studio context fixture: 100 live Library assets resolved as one selection snapshot.
insert into public.vh_library_assets(
  account_id,original_filename,display_title,source_kind,asset_class,original_size_bytes,
  origin_surface,content_sha256,processing_status,extraction_status,source_revision
)
select :'aid'::uuid,
       'perf-studio-'||g||'.txt',
       'Perf Studio '||g,
       'text','text',4096,'part4-performance',
       encode(digest('p4-perf-studio-'||g,'sha256'),'hex'),'READY','READY',1
from generate_series(1,100) g;

-- Goal fixture: 100 weighted components.
insert into public.vh_goals(account_id,title)
values(:'aid'::uuid,'Part4 performance goal');
insert into public.vh_goal_milestones(account_id,goal_id,title,weight,completed)
select :'aid'::uuid,g.id,'Milestone '||s,1,mod(s,2)=0
from public.vh_goals g cross join generate_series(1,100) s
where g.account_id=:'aid'::uuid and g.title='Part4 performance goal';

-- Memory fixture: 1,000 indexed durable inferred records.
select public.vh_persist_inferred_memory(
  :'aid'::uuid,'learning','Algebra performance memory '||g,0.90,
  jsonb_build_object('ordinal',g),jsonb_build_object('source','part4-performance'),
  'perf:memory:'||g,0.72
)
from generate_series(1,1000) g;

-- Notification fixture: outside enabled with one active private token record.
select public.vh_set_notification_preference(:'aid'::uuid,'perf_notification',true,true);
insert into public.vh_device_tokens(account_id,provider,token_digest,encrypted_token,device_label,active,last_seen_at)
values(:'aid'::uuid,'FCM',repeat('a',64),'ci-encrypted-token-placeholder','CI performance device',true,now())
on conflict(account_id,provider,token_digest) do update set active=true,revoked_at=null,last_seen_at=now(),updated_at=now();

-- Search fixture: 20,000 projected documents across the exact 12-domain registry.
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

NOTE_ID="$(psql -X -Atqc "select note_id from public.vh_create_note('$ACCOUNT'::uuid,'Part4 1MiB performance note',jsonb_build_array(jsonb_build_object('type','paragraph','text','seed')),repeat('b',64),200)" | head -n1 | cut -d'|' -f1)"
if [[ -z "$NOTE_ID" ]]; then
  echo 'P4_STAGE90_NOTE_PERF_FIXTURE=FAIL missing_note_id' >&2
  exit 40
fi

STUDIO_SQL="select count(*) from public.vh_resolve_studio_binding_snapshot('$ACCOUNT'::uuid,'library_selection',null,(select jsonb_build_object('assetIds',jsonb_agg(id::text)) from (select id from public.vh_library_assets where account_id='$ACCOUNT'::uuid and origin_surface='part4-performance' order by id limit 100) x),null)"
NOTE_SQL="select count(*) from public.vh_save_note_revision('$ACCOUNT'::uuid,'$NOTE_ID'::uuid,(select revision from public.vh_notes where id='$NOTE_ID'::uuid and account_id='$ACCOUNT'::uuid),'AUTOSAVE',jsonb_build_array(jsonb_build_object('type','paragraph','text',repeat('x',1048576))),encode(digest('large-note-'||(select revision::text from public.vh_notes where id='$NOTE_ID'::uuid and account_id='$ACCOUNT'::uuid),'sha256'),'hex'))"
GOAL_SQL="select public.vh_recompute_goal_progress('$ACCOUNT'::uuid,(select id from public.vh_goals where account_id='$ACCOUNT'::uuid and title='Part4 performance goal' limit 1))"
MEMORY_SQL="select count(*) from public.vh_retrieve_memories('$ACCOUNT'::uuid,'algebra',12,null)"
NOTIFICATION_SQL="select public.vh_emit_notification('$ACCOUNT'::uuid,'performance.event','perf_notification','info','performance.event',jsonb_build_object('internal','not-in-push'),jsonb_build_object('route','home'),'NORMAL','{}'::jsonb)"
SEARCH_SQL="select count(*) from public.vh_global_search('$ACCOUNT'::uuid,'algebra equations',40,null)"

read -r studio_p95_ms studio_max_ms < <(measure_sql "$REPS" "$WARMUPS" "$STUDIO_SQL")
read -r note_p95_ms note_max_ms < <(measure_sql "$REPS" "$WARMUPS" "$NOTE_SQL")
read -r goal_p95_ms goal_max_ms < <(measure_sql "$REPS" "$WARMUPS" "$GOAL_SQL")
read -r memory_p95_ms memory_max_ms < <(measure_sql "$REPS" "$WARMUPS" "$MEMORY_SQL")
read -r notification_p95_ms notification_max_ms < <(measure_sql "$REPS" "$WARMUPS" "$NOTIFICATION_SQL")
read -r search_p95_ms search_max_ms < <(measure_sql "$REPS" "$WARMUPS" "$SEARCH_SQL")

if (( studio_p95_ms > STUDIO_LIMIT_MS )); then echo "P4_STAGE90_STUDIO_PERF=FAIL p95_ms=$studio_p95_ms guard_ms=$STUDIO_LIMIT_MS" >&2; exit 41; fi
if (( note_p95_ms > NOTE_LIMIT_MS )); then echo "P4_STAGE90_NOTE_PERF=FAIL p95_ms=$note_p95_ms guard_ms=$NOTE_LIMIT_MS" >&2; exit 42; fi
if (( goal_p95_ms > GOAL_LIMIT_MS )); then echo "P4_STAGE90_GOAL_PERF=FAIL p95_ms=$goal_p95_ms guard_ms=$GOAL_LIMIT_MS" >&2; exit 43; fi
if (( memory_p95_ms > MEMORY_LIMIT_MS )); then echo "P4_STAGE90_MEMORY_PERF=FAIL p95_ms=$memory_p95_ms guard_ms=$MEMORY_LIMIT_MS" >&2; exit 44; fi
if (( notification_p95_ms > NOTIFICATION_LIMIT_MS )); then echo "P4_STAGE90_NOTIFICATION_PERF=FAIL p95_ms=$notification_p95_ms guard_ms=$NOTIFICATION_LIMIT_MS" >&2; exit 45; fi
if (( search_p95_ms > SEARCH_LIMIT_MS )); then echo "P4_STAGE90_SEARCH_PERF=FAIL p95_ms=$search_p95_ms guard_ms=$SEARCH_LIMIT_MS" >&2; exit 46; fi

# Prove notification calls actually reached the outside queue state and kept sensitive body_data out of the push payload.
psql -X -Atqc "select case when count(*) >= $((REPS + WARMUPS)) and bool_and(outside_state='QUEUED') and bool_and(not (outside_payload ? 'internal')) then 'PASS' else 'FAIL' end from public.vh_notifications where account_id='$ACCOUNT'::uuid and category='perf_notification'" | grep -Fx PASS >/dev/null

psql -X -v ON_ERROR_STOP=1 -v aid="$ACCOUNT" <<'SQL' >/dev/null
insert into public.vh_goals(account_id,title,trashed_at,purge_after)
select :'aid'::uuid,'Expired Stage90 goal '||g,now()-interval '31 days',now()-interval '1 day'
from generate_series(1,100) g;
SQL

trash_start_ns=$(date +%s%N)
psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
do $$
declare
  aid constant uuid := '9c000000-0000-4000-8000-000000000003';
  r record;
  n integer:=0;
begin
  for r in
    select id from public.vh_goals
    where account_id=aid and trashed_at is not null and purge_after<now()
    order by purge_after,id limit 100
  loop
    if not public.vh_delete_part4_trash_metadata(aid,'goal',r.id) then
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
  exit 47
fi

cat >"$METRICS_FILE" <<EOF
P4_STAGE90_ENVIRONMENT=github-actions-ubuntu-postgresql16-node22-process-inclusive
P4_STAGE90_REPS=$REPS
P4_STAGE90_WARMUPS=$WARMUPS
P4_STAGE90_STUDIO_CONTEXT_ASSETS=100
P4_STAGE90_STUDIO_CONTEXT_P95_MS=$studio_p95_ms
P4_STAGE90_STUDIO_CONTEXT_MAX_MS=$studio_max_ms
P4_STAGE90_STUDIO_CONTEXT_REGRESSION_GUARD_MS=$STUDIO_LIMIT_MS
P4_STAGE90_NOTE_PAYLOAD_BYTES=1048576
P4_STAGE90_NOTE_SAVE_P95_MS=$note_p95_ms
P4_STAGE90_NOTE_SAVE_MAX_MS=$note_max_ms
P4_STAGE90_NOTE_SAVE_REGRESSION_GUARD_MS=$NOTE_LIMIT_MS
P4_STAGE90_GOAL_COMPONENTS=100
P4_STAGE90_GOAL_RECOMPUTE_P95_MS=$goal_p95_ms
P4_STAGE90_GOAL_RECOMPUTE_MAX_MS=$goal_max_ms
P4_STAGE90_GOAL_RECOMPUTE_REGRESSION_GUARD_MS=$GOAL_LIMIT_MS
P4_STAGE90_MEMORY_FIXTURE_RECORDS=1000
P4_STAGE90_MEMORY_RETRIEVAL_P95_MS=$memory_p95_ms
P4_STAGE90_MEMORY_RETRIEVAL_MAX_MS=$memory_max_ms
P4_STAGE90_MEMORY_RETRIEVAL_REGRESSION_GUARD_MS=$MEMORY_LIMIT_MS
P4_STAGE90_NOTIFICATION_EVENTS=$REPS
P4_STAGE90_NOTIFICATION_QUEUE_P95_MS=$notification_p95_ms
P4_STAGE90_NOTIFICATION_QUEUE_MAX_MS=$notification_max_ms
P4_STAGE90_NOTIFICATION_QUEUE_REGRESSION_GUARD_MS=$NOTIFICATION_LIMIT_MS
P4_STAGE90_SEARCH_FIXTURE_DOCS=20000
P4_STAGE90_SEARCH_REPS=$REPS
P4_STAGE90_SEARCH_P95_MS=$search_p95_ms
P4_STAGE90_SEARCH_MAX_MS=$search_max_ms
P4_STAGE90_SEARCH_REGRESSION_GUARD_MS=$SEARCH_LIMIT_MS
P4_STAGE90_TRASH_PURGE_BATCH=100
P4_STAGE90_TRASH_PURGE_MS=$trash_100_ms
P4_STAGE90_TRASH_REGRESSION_GUARD_MS=$TRASH_100_LIMIT_MS
EOF
cat "$METRICS_FILE"
echo "P4_STAGE90_PERFORMANCE=PASS studio_p95_ms=$studio_p95_ms note_1mib_p95_ms=$note_p95_ms goal100_p95_ms=$goal_p95_ms memory1k_p95_ms=$memory_p95_ms notification_p95_ms=$notification_p95_ms search20k_p95_ms=$search_p95_ms trash100_ms=$trash_100_ms"
