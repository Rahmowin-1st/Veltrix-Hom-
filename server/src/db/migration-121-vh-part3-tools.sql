-- Veltrix Hom Backend Part 3 Stage 80: server-authoritative Explore tools.
-- Reuses vh_tool_runs and Library/source-chunk truth. No Conversation or Studio artifact is created.

alter table public.vh_tool_runs
  add column if not exists request_id uuid,
  add column if not exists idempotency_key text,
  add column if not exists request_fingerprint text,
  add column if not exists claim_token uuid,
  add column if not exists lease_expires_at timestamptz;

create unique index if not exists vh_tool_runs_owner_idem_uq
  on public.vh_tool_runs(account_id,tool_type,idempotency_key)
  where idempotency_key is not null;
create unique index if not exists vh_tool_runs_owner_request_uq
  on public.vh_tool_runs(account_id,request_id)
  where request_id is not null;
create index if not exists vh_tool_runs_active_lease_idx
  on public.vh_tool_runs(status,lease_expires_at)
  where status='RUNNING';

create or replace function public.vh_guard_tool_run_terminal_state()
returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.status in ('COMPLETED','FAILED','CANCELLED') then
    if new.status is distinct from old.status
       or new.output_payload is distinct from old.output_payload
       or new.request_id is distinct from old.request_id
       or new.idempotency_key is distinct from old.idempotency_key
       or new.input_payload is distinct from old.input_payload
       or new.input_refs is distinct from old.input_refs
       or new.claim_token is distinct from old.claim_token then
      raise exception 'tool_run_terminal_immutable' using errcode='23514';
    end if;
  end if;
  if new.status='COMPLETED' and new.output_payload is null then
    raise exception 'tool_output_required' using errcode='23514';
  end if;
  return new;
end $$;

drop trigger if exists vh_tool_run_terminal_guard on public.vh_tool_runs;
create trigger vh_tool_run_terminal_guard
before update on public.vh_tool_runs
for each row execute function public.vh_guard_tool_run_terminal_state();

