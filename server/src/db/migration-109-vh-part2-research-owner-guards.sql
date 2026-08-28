-- Veltrix Hom Backend Part 2: research relationship owner guards.
-- Service-role mistakes must not be able to attach a foreign-account accepted asset or job.

create or replace function public.vh_guard_research_candidate_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.accepted_asset_id is not null and not exists (
    select 1 from public.vh_library_assets a
    where a.id = new.accepted_asset_id and a.account_id = new.account_id
  ) then
    raise exception 'research_candidate_asset_owner_mismatch' using errcode='23503';
  end if;
  return new;
end;
$$;

create or replace function public.vh_guard_research_job_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.job_id is not null and not exists (
    select 1 from public.vh_jobs j
    where j.id = new.job_id and j.account_id = new.account_id
  ) then
    raise exception 'research_job_owner_mismatch' using errcode='23503';
  end if;
  return new;
end;
$$;

revoke all on function public.vh_guard_research_candidate_owner() from public, anon, authenticated;
revoke all on function public.vh_guard_research_job_owner() from public, anon, authenticated;
grant execute on function public.vh_guard_research_candidate_owner() to service_role;
grant execute on function public.vh_guard_research_job_owner() to service_role;

drop trigger if exists vh_research_candidate_owner_guard on public.vh_research_candidates;
create trigger vh_research_candidate_owner_guard
before insert or update of accepted_asset_id, account_id on public.vh_research_candidates
for each row execute function public.vh_guard_research_candidate_owner();

drop trigger if exists vh_research_job_owner_guard on public.vh_research_sessions;
create trigger vh_research_job_owner_guard
before insert or update of job_id, account_id on public.vh_research_sessions
for each row execute function public.vh_guard_research_job_owner();
