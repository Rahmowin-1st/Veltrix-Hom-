-- Veltrix Hom Backend Part 5 MAX hardening: canonical job lease recovery.
-- Forward-only over accepted migrations 100..132. No product semantics change.

create index if not exists vh_jobs_running_lease_idx
  on public.vh_jobs(lease_expires_at,created_at,id)
  where state='running';

create or replace function public.vh_renew_job_lease(
  p_job_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 60
) returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare renewed boolean:=false;
begin
  if char_length(btrim(coalesce(p_worker_id,'')))<1 or p_lease_seconds<10 or p_lease_seconds>3600 then
    raise exception 'job_lease_input_invalid' using errcode='22023';
  end if;

  update public.vh_jobs
  set lease_expires_at=now()+make_interval(secs=>p_lease_seconds),
      updated_at=now()
  where id=p_job_id
    and state='running'
    and lease_owner=p_worker_id
    and lease_expires_at is not null
    and lease_expires_at>now()
  returning true into renewed;

  return coalesce(renewed,false);
end;
$$;
revoke all on function public.vh_renew_job_lease(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.vh_renew_job_lease(uuid,text,integer) to service_role;

create or replace function public.vh_claim_job(
  p_worker_id text,
  p_lease_seconds integer default 60
) returns setof public.vh_jobs
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_id uuid;
begin
  if char_length(btrim(coalesce(p_worker_id,'')))<1 or p_lease_seconds<10 or p_lease_seconds>3600 then
    raise exception 'job_claim_input_invalid' using errcode='22023';
  end if;

  -- A crashed worker must not leave an exhausted canonical job permanently RUNNING.
  update public.vh_jobs
  set state='failed',
      last_error_code='JobLeaseExpired',
      lease_owner=null,
      lease_expires_at=null,
      finished_at=coalesce(finished_at,now()),
      updated_at=now()
  where state='running'
    and lease_expires_at is not null
    and lease_expires_at<=now()
    and attempts>=max_attempts;

  -- Reclaim a stale RUNNING job only after its lease expires. SKIP LOCKED gives a
  -- single winner while lease_owner fencing rejects zombie checkpoint/finish writes.
  select id into v_id
  from public.vh_jobs
  where (
      state in ('queued','retry')
      and available_at<=now()
      and (lease_expires_at is null or lease_expires_at<=now())
    ) or (
      state='running'
      and lease_expires_at is not null
      and lease_expires_at<=now()
      and attempts<max_attempts
    )
  order by
    case when state='running' then 0 else 1 end,
    coalesce(lease_expires_at,available_at),
    created_at,
    id
  for update skip locked
  limit 1;

  if v_id is null then return; end if;

  update public.vh_jobs
  set state='running',
      attempts=attempts+1,
      lease_owner=p_worker_id,
      lease_expires_at=now()+make_interval(secs=>p_lease_seconds),
      updated_at=now()
  where id=v_id;

  return query select * from public.vh_jobs where id=v_id;
end;
$$;
revoke all on function public.vh_claim_job(text,integer) from public,anon,authenticated;
grant execute on function public.vh_claim_job(text,integer) to service_role;