create or replace function public.vh_begin_tool_run(
  p_account_id uuid,
  p_tool_type text,
  p_idempotency_key text,
  p_input_payload jsonb,
  p_asset_ids uuid[] default '{}'::uuid[],
  p_lease_seconds integer default 120
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_run public.vh_tool_runs%rowtype;
  v_tool_id uuid := gen_random_uuid();
  v_request_id uuid := gen_random_uuid();
  v_claim uuid := gen_random_uuid();
  v_fingerprint text;
  v_asset_fingerprint text;
  v_refs jsonb;
  v_expected integer;
  v_owned integer;
begin
  if p_tool_type not in ('calculator','translate','solve','summarize') then
    raise exception 'tool_type_invalid' using errcode='22023';
  end if;
  if p_idempotency_key is null or char_length(btrim(p_idempotency_key)) not between 1 and 128 then
    raise exception 'idempotency_key_invalid' using errcode='22023';
  end if;
  if p_input_payload is null or jsonb_typeof(p_input_payload) <> 'object' then
    raise exception 'tool_input_invalid' using errcode='22023';
  end if;
  if coalesce(array_length(p_asset_ids,1),0) > 5 then
    raise exception 'tool_asset_count_exceeded' using errcode='22023';
  end if;
  if p_lease_seconds not between 30 and 300 then
    raise exception 'tool_lease_invalid' using errcode='22023';
  end if;

  select count(distinct x)::integer into v_expected
  from unnest(coalesce(p_asset_ids,'{}'::uuid[])) x;
  select count(*)::integer into v_owned
  from public.vh_library_assets a
  where a.account_id=p_account_id
    and a.id=any(coalesce(p_asset_ids,'{}'::uuid[]))
    and a.trashed_at is null
    and a.processing_status='READY';
  if v_owned <> v_expected then
    raise exception 'tool_asset_not_ready_or_not_found' using errcode='P0002';
  end if;

  select coalesce(string_agg(x::text,',' order by x::text),'') into v_asset_fingerprint
  from (select distinct unnest(coalesce(p_asset_ids,'{}'::uuid[])) x) s;
  select coalesce(jsonb_agg(jsonb_build_object('assetId',x::text) order by x::text),'[]'::jsonb) into v_refs
  from (select distinct unnest(coalesce(p_asset_ids,'{}'::uuid[])) x) s;
  v_fingerprint := encode(digest(p_tool_type||E'\n'||p_input_payload::text||E'\n'||v_asset_fingerprint,'sha256'),'hex');

  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text||':tool:'||p_tool_type||':'||btrim(p_idempotency_key),0));
  select * into v_run from public.vh_tool_runs
    where account_id=p_account_id and tool_type=p_tool_type and idempotency_key=btrim(p_idempotency_key)
    limit 1 for update;

  if found then
    if v_run.request_fingerprint is distinct from v_fingerprint then
      raise exception 'tool_idempotency_conflict' using errcode='23514';
    end if;
    if v_run.status='RUNNING' and coalesce(v_run.lease_expires_at,'-infinity'::timestamptz) <= now() then
      v_claim := gen_random_uuid();
      update public.vh_tool_runs
      set claim_token=v_claim,lease_expires_at=now()+make_interval(secs=>p_lease_seconds),updated_at=now()
      where id=v_run.id;
      return jsonb_build_object(
        'toolRunId',v_run.id,'requestId',v_run.request_id,'status','RUNNING',
        'replayed',true,'authoritative',true,'claimToken',v_claim
      );
    end if;
    return jsonb_build_object(
      'toolRunId',v_run.id,'requestId',v_run.request_id,'status',v_run.status,
      'replayed',true,'authoritative',false,'claimToken',null,
      'output',v_run.output_payload,'errorCode',v_run.error_code
    );
  end if;

  insert into public.vh_tool_runs(
    id,account_id,tool_type,status,input_payload,input_refs,request_id,idempotency_key,
    request_fingerprint,claim_token,lease_expires_at,created_at,updated_at
  ) values (
    v_tool_id,p_account_id,p_tool_type,'RUNNING',p_input_payload,v_refs,v_request_id,btrim(p_idempotency_key),
    v_fingerprint,v_claim,now()+make_interval(secs=>p_lease_seconds),now(),now()
  );
  return jsonb_build_object(
    'toolRunId',v_tool_id,'requestId',v_request_id,'status','RUNNING',
    'replayed',false,'authoritative',true,'claimToken',v_claim
  );
end $$;

