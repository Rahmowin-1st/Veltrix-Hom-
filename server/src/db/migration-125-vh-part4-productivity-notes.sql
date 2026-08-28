-- Veltrix Hom Backend Part 4: Goals/Todos/Notes authoritative contracts.

alter table public.vh_notes add column if not exists retention_versions integer not null default 200 check (retention_versions between 20 and 5000);

-- Prevent recursive/cyclic Goal trees and cross-owner parenting.
create or replace function public.vh_goal_parent_guard() returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare found_cycle boolean;
begin
  if new.parent_goal_id is null then return new; end if;
  if new.parent_goal_id=new.id then raise exception 'goal_cycle' using errcode='22023'; end if;
  if not exists(select 1 from public.vh_goals p where p.id=new.parent_goal_id and p.account_id=new.account_id) then raise exception 'goal_parent_forbidden' using errcode='P0001'; end if;
  with recursive ancestors(id,parent_goal_id) as (
    select g.id,g.parent_goal_id from public.vh_goals g where g.id=new.parent_goal_id and g.account_id=new.account_id
    union all
    select g.id,g.parent_goal_id from public.vh_goals g join ancestors a on g.id=a.parent_goal_id where g.account_id=new.account_id
  ) select exists(select 1 from ancestors where id=new.id) into found_cycle;
  if found_cycle then raise exception 'goal_cycle' using errcode='22023'; end if;
  return new;
end;
$$;
drop trigger if exists vh_goals_parent_guard on public.vh_goals;
create trigger vh_goals_parent_guard before insert or update of parent_goal_id,account_id on public.vh_goals for each row execute function public.vh_goal_parent_guard();

-- Weighted deterministic Goal progress. Active milestones, linked Todos and active child Goals are components.
create or replace function public.vh_recompute_goal_progress(p_account_id uuid,p_goal_id uuid) returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare total_weight numeric:=0; earned numeric:=0; result integer:=0; parent_id uuid;
begin
  if not exists(select 1 from public.vh_goals where id=p_goal_id and account_id=p_account_id) then raise exception 'goal_forbidden' using errcode='P0001'; end if;

  select coalesce(sum(weight),0),coalesce(sum(weight*case when completed then 1 else 0 end),0)
    into total_weight,earned
  from public.vh_goal_milestones
  where account_id=p_account_id and goal_id=p_goal_id and trashed_at is null and archived_at is null and weight>0;

  select total_weight+coalesce(sum(l.weight),0),earned+coalesce(sum(l.weight*case when t.status='COMPLETED' then 1 else 0 end),0)
    into total_weight,earned
  from public.vh_goal_todo_links l join public.vh_todos t on t.id=l.todo_id and t.account_id=l.account_id
  where l.account_id=p_account_id and l.goal_id=p_goal_id and t.trashed_at is null and t.archived_at is null and t.status<>'CANCELLED' and l.weight>0;

  select total_weight+coalesce(sum(g.weight),0),earned+coalesce(sum(g.weight*(g.progress_basis_points::numeric/10000)),0)
    into total_weight,earned
  from public.vh_goals g
  where g.account_id=p_account_id and g.parent_goal_id=p_goal_id and g.trashed_at is null and g.state<>'ARCHIVED' and g.weight>0;

  if total_weight>0 then result:=least(10000,greatest(0,round(earned/total_weight*10000)::integer)); else result:=0; end if;
  update public.vh_goals set progress_basis_points=result,updated_at=now(),revision=revision+1 where id=p_goal_id and account_id=p_account_id and progress_basis_points is distinct from result;
  select parent_goal_id into parent_id from public.vh_goals where id=p_goal_id and account_id=p_account_id;
  if parent_id is not null then perform public.vh_recompute_goal_progress(p_account_id,parent_id); end if;
  return result;
end;
$$;
revoke all on function public.vh_recompute_goal_progress(uuid,uuid) from public,anon,authenticated;
grant execute on function public.vh_recompute_goal_progress(uuid,uuid) to service_role;

