#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:?PGPORT is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${PGDATABASE:?PGDATABASE is required}"

PSQL=(psql -X -v ON_ERROR_STOP=1)

"${PSQL[@]}" <<'SQL'
create extension if not exists pgcrypto;
create schema if not exists storage;
create table if not exists storage.buckets(
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint
);
do $$ begin
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
end $$;
SQL

migrations=(
  src/db/migration-100-vh-part1-foundation.sql
  src/db/migration-101-vh-part1-hardening.sql
  src/db/migration-102-vh-part1-service-only.sql
  src/db/migration-103-vh-part1-index-hardening.sql
  src/db/migration-104-vh-part2-knowledge-core.sql
  src/db/migration-105-vh-part2-integrity-hardening.sql
  src/db/migration-106-vh-part2-library-query.sql
  src/db/migration-107-vh-part2-job-state-sync.sql
  src/db/migration-108-vh-part2-scoped-notebook-retrieval.sql
  src/db/migration-109-vh-part2-research-owner-guards.sql
  src/db/migration-110-vh-part2-trash-metadata-delete.sql
  src/db/migration-111-vh-part2-fk-index-hardening.sql
  src/db/migration-112-vh-part2-library-keyset-indexes.sql
  src/db/migration-113-vh-part2-library-page-first.sql
  src/db/migration-114-vh-part2-library-search-hits.sql
)
for migration in "${migrations[@]}"; do
  echo "APPLY_MIGRATION=$(basename "$migration")"
  "${PSQL[@]}" -f "$migration" >/dev/null
done

ACCOUNT='11111111-1111-4111-8111-111111111111'
PROJECT='22222222-2222-4222-8222-222222222222'
BASE_ASSET='33333333-3333-4333-8333-333333333333'
RACE_A='44444444-4444-4444-8444-444444444444'
RACE_B='55555555-5555-4555-8555-555555555555'

"${PSQL[@]}" <<SQL
insert into public.vh_accounts(id,email) values ('$ACCOUNT','part2-race@example.invalid');
insert into public.vh_projects(id,account_id,name) values ('$PROJECT','$ACCOUNT','Part2 race project');
insert into public.vh_library_assets(id,account_id,original_filename,display_title,declared_mime,detected_mime,source_kind,asset_class,original_size_bytes,origin_surface,content_sha256,processing_status,extraction_status)
values
 ('$BASE_ASSET','$ACCOUNT','base.bin','Base 49 MiB','application/octet-stream','application/octet-stream','other','file',51380224,'race',repeat('a',64),'READY','NOT_REQUIRED'),
 ('$RACE_A','$ACCOUNT','race-a.bin','Race A 1 MiB','application/octet-stream','application/octet-stream','other','file',1048576,'race',repeat('b',64),'READY','NOT_REQUIRED'),
 ('$RACE_B','$ACCOUNT','race-b.bin','Race B 1 MiB','application/octet-stream','application/octet-stream','other','file',1048576,'race',repeat('c',64),'READY','NOT_REQUIRED');
select public.vh_add_project_reference('$ACCOUNT','$PROJECT','$BASE_ASSET');
SQL

set +e
"${PSQL[@]}" -c "begin; select public.vh_add_project_reference('$ACCOUNT','$PROJECT','$RACE_A'); select pg_sleep(2); commit;" >project-race-a.log 2>&1 &
PID_A=$!
sleep 0.15
"${PSQL[@]}" -c "begin; select public.vh_add_project_reference('$ACCOUNT','$PROJECT','$RACE_B'); select pg_sleep(2); commit;" >project-race-b.log 2>&1 &
PID_B=$!
wait "$PID_A"; RC_A=$?
wait "$PID_B"; RC_B=$?
set -e

PROJECT_WINNERS=$(( (RC_A == 0) + (RC_B == 0) ))
IFS='|' read -r PROJECT_COUNT PROJECT_BYTES < <("${PSQL[@]}" -Atc "select count(*),coalesce(sum(reference_size_bytes),0) from public.vh_project_references where account_id='$ACCOUNT' and project_id='$PROJECT';")
if [[ "$PROJECT_WINNERS" -ne 1 || "$PROJECT_COUNT" -ne 2 || "$PROJECT_BYTES" -ne 52428800 ]]; then
  echo "PROJECT_REF_RACE=FAIL rc_a=$RC_A rc_b=$RC_B count=$PROJECT_COUNT bytes=$PROJECT_BYTES"
  cat project-race-a.log project-race-b.log
  exit 1
fi
echo "PROJECT_REF_RACE=PASS winners=$PROJECT_WINNERS refs=$PROJECT_COUNT bytes=$PROJECT_BYTES"

"${PSQL[@]}" <<SQL
insert into public.vh_quota_usage(account_id,scope,bytes_used,bytes_reserved)
values ('$ACCOUNT','library',943718400,0)
on conflict (account_id,scope) do update set bytes_used=excluded.bytes_used,bytes_reserved=0,updated_at=now();
delete from public.vh_quota_reservations where account_id='$ACCOUNT' and scope='library';
SQL

set +e
"${PSQL[@]}" -c "begin; select public.vh_reserve_quota('$ACCOUNT','library',104857600,1073741824); select pg_sleep(2); commit;" >quota-race-a.log 2>&1 &
QPID_A=$!
sleep 0.15
"${PSQL[@]}" -c "begin; select public.vh_reserve_quota('$ACCOUNT','library',104857600,1073741824); select pg_sleep(2); commit;" >quota-race-b.log 2>&1 &
QPID_B=$!
wait "$QPID_A"; QRC_A=$?
wait "$QPID_B"; QRC_B=$?
set -e

QUOTA_WINNERS=$(( (QRC_A == 0) + (QRC_B == 0) ))
IFS='|' read -r USED RESERVED < <("${PSQL[@]}" -Atc "select bytes_used,bytes_reserved from public.vh_quota_usage where account_id='$ACCOUNT' and scope='library';")
PENDING=$("${PSQL[@]}" -Atc "select count(*) from public.vh_quota_reservations where account_id='$ACCOUNT' and scope='library' and status='pending';")
if [[ "$QUOTA_WINNERS" -ne 1 || "$USED" -ne 943718400 || "$RESERVED" -ne 104857600 || "$PENDING" -ne 1 ]]; then
  echo "QUOTA_RACE=FAIL rc_a=$QRC_A rc_b=$QRC_B used=$USED reserved=$RESERVED pending=$PENDING"
  cat quota-race-a.log quota-race-b.log
  exit 1
fi
echo "QUOTA_RACE=PASS winners=$QUOTA_WINNERS used=$USED reserved=$RESERVED pending=$PENDING hard=1073741824"

echo "PART2_REAL_POSTGRES_RACES=PASS"
