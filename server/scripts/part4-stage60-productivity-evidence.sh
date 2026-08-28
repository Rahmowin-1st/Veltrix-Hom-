#!/usr/bin/env bash
set -euo pipefail

psql -X -v ON_ERROR_STOP=1 <<'SQL'
\set VERBOSITY verbose

do $$
declare
  a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  g uuid := '31000000-0000-4000-8000-000000000001';
  child uuid := '31000000-0000-4000-8000-000000000002';
  t uuid := '32000000-0000-4000-8000-000000000001';
  n uuid; first_rev uuid; curr_rev_id uuid; nr bigint; tr bigint; pr uuid; pgr uuid; progress integer; caught boolean; deleted_count integer; i integer;
  retain_note uuid; retain_rev uuid; retain_current bigint;
  blocks1 jsonb := '[{"type":"h1","runs":[{"text":"Physics"}]},{"type":"paragraph","runs":[{"text":"Initial"}]}]'::jsonb;
  blocks2 jsonb := '[{"type":"h1","runs":[{"text":"Physics"}]},{"type":"paragraph","runs":[{"text":"Autosaved"}]}]'::jsonb;
  blocks_ai jsonb := '[{"type":"h1","runs":[{"text":"Physics improved"}]},{"type":"callout","runs":[{"text":"AI proposal accepted only after confirmation"}],"tone":"info"}]'::jsonb;