create or replace function public.vh_goal_component_trigger() returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare aid uuid; gid uuid; r record;
begin
  if tg_table_name='vh_goal_milestones' then
    aid:=coalesce(new.account_id,old.account_id); gid:=coalesce(new.goal_id,old.goal_id); perform public.vh_recompute_goal_progress(aid,gid);
  elsif tg_table_name='vh_goal_todo_links' then
    aid:=coalesce(new.account_id,old.account_id); gid:=coalesce(new.goal_id,old.goal_id); perform public.vh_recompute_goal_progress(aid,gid);
  elsif tg_table_name='vh_todos' then
    aid:=coalesce(new.account_id,old.account_id);
    for r in select goal_id from public.vh_goal_todo_links where account_id=aid and todo_id=coalesce(new.id,old.id) loop perform public.vh_recompute_goal_progress(aid,r.goal_id); end loop;
  elsif tg_table_name='vh_goals' then
    aid:=coalesce(new.account_id,old.account_id); gid:=coalesce(new.parent_goal_id,old.parent_goal_id);
    if gid is not null and gid is distinct from coalesce(new.id,old.id) then perform public.vh_recompute_goal_progress(aid,gid); end if;
  end if;
  return coalesce(new,old);
end;
$$;

drop trigger if exists vh_goal_milestones_progress_trg on public.vh_goal_milestones;
create trigger vh_goal_milestones_progress_trg after insert or update or delete on public.vh_goal_milestones for each row execute function public.vh_goal_component_trigger();
drop trigger if exists vh_goal_todo_links_progress_trg on public.vh_goal_todo_links;
create trigger vh_goal_todo_links_progress_trg after insert or update or delete on public.vh_goal_todo_links for each row execute function public.vh_goal_component_trigger();
drop trigger if exists vh_todos_progress_trg on public.vh_todos;
create trigger vh_todos_progress_trg after update of status,archived_at,trashed_at on public.vh_todos for each row execute function public.vh_goal_component_trigger();
drop trigger if exists vh_child_goal_progress_trg on public.vh_goals;
create trigger vh_child_goal_progress_trg after update of progress_basis_points,state,trashed_at,weight,parent_goal_id on public.vh_goals for each row when (new.parent_goal_id is not null or old.parent_goal_id is not null) execute function public.vh_goal_component_trigger();

create or replace function public.vh_patch_goal(p_account_id uuid,p_goal_id uuid,p_expected_revision bigint,p_patch jsonb) returns bigint
language plpgsql security definer set search_path=public,pg_temp
as $$
declare g public.vh_goals%rowtype; newrev bigint;
begin
  select * into g from public.vh_goals where id=p_goal_id and account_id=p_account_id and trashed_at is null for update;
  if not found then raise exception 'goal_forbidden' using errcode='P0001'; end if;
  if g.revision<>p_expected_revision then raise exception 'goal_revision_conflict' using errcode='40001'; end if;
  if exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('title','description','deadline','priority','state','pinned','manualOrder','parentGoalId','weight')) then raise exception 'goal_patch_field_invalid' using errcode='22023'; end if;
  update public.vh_goals set
    title=case when p_patch?'title' then p_patch->>'title' else title end,
    description=case when p_patch?'description' then nullif(p_patch->>'description','') else description end,
    deadline=case when p_patch?'deadline' then nullif(p_patch->>'deadline','')::timestamptz else deadline end,
    priority=case when p_patch?'priority' then p_patch->>'priority' else priority end,
    state=case when p_patch?'state' then p_patch->>'state' else state end,
    pinned=case when p_patch?'pinned' then (p_patch->>'pinned')::boolean else pinned end,
    manual_order=case when p_patch?'manualOrder' then (p_patch->>'manualOrder')::bigint else manual_order end,
    parent_goal_id=case when p_patch?'parentGoalId' then nullif(p_patch->>'parentGoalId','')::uuid else parent_goal_id end,
    weight=case when p_patch?'weight' then (p_patch->>'weight')::numeric else weight end,
    completed_at=case when p_patch->>'state'='COMPLETED' then coalesce(completed_at,now()) when p_patch?'state' then null else completed_at end,
    revision=revision+1,updated_at=now()
  where id=p_goal_id and account_id=p_account_id returning revision into newrev;
  return newrev;