create or replace function public.vh_complete_tool_run(
  p_account_id uuid,
  p_tool_run_id uuid,
  p_claim_token uuid,
  p_output_payload jsonb,
  p_model_route jsonb default '{}'::jsonb,
  p_provenance jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_run public.vh_tool_runs%rowtype;
begin
  if p_output_payload is null or jsonb_typeof(p_output_payload) <> 'object' then
    raise exception 'tool_output_invalid' using errcode='22023';
  end if;
  select * into v_run from public.vh_tool_runs
    where id=p_tool_run_id and account_id=p_account_id for update;
  if not found then raise exception 'tool_run_not_found' using errcode='P0002'; end if;
  if v_run.status='COMPLETED' then
    return jsonb_build_object('toolRunId',v_run.id,'status','COMPLETED','output',v_run.output_payload,'replayed',true);
  end if;
  if v_run.status <> 'RUNNING' then raise exception 'tool_run_terminal' using errcode='23514'; end if;
  if v_run.claim_token is distinct from p_claim_token or coalesce(v_run.lease_expires_at,'-infinity'::timestamptz) <= now() then
    raise exception 'tool_claim_stale' using errcode='23514';
  end if;
  update public.vh_tool_runs
  set status='COMPLETED',output_payload=p_output_payload,model_route=coalesce(p_model_route,'{}'::jsonb),
      provenance=coalesce(p_provenance,'{}'::jsonb),error_code=null,completed_at=now(),lease_expires_at=null,updated_at=now()
  where id=p_tool_run_id;
  return jsonb_build_object('toolRunId',p_tool_run_id,'status','COMPLETED','output',p_output_payload,'replayed',false);
end $$;

create or replace function public.vh_fail_tool_run(
  p_account_id uuid,p_tool_run_id uuid,p_claim_token uuid,p_error_code text,p_provenance jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_run public.vh_tool_runs%rowtype; v_code text;
begin
  v_code := left(coalesce(nullif(btrim(p_error_code),''),'TOOL_FAILED'),96);
  select * into v_run from public.vh_tool_runs where id=p_tool_run_id and account_id=p_account_id for update;
  if not found then raise exception 'tool_run_not_found' using errcode='P0002'; end if;
  if v_run.status='FAILED' then
    return jsonb_build_object('toolRunId',v_run.id,'status','FAILED','errorCode',v_run.error_code,'replayed',true);
  end if;
  if v_run.status <> 'RUNNING' then raise exception 'tool_run_terminal' using errcode='23514'; end if;
  if v_run.claim_token is distinct from p_claim_token then raise exception 'tool_claim_stale' using errcode='23514'; end if;
  update public.vh_tool_runs
  set status='FAILED',output_payload=null,error_code=v_code,provenance=coalesce(p_provenance,'{}'::jsonb),
      completed_at=now(),lease_expires_at=null,updated_at=now()
  where id=p_tool_run_id;
  return jsonb_build_object('toolRunId',p_tool_run_id,'status','FAILED','errorCode',v_code,'replayed',false);
end $$;

create or replace function public.vh_extend_tool_run_lease(
  p_account_id uuid,p_tool_run_id uuid,p_claim_token uuid,p_lease_seconds integer default 120
) returns timestamptz
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_exp timestamptz;
begin
  if p_lease_seconds not between 30 and 300 then raise exception 'tool_lease_invalid' using errcode='22023'; end if;
  update public.vh_tool_runs
  set lease_expires_at=now()+make_interval(secs=>p_lease_seconds),updated_at=now()
  where id=p_tool_run_id and account_id=p_account_id and status='RUNNING' and claim_token=p_claim_token
  returning lease_expires_at into v_exp;
  if not found then raise exception 'tool_claim_stale' using errcode='23514'; end if;
  return v_exp;
end $$;

create or replace function public.vh_get_tool_asset_context(
  p_account_id uuid,p_asset_ids uuid[],p_max_chars integer default 30000
) returns table(asset_id uuid,source_kind text,display_title text,content text,locator jsonb,content_hash text)
language sql stable security definer set search_path=public,pg_temp as $$
  with wanted as (
    select distinct unnest(coalesce(p_asset_ids,'{}'::uuid[])) id
  ), eligible as (
    select a.id,a.source_kind,a.display_title,a.source_revision
    from wanted w
    join public.vh_library_assets a on a.id=w.id
      and a.account_id=p_account_id and a.trashed_at is null and a.processing_status='READY'
  ), chunks as (
    select e.id,e.source_kind,e.display_title,c.content,c.locator,c.content_hash,c.chunk_index,
      sum(char_length(c.content)) over(partition by e.id order by c.chunk_index rows unbounded preceding) running_chars
    from eligible e
    join public.vh_source_chunks c on c.asset_id=e.id and c.account_id=p_account_id and c.source_revision=e.source_revision
  )
  select id,source_kind,display_title,content,locator,content_hash
  from chunks
  where running_chars-char_length(content) < greatest(1000,least(coalesce(p_max_chars,30000),60000))
  order by id,chunk_index;
$$;

revoke all on function public.vh_guard_tool_run_terminal_state() from public,anon,authenticated;
revoke all on function public.vh_begin_tool_run(uuid,text,text,jsonb,uuid[],integer) from public,anon,authenticated;
revoke all on function public.vh_complete_tool_run(uuid,uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.vh_fail_tool_run(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.vh_extend_tool_run_lease(uuid,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.vh_get_tool_asset_context(uuid,uuid[],integer) from public,anon,authenticated;

grant execute on function public.vh_begin_tool_run(uuid,text,text,jsonb,uuid[],integer) to service_role;
grant execute on function public.vh_complete_tool_run(uuid,uuid,uuid,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.vh_fail_tool_run(uuid,uuid,uuid,text,jsonb) to service_role;
grant execute on function public.vh_extend_tool_run_lease(uuid,uuid,uuid,integer) to service_role;
grant execute on function public.vh_get_tool_asset_context(uuid,uuid[],integer) to service_role;
