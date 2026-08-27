#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST is required}" "${PGPORT:?PGPORT is required}" "${PGUSER:?PGUSER is required}" "${PGPASSWORD:?PGPASSWORD is required}" "${PGDATABASE:?PGDATABASE is required}"
PSQL=(psql -X -v ON_ERROR_STOP=1)
MIGRATIONS=(src/db/migration-{115,116,117,118,119,120,121}-*.sql)

python3 - "${MIGRATIONS[@]}" <<'PY' > /tmp/part3-stage90-source.env
import pathlib,re,sys
text='\n'.join(pathlib.Path(p).read_text() for p in sys.argv[1:])
tables=sorted(set(re.findall(r'create\s+table\s+if\s+not\s+exists\s+public\.(vh_[a-z0-9_]+)',text,re.I)))
functions=sorted(set(re.findall(r'create\s+or\s+replace\s+function\s+public\.(vh_[a-z0-9_]+)',text,re.I)))
print('TABLES='+','.join(tables)); print('FUNCTIONS='+','.join(functions))
PY
. /tmp/part3-stage90-source.env
[[ $(tr ',' '\n' <<<"$TABLES" | sed '/^$/d' | wc -l) -eq 14 ]] || { echo "PART3_SECURITY=FAIL source_table_count tables=$TABLES"; exit 1; }
tr ',' '\n' <<<"$TABLES" | grep -qx vh_fast_ask_stream_events || { echo 'PART3_SECURITY=FAIL stream_events_omitted'; exit 1; }

"${PSQL[@]}" -v expected_tables="$TABLES" -v expected_functions="$FUNCTIONS" <<'SQL'
create temp table stage90_expected_tables as select unnest(string_to_array(:'expected_tables',',')) item;
create temp table stage90_expected_functions as select unnest(string_to_array(:'expected_functions',',')) item;
do $$
declare expected_tables text[] := (select array_agg(item order by item) from stage90_expected_tables);
        expected_functions text[] := (select array_agg(item order by item) from stage90_expected_functions);
        actual_tables text[]; actual_functions text[]; item text;
begin
  select array_agg(tablename order by tablename) into actual_tables from pg_tables
   where schemaname='public' and tablename=any(expected_tables);
  if actual_tables is distinct from expected_tables or cardinality(actual_tables)<>14 then
    raise exception 'part3_table_surface_mismatch expected=% actual=%',expected_tables,actual_tables;
  end if;
  select array_agg(distinct p.proname order by p.proname) into actual_functions
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname=any(expected_functions);
  if actual_functions is distinct from expected_functions then
    raise exception 'part3_function_surface_mismatch expected=% actual=%',expected_functions,actual_functions;
  end if;
  foreach item in array expected_tables loop
    if not (select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=item) then
      raise exception 'part3_rls_disabled table=%',item;
    end if;
    if exists(select 1 from information_schema.role_table_grants where table_schema='public' and table_name=item and grantee in ('PUBLIC','anon','authenticated')) then
      raise exception 'part3_client_table_privilege table=%',item;
    end if;
  end loop;
  if exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral unnest(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    where n.nspname='public' and p.proname=any(expected_functions)
      and (acl::text like '=X/%' or acl::text like 'anon=X/%' or acl::text like 'authenticated=X/%')
  ) then raise exception 'part3_client_function_execute_privilege'; end if;
  if exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(expected_functions)
      and p.prorettype <> 'trigger'::regtype and not has_function_privilege('service_role',p.oid,'EXECUTE')
  ) then raise exception 'part3_service_role_function_execute_missing'; end if;
  raise notice 'PART3_SECURITY=PASS tables=14 functions=% rls=all client_table_privileges=revoked client_function_execute=revoked service_rpc_execute=granted stream_events=covered',cardinality(expected_functions);
end $$;
SQL

echo "PART3_SECURITY_SOURCE tables=$TABLES functions=$FUNCTIONS"
