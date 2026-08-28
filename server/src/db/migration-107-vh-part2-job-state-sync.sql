-- Veltrix Hom Backend Part 2: durable job/domain state synchronization.
-- Keeps user-visible Part 2 domain state honest even if a worker retries, crashes,
-- loses its lease, or exhausts attempts after partially updating a domain object.

create or replace function public.vh_sync_part2_job_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target uuid;
  v_ingest public.vh_ingest_sessions%rowtype;
begin
  if new.state is not distinct from old.state then
    return new;
  end if;

  if new.kind = 'part2.source.process' then
    if coalesce(new.payload->>'assetId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_target := (new.payload->>'assetId')::uuid;
    else
      return new;
    end if;

    if new.state = 'retry' then
      update public.vh_library_assets
      set processing_status = 'QUEUED',
          extraction_status = 'PENDING',
          safe_failure_code = 'SOURCE_PROCESS_RETRY',
          updated_at = now()
      where id = v_target
        and account_id = new.account_id
        and processing_status not in ('READY','UNSUPPORTED');
    elsif new.state = 'failed' then
      update public.vh_library_assets
      set processing_status = 'FAILED',
          extraction_status = 'FAILED',
          safe_failure_code = 'SOURCE_PROCESS_FAILED',
          updated_at = now()
      where id = v_target
        and account_id = new.account_id
        and processing_status not in ('READY','UNSUPPORTED');

      delete from public.vh_source_chunks c
      using public.vh_library_assets a
      where a.id = v_target
        and a.account_id = new.account_id
        and c.account_id = new.account_id
        and c.asset_id = a.id
        and c.source_revision = a.source_revision;
    end if;

  elsif new.kind = 'part2.asset.verify' then
    if coalesce(new.payload->>'ingestId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_target := (new.payload->>'ingestId')::uuid;
    else
      return new;
    end if;

    select * into v_ingest
    from public.vh_ingest_sessions
    where id = v_target and account_id = new.account_id;

    if not found or v_ingest.status in ('FAILED','COMPLETED','DEDUP_REUSED') then
      return new;
    end if;

    if new.state = 'retry' then
      update public.vh_ingest_sessions
      set status = 'VERIFY_QUEUED',
          safe_failure_code = 'INGEST_VERIFY_RETRY',
          updated_at = now()
      where id = v_target and account_id = new.account_id;
    elsif new.state = 'failed' then
      update public.vh_ingest_sessions
      set status = 'FAILED',
          safe_failure_code = 'INGEST_VERIFY_FAILED',
          completed_at = now(),
          updated_at = now()
      where id = v_target and account_id = new.account_id;

      begin
        perform public.vh_finalize_quota_reservation(v_ingest.quota_reservation_id, false);
      exception when others then
        null;
      end;

      update public.vh_storage_objects
      set state = 'failed', updated_at = now()
      where id = v_ingest.storage_object_id and account_id = new.account_id and state <> 'ready';
    end if;

  elsif new.kind in ('part2.research.fast','part2.research.deep') then
    if coalesce(new.payload->>'sessionId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_target := (new.payload->>'sessionId')::uuid;
    else
      return new;
    end if;

    if new.state = 'retry' then
      update public.vh_research_sessions
      set status = 'queued',
          safe_error_code = 'RESEARCH_RETRY',
          updated_at = now()
      where id = v_target
        and account_id = new.account_id
        and status not in ('review','succeeded','failed','cancelled');
    elsif new.state = 'failed' then
      update public.vh_research_sessions
      set status = 'failed',
          safe_error_code = 'RESEARCH_FAILED',
          finished_at = now(),
          updated_at = now()
      where id = v_target
        and account_id = new.account_id
        and status not in ('review','succeeded','failed','cancelled');
    elsif new.state = 'cancelled' then
      update public.vh_research_sessions
      set status = 'cancelled',
          safe_error_code = null,
          finished_at = now(),
          updated_at = now()
      where id = v_target
        and account_id = new.account_id
        and status not in ('review','succeeded','failed','cancelled');
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.vh_sync_part2_job_state() from public, anon, authenticated;
grant execute on function public.vh_sync_part2_job_state() to service_role;

drop trigger if exists vh_jobs_part2_state_sync on public.vh_jobs;
create trigger vh_jobs_part2_state_sync
after update of state on public.vh_jobs
for each row
when (old.state is distinct from new.state)
execute function public.vh_sync_part2_job_state();