end;
$$;
revoke all on function public.vh_patch_goal(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.vh_patch_goal(uuid,uuid,bigint,jsonb) to service_role;

create or replace function public.vh_patch_todo(p_account_id uuid,p_todo_id uuid,p_expected_revision bigint,p_patch jsonb) returns bigint
language plpgsql security definer set search_path=public,pg_temp
as $$
declare t public.vh_todos%rowtype; newrev bigint;
begin
  select * into t from public.vh_todos where id=p_todo_id and account_id=p_account_id and trashed_at is null for update;
  if not found then raise exception 'todo_forbidden' using errcode='P0001'; end if;
  if t.revision<>p_expected_revision then raise exception 'todo_revision_conflict' using errcode='40001'; end if;
  if exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('title','description','deadline','priority','status','pinned','manualOrder','archived')) then raise exception 'todo_patch_field_invalid' using errcode='22023'; end if;
  update public.vh_todos set
    title=case when p_patch?'title' then p_patch->>'title' else title end,
    description=case when p_patch?'description' then nullif(p_patch->>'description','') else description end,
    deadline=case when p_patch?'deadline' then nullif(p_patch->>'deadline','')::timestamptz else deadline end,
    priority=case when p_patch?'priority' then p_patch->>'priority' else priority end,
    status=case when p_patch?'status' then p_patch->>'status' else status end,
    pinned=case when p_patch?'pinned' then (p_patch->>'pinned')::boolean else pinned end,
    manual_order=case when p_patch?'manualOrder' then (p_patch->>'manualOrder')::bigint else manual_order end,
    archived_at=case when p_patch?'archived' and (p_patch->>'archived')::boolean then coalesce(archived_at,now()) when p_patch?'archived' then null else archived_at end,
    completed_at=case when p_patch->>'status'='COMPLETED' then coalesce(completed_at,now()) when p_patch?'status' then null else completed_at end,
    revision=revision+1,updated_at=now()
  where id=p_todo_id and account_id=p_account_id returning revision into newrev;
  return newrev;
