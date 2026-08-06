-- Veltrix Hom V11 — RPC overload hotfix
-- Fixes PostgREST error:
--   Could not choose the best candidate function between
--   claim_processing_job(integer,text) and claim_processing_job(text,integer)
-- Safe to run more than once.

begin;

-- This reversed historical overload has the same named parameter set as the
-- canonical function. PostgREST cannot choose between them for named RPC calls.
drop function if exists public.claim_processing_job(text, integer);

-- Stop immediately if migration-010's canonical function is not present.
do $$
begin
  if to_regprocedure('public.claim_processing_job(integer,text)') is null then
    raise exception
      'Canonical public.claim_processing_job(integer,text) is missing. Run the fixed migration-010 first.';
  end if;
end
$$;

-- Keep the queue-claim RPC backend-only.
revoke all on function public.claim_processing_job(integer,text)
  from public, anon, authenticated;
grant execute on function public.claim_processing_job(integer,text)
  to service_role;

-- Force PostgREST/Supabase API to refresh its function schema cache now.
notify pgrst, 'reload schema';

commit;

-- Expected result: exactly ONE row, with identity_arguments = integer, text.
select
  p.oid::regprocedure::text as function_signature,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'claim_processing_job'
order by 1;
