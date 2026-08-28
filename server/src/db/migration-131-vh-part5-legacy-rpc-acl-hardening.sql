-- Veltrix Hom Backend Part 5: legacy SECURITY DEFINER RPC ACL hardening.
-- Fresh installs may not contain the pre-Part1 legacy RPCs. Upgrade installs may.
-- Harden every matching legacy overload that exists; absence is already fail-closed.

do $$
declare
  r record;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'get_activity_summary',
        'handle_new_user',
        'seed_veltrix_talents_after_profile'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.oid::regprocedure);
    execute format('grant execute on function %s to service_role', r.oid::regprocedure);
  end loop;
end
$$;