end;
$$;
revoke all on function public.vh_patch_todo(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.vh_patch_todo(uuid,uuid,bigint,jsonb) to service_role;

-- Structured Note revision protocol. Every accepted save becomes durable immutable history.
create or replace function public.vh_create_note(
  p_account_id uuid,p_title text,p_blocks jsonb,p_blocks_fingerprint text,p_retention_versions integer default 200
) returns table(note_id uuid,revision_id uuid,revision bigint)
language plpgsql security definer set search_path=public,pg_temp
as $$
declare n uuid; r uuid;
begin
  if jsonb_typeof(p_blocks)<>'array' or p_blocks_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'note_payload_invalid' using errcode='22023'; end if;
  insert into public.vh_notes(account_id,title,retention_versions) values(p_account_id,p_title,p_retention_versions) returning id into n;
  insert into public.vh_note_versions(account_id,note_id,revision_no,source_kind,blocks,blocks_fingerprint) values(p_account_id,n,1,'USER',p_blocks,p_blocks_fingerprint) returning id into r;
  update public.vh_notes set current_revision_id=r where id=n and account_id=p_account_id;
  return query select n,r,1::bigint;
end;
$$;
revoke all on function public.vh_create_note(uuid,text,jsonb,text,integer) from public,anon,authenticated;
grant execute on function public.vh_create_note(uuid,text,jsonb,text,integer) to service_role;

create or replace function public.vh_save_note_revision(
  p_account_id uuid,p_note_id uuid,p_expected_revision bigint,p_source_kind text,p_blocks jsonb,p_blocks_fingerprint text
) returns table(revision_id uuid,revision bigint)
language plpgsql security definer set search_path=public,pg_temp
as $$
declare n public.vh_notes%rowtype; r uuid; nextrev bigint;
begin
  if p_source_kind not in ('USER','AI_ACCEPTED','RESTORED','AUTOSAVE') or jsonb_typeof(p_blocks)<>'array' or p_blocks_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'note_payload_invalid' using errcode='22023'; end if;
  select * into n from public.vh_notes where id=p_note_id and account_id=p_account_id and trashed_at is null for update;
  if not found then raise exception 'note_forbidden' using errcode='P0001'; end if;
  if n.revision<>p_expected_revision then raise exception 'note_revision_conflict' using errcode='40001'; end if;
  nextrev:=n.revision+1;
  insert into public.vh_note_versions(account_id,note_id,revision_no,parent_revision_id,source_kind,blocks,blocks_fingerprint)
  values(p_account_id,p_note_id,nextrev,n.current_revision_id,p_source_kind,p_blocks,p_blocks_fingerprint) returning id into r;
  update public.vh_notes set current_revision_id=r,revision=nextrev,updated_at=now() where id=p_note_id;
  return query select r,nextrev;
end;
$$;
revoke all on function public.vh_save_note_revision(uuid,uuid,bigint,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.vh_save_note_revision(uuid,uuid,bigint,text,jsonb,text) to service_role;

create or replace function public.vh_restore_note_version(p_account_id uuid,p_note_id uuid,p_version_id uuid,p_expected_revision bigint) returns table(revision_id uuid,revision bigint)
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v public.vh_note_versions%rowtype;
begin
  select * into v from public.vh_note_versions where id=p_version_id and note_id=p_note_id and account_id=p_account_id;
  if not found then raise exception 'note_version_forbidden' using errcode='P0001'; end if;
  return query select * from public.vh_save_note_revision(p_account_id,p_note_id,p_expected_revision,'RESTORED',v.blocks,v.blocks_fingerprint);
end;
$$;
revoke all on function public.vh_restore_note_version(uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.vh_restore_note_version(uuid,uuid,uuid,bigint) to service_role;

create or replace function public.vh_compact_note_versions(p_account_id uuid,p_note_id uuid) returns integer
language plpgsql security definer set search_path=public,pg_temp
as $$
declare keep_count integer; deleted_count integer;
begin
  select retention_versions into keep_count from public.vh_notes where id=p_note_id and account_id=p_account_id;
  if keep_count is null then raise exception 'note_forbidden' using errcode='P0001'; end if;
  with ranked as (
    select id,row_number() over(order by revision_no desc) rn,source_kind from public.vh_note_versions where account_id=p_account_id and note_id=p_note_id
  ), doomed as (select id from ranked where rn>keep_count and source_kind='AUTOSAVE')
  delete from public.vh_note_versions v using doomed d where v.id=d.id;
  get diagnostics deleted_count=row_count;
  return deleted_count;
end;
$$;
revoke all on function public.vh_compact_note_versions(uuid,uuid) from public,anon,authenticated;
grant execute on function public.vh_compact_note_versions(uuid,uuid) to service_role;

-- AI proposal confirmation gate. PENDING proposal itself never mutates authoritative target state.
create or replace function public.vh_accept_ai_change_proposal(p_account_id uuid,p_proposal_id uuid) returns bigint
language plpgsql security definer set search_path=public,pg_temp
as $$
declare p public.vh_ai_change_proposals%rowtype; outrev bigint; fp text; rid uuid;
begin
  select * into p from public.vh_ai_change_proposals where id=p_proposal_id and account_id=p_account_id for update;
  if not found then raise exception 'proposal_forbidden' using errcode='P0001'; end if;
  if p.status<>'PENDING' then raise exception 'proposal_not_pending' using errcode='P0001'; end if;
  if p.target_kind='goal' then
    outrev:=public.vh_patch_goal(p_account_id,p.target_id,p.base_revision,p.proposal);
  elsif p.target_kind='todo' then
    outrev:=public.vh_patch_todo(p_account_id,p.target_id,p.base_revision,p.proposal);
  elsif p.target_kind='note' then
    if jsonb_typeof(p.proposal->'blocks')<>'array' then raise exception 'note_proposal_blocks_required' using errcode='22023'; end if;
    fp:=public.vh_part4_sha256((p.proposal->'blocks')::text);
    select revision_id,revision into rid,outrev from public.vh_save_note_revision(p_account_id,p.target_id,p.base_revision,'AI_ACCEPTED',p.proposal->'blocks',fp);
  else raise exception 'proposal_target_invalid' using errcode='22023'; end if;
  update public.vh_ai_change_proposals set status='ACCEPTED',resolved_at=now() where id=p_proposal_id;
  return outrev;
end;
$$;
revoke all on function public.vh_accept_ai_change_proposal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.vh_accept_ai_change_proposal(uuid,uuid) to service_role;