begin
  insert into public.vh_accounts(id,email,status) values(a,'p4-productivity-a@example.test','active'),(b,'p4-productivity-b@example.test','active') on conflict(id) do nothing;

  insert into public.vh_goals(id,account_id,title,weight) values(g,a,'Main Goal',1);
  progress:=public.vh_recompute_goal_progress(a,g);
  if progress<>0 then raise exception 'P4_GOAL_NO_COMPONENT_EXPECTED_0 actual=%',progress; end if;

  insert into public.vh_goal_milestones(account_id,goal_id,title,weight,completed) values(a,g,'Done milestone',1,true);
  insert into public.vh_goal_milestones(account_id,goal_id,title,weight,completed) values(a,g,'Pending milestone',3,false);
  select progress_basis_points into progress from public.vh_goals where id=g;
  if progress<>2500 then raise exception 'P4_GOAL_WEIGHT_NORMALIZATION expected=2500 actual=%',progress; end if;

  -- Todo is first-class and may exist without a Goal.
  insert into public.vh_todos(id,account_id,title,status) values(t,a,'Independent Todo','OPEN');
  if exists(select 1 from public.vh_goal_todo_links where todo_id=t) then raise exception 'P4_TODO_NOT_INDEPENDENT'; end if;

  insert into public.vh_goal_todo_links(account_id,goal_id,todo_id,weight) values(a,g,t,4);
  select progress_basis_points into progress from public.vh_goals where id=g;
  if progress<>1250 then raise exception 'P4_GOAL_OPEN_TODO_PROGRESS expected=1250 actual=%',progress; end if;

  select revision into tr from public.vh_todos where id=t;
  perform public.vh_patch_todo(a,t,tr,jsonb_build_object('status','COMPLETED'));
  select progress_basis_points into progress from public.vh_goals where id=g;
  if progress<>6250 then raise exception 'P4_GOAL_COMPLETED_TODO_PROGRESS expected=6250 actual=%',progress; end if;

  select revision into tr from public.vh_todos where id=t;
  perform public.vh_patch_todo(a,t,tr,jsonb_build_object('archived',true));
  select progress_basis_points into progress from public.vh_goals where id=g;
  if progress<>2500 then raise exception 'P4_GOAL_ARCHIVED_TODO_NOT_EXCLUDED expected=2500 actual=%',progress; end if;

  select revision into tr from public.vh_todos where id=t;
  perform public.vh_patch_todo(a,t,tr,jsonb_build_object('archived',false));
  select progress_basis_points into progress from public.vh_goals where id=g;
  if progress<>6250 then raise exception 'P4_GOAL_UNARCHIVE_RECOMPUTE expected=6250 actual=%',progress; end if;

  insert into public.vh_goals(id,account_id,parent_goal_id,title,weight,progress_basis_points) values(child,a,g,'Child',2,10000);
  progress:=public.vh_recompute_goal_progress(a,g);
  if progress<>7000 then raise exception 'P4_GOAL_CHILD_COMPONENT expected=7000 actual=%',progress; end if;

  update public.vh_goals set trashed_at=now(),purge_after=now()+interval '30 days' where id=child and account_id=a;
  select progress_basis_points into progress from public.vh_goals where id=g;
  if progress<>6250 then raise exception 'P4_GOAL_CHILD_TRASH expected=6250 actual=%',progress; end if;
  delete from public.vh_goals where id=child and account_id=a;
  progress:=public.vh_recompute_goal_progress(a,g);
  if progress<>6250 then raise exception 'P4_GOAL_CHILD_DELETE_CHANGED_EXCLUDED_PROGRESS'; end if;

  -- Recreate child to prove cycle prevention.
  insert into public.vh_goals(id,account_id,parent_goal_id,title,weight) values(child,a,g,'Child 2',1);
  select revision into nr from public.vh_goals where id=g;
  caught:=false;
  begin perform public.vh_patch_goal(a,g,nr,jsonb_build_object('parentGoalId',child::text)); exception when others then caught:=true; end;
  if not caught then raise exception 'P4_GOAL_CYCLE_ALLOWED'; end if;

  -- Goal proposal must not mutate until explicit acceptance.
  select revision into nr from public.vh_goals where id=g;
  insert into public.vh_ai_change_proposals(account_id,target_kind,target_id,operation,base_revision,proposal,status)
  values(a,'goal',g,'priority',nr,'{"priority":"HIGH"}'::jsonb,'PENDING') returning id into pgr;
  if (select priority from public.vh_goals where id=g)<>'NORMAL' then raise exception 'P4_AI_PROPOSAL_MUTATED_BEFORE_ACCEPT'; end if;
  perform public.vh_accept_ai_change_proposal(a,pgr);
  if (select priority from public.vh_goals where id=g)<>'HIGH' then raise exception 'P4_AI_GOAL_ACCEPT_DID_NOT_MUTATE'; end if;

  -- Rich Note create/autosave/concurrency/restore.
  select note_id,revision_id,revision into n,first_rev,nr from public.vh_create_note(a,'Structured Note',blocks1,public.vh_part4_sha256(blocks1::text),200);
  if nr<>1 then raise exception 'P4_NOTE_CREATE_REVISION'; end if;
  select revision into nr from public.vh_notes where id=n;
  perform * from public.vh_save_note_revision(a,n,nr,'AUTOSAVE',blocks2,public.vh_part4_sha256(blocks2::text));
  if (select revision from public.vh_notes where id=n)<>2 then raise exception 'P4_NOTE_AUTOSAVE_REVISION'; end if;

  caught:=false;
  begin perform * from public.vh_save_note_revision(a,n,1,'USER',blocks1,public.vh_part4_sha256(blocks1::text)); exception when others then caught:=true; end;
  if not caught then raise exception 'P4_NOTE_STALE_SAVE_OVERWROTE_NEWER'; end if;

  perform * from public.vh_restore_note_version(a,n,first_rev,2);
  if (select revision from public.vh_notes where id=n)<>3 then raise exception 'P4_NOTE_RESTORE_REVISION'; end if;
  if (select source_kind from public.vh_note_versions where id=(select current_revision_id from public.vh_notes where id=n))<>'RESTORED' then raise exception 'P4_NOTE_RESTORE_SOURCE_KIND'; end if;

  -- Note AI proposal remains preview until explicit accept.
  insert into public.vh_ai_change_proposals(account_id,target_kind,target_id,operation,base_revision,proposal,status)
  values(a,'note',n,'rewrite',3,jsonb_build_object('blocks',blocks_ai),'PENDING') returning id into pr;
  if (select revision from public.vh_notes where id=n)<>3 then raise exception 'P4_AI_NOTE_MUTATED_BEFORE_ACCEPT'; end if;
  perform public.vh_accept_ai_change_proposal(a,pr);
  if (select revision from public.vh_notes where id=n)<>4 then raise exception 'P4_AI_NOTE_ACCEPT_REVISION'; end if;
  select current_revision_id into curr_rev_id from public.vh_notes where id=n;
  if (select source_kind from public.vh_note_versions where id=curr_rev_id)<>'AI_ACCEPTED' then raise exception 'P4_AI_NOTE_ACCEPT_SOURCE_KIND'; end if;

  caught:=false;
  begin perform public.vh_accept_ai_change_proposal(b,pr); exception when others then caught:=true; end;
  if not caught then raise exception 'P4_PROPOSAL_CROSS_USER_ACCEPT_ALLOWED'; end if;

  -- Configurable retention compacts old AUTOSAVEs while preserving durable non-autosave history.
  select note_id,revision_id,revision into retain_note,retain_rev,retain_current from public.vh_create_note(a,'Retention Note',blocks1,public.vh_part4_sha256(blocks1::text),20);
  for i in 1..25 loop
    perform * from public.vh_save_note_revision(a,retain_note,retain_current,'AUTOSAVE',jsonb_build_array(jsonb_build_object('type','paragraph','runs',jsonb_build_array(jsonb_build_object('text','autosave-'||i)))),public.vh_part4_sha256(('autosave-'||i)::text));
    retain_current:=retain_current+1;
  end loop;
  deleted_count:=public.vh_compact_note_versions(a,retain_note);
  if deleted_count<=0 or (select count(*) from public.vh_note_versions where note_id=retain_note)>21 then raise exception 'P4_NOTE_COMPACTION_FAILED deleted=% remaining=%',deleted_count,(select count(*) from public.vh_note_versions where note_id=retain_note); end if;

  raise notice 'P4_GOALS=PASS weighted_progress cycle_guard child_trash_delete';
  raise notice 'P4_TODOS=PASS independent_lifecycle archived_exclusion';
  raise notice 'P4_NOTES=PASS autosave concurrency restore retention';
  raise notice 'P4_AI_CONFIRMATION=PASS no_mutation_before_accept';
end $$;

select 'P4_STAGE60_PRODUCTIVITY=PASS';
SQL
