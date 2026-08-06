-- =====================================================================
-- Executable tests for the durable processing queue (migration-008).
--   psql -v ON_ERROR_STOP=1 -d <db> -f jobqueue.test.sql
-- Every assertion is collected; the run fails loudly if any did not hold.
-- =====================================================================
\set ON_ERROR_STOP on
begin;
create temporary table _t(name text, ok boolean);

do $$
declare
  v_user uuid := gen_random_uuid();
  v_src  uuid;
  v_job  public.processing_jobs;
  v_dup  boolean := false;
  v_cnt  int;
begin
  insert into auth.users(id,email,raw_user_meta_data)
    values (v_user,'jobs@veltrix.local','{}'::jsonb);
  insert into public.sources(user_id,title,status)
    values (v_user,'Test kitob','uploading') returning id into v_src;

  -- 1. Enqueue.
  insert into public.processing_jobs(user_id,source_id,job_type,status)
    values (v_user,v_src,'extract','queued');
  select count(*) into v_cnt from public.processing_jobs where source_id=v_src;
  insert into _t values ('job enqueued', v_cnt = 1);

  -- 2. A second ACTIVE job for the same (source, type) must be rejected,
  --    so a retried upload cannot queue duplicate work for one book.
  begin
    insert into public.processing_jobs(user_id,source_id,job_type,status)
      values (v_user,v_src,'extract','queued');
  exception when unique_violation then v_dup := true;
  end;
  insert into _t values ('duplicate active job blocked', v_dup);

  -- 3. Claiming takes a lease and flips the row to running.
  select * into v_job from public.claim_processing_job(120);
  insert into _t values ('worker claimed a job', v_job.id is not null);
  insert into _t values ('claimed job is running', v_job.status = 'running');
  insert into _t values ('lease token issued', v_job.lease_token is not null);

  -- 4. A second worker must NOT get the same job.
  declare v_second public.processing_jobs;
  begin
    select * into v_second from public.claim_processing_job(120);
    insert into _t values ('second worker gets nothing', v_second.id is null);
  end;

  -- 5. Crash simulation: expire the lease after a checkpoint. The next
  --    claim must resume from the checkpoint, not from page one.
  update public.processing_jobs
     set checkpoint_page = 24, lease_expires_at = now() - interval '1 minute'
   where source_id = v_src;

  select * into v_job from public.claim_processing_job(120);
  insert into _t values ('dead lease reclaimed', v_job.id is not null);
  insert into _t values ('resumes from checkpoint 24', v_job.checkpoint_page = 24);
  insert into _t values ('attempt count incremented', v_job.attempt_count = 2);
end $$;

select name, case when ok then 'PASS' else 'FAIL' end as result from _t order by name;

do $$
declare v_failed int;
begin
  select count(*) into v_failed from _t where not ok;
  if v_failed > 0 then raise exception '% assertion(s) FAILED', v_failed; end if;
  raise notice 'All % assertions passed.', (select count(*) from _t);
end $$;
rollback;
