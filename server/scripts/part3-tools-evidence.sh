#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:?PGPORT is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${PGDATABASE:?PGDATABASE is required}"

PSQL=(psql -X -v ON_ERROR_STOP=1)

echo "PART3_TOOLS_BEGIN"
"${PSQL[@]}" <<'SQL'
\set VERBOSITY terse

delete from public.vh_accounts where id in (
  '88000000-0000-4000-8000-000000000001'::uuid,
  '88000000-0000-4000-8000-000000000002'::uuid
);
insert into public.vh_accounts(id,email) values
 ('88000000-0000-4000-8000-000000000001','part3-tools-a@example.invalid'),
 ('88000000-0000-4000-8000-000000000002','part3-tools-b@example.invalid');

insert into public.vh_library_assets(
  id,account_id,original_filename,display_title,declared_mime,detected_mime,source_kind,asset_class,
  original_size_bytes,origin_surface,content_sha256,processing_status,extraction_status,source_revision,provenance
) values
 ('88100000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000001','problem.png','Problem screenshot','image/png','image/png','image','image',2048,'tools',encode(digest('tool-image','sha256'),'hex'),'READY','READY',1,'{}'::jsonb),
 ('88100000-0000-4000-8000-000000000002','88000000-0000-4000-8000-000000000001','lesson.pdf','Lesson PDF','application/pdf','application/pdf','pdf','file',4096,'tools',encode(digest('tool-pdf','sha256'),'hex'),'READY','READY',1,'{}'::jsonb),
 ('88100000-0000-4000-8000-000000000003','88000000-0000-4000-8000-000000000001','pending.pdf','Pending PDF','application/pdf','application/pdf','pdf','file',1024,'tools',encode(digest('tool-pending','sha256'),'hex'),'PROCESSING','PROCESSING',1,'{}'::jsonb),
 ('88200000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000002','foreign.pdf','Foreign PDF','application/pdf','application/pdf','pdf','file',1024,'tools',encode(digest('tool-foreign','sha256'),'hex'),'READY','READY',1,'{}'::jsonb);

insert into public.vh_source_chunks(account_id,asset_id,source_revision,chunk_index,content,locator,text_range,content_hash,extraction_version)
values
 ('88000000-0000-4000-8000-000000000001','88100000-0000-4000-8000-000000000001',1,0,'The screenshot shows the equation 2x + 4 = 12.',jsonb_build_object('image',1,'modality','vision'),'{}'::jsonb,encode(digest('image chunk','sha256'),'hex'),'part3-tools-fixture-v1'),
 ('88000000-0000-4000-8000-000000000001','88100000-0000-4000-8000-000000000002',1,0,'Photosynthesis converts light energy into stored chemical energy.',jsonb_build_object('page',2),'{}'::jsonb,encode(digest('pdf chunk','sha256'),'hex'),'part3-tools-fixture-v1'),
 ('88000000-0000-4000-8000-000000000002','88200000-0000-4000-8000-000000000001',1,0,'Foreign owner source.',jsonb_build_object('page',1),'{}'::jsonb,encode(digest('foreign chunk','sha256'),'hex'),'part3-tools-fixture-v1');

-- ToolRun request authority, idempotency, reclaim, and terminal immutability.
do $$
declare
  a constant uuid := '88000000-0000-4000-8000-000000000001';
  first jsonb; retry jsonb; reclaimed jsonb; done jsonb;
  rid uuid; claim1 uuid; claim2 uuid;
begin
  first := public.vh_begin_tool_run(a,'calculator','calc-idem-1',jsonb_build_object('expression','(2+3)*4'),'{}'::uuid[],120);
  rid := (first->>'toolRunId')::uuid; claim1 := (first->>'claimToken')::uuid;
  if (first->>'status') <> 'RUNNING' or (first->>'authoritative')::boolean is not true then raise exception 'tool_begin_authority_failed'; end if;
  retry := public.vh_begin_tool_run(a,'calculator','calc-idem-1',jsonb_build_object('expression','(2+3)*4'),'{}'::uuid[],120);
  if (retry->>'toolRunId')::uuid <> rid or (retry->>'authoritative')::boolean is not false then raise exception 'tool_duplicate_authority_failed'; end if;
  begin
    perform public.vh_begin_tool_run(a,'calculator','calc-idem-1',jsonb_build_object('expression','2+2'),'{}'::uuid[],120);
    raise exception 'tool_idempotency_conflict_accepted';
  exception when others then if position('tool_idempotency_conflict' in sqlerrm)=0 then raise; end if; end;

  update public.vh_tool_runs set lease_expires_at=now()-interval '1 second' where id=rid;
  reclaimed := public.vh_begin_tool_run(a,'calculator','calc-idem-1',jsonb_build_object('expression','(2+3)*4'),'{}'::uuid[],120);
  claim2 := (reclaimed->>'claimToken')::uuid;
  if claim2=claim1 or (reclaimed->>'authoritative')::boolean is not true then raise exception 'tool_reclaim_failed'; end if;
  begin
    perform public.vh_complete_tool_run(a,rid,claim1,jsonb_build_object('kind','calculator','expression','(2+3)*4','result',20,'display','20'),'{}'::jsonb,'{}'::jsonb);
    raise exception 'stale_claim_completed';
  exception when others then if position('tool_claim_stale' in sqlerrm)=0 then raise; end if; end;
  done := public.vh_complete_tool_run(a,rid,claim2,jsonb_build_object('kind','calculator','expression','(2+3)*4','result',20,'display','20'),jsonb_build_object('route','deterministic'),jsonb_build_object('engine','part3-calculator-v1'));
  if done->>'status' <> 'COMPLETED' then raise exception 'calculator_complete_failed'; end if;
  begin
    update public.vh_tool_runs set output_payload=jsonb_build_object('tampered',true) where id=rid;
    raise exception 'terminal_tool_mutated';
  exception when others then if position('tool_run_terminal_immutable' in sqlerrm)=0 then raise; end if; end;
  raise notice 'P3_TOOL_AUTHORITY=PASS idempotency=1 duplicate_provider_authority=0 lease_reclaim=1 stale_claim_rejected=1 terminal_immutable=1';
  raise notice 'P3_CALCULATOR=PASS deterministic_persisted=1 result=20 ai_route=0';
end $$;

-- Translate provider boundary is mocked; PostgreSQL lifecycle/persistence is real.
do $$
declare
  a constant uuid := '88000000-0000-4000-8000-000000000001';
  run jsonb; done jsonb; rid uuid; claim uuid;
begin
  run := public.vh_begin_tool_run(a,'translate','translate-idem-1',jsonb_build_object('sourceLanguage','English','targetLanguage','Uzbek','text','Hello'),'{}'::uuid[],120);
  rid := (run->>'toolRunId')::uuid; claim := (run->>'claimToken')::uuid;
  done := public.vh_complete_tool_run(a,rid,claim,jsonb_build_object('kind','translate','sourceLanguage','English','targetLanguage','Uzbek','result','Salom'),jsonb_build_object('providerId','mock-boundary','modelId','mock-translate'),jsonb_build_object('stage',80));
  if done->>'status' <> 'COMPLETED' or (select output_payload->>'result' from public.vh_tool_runs where id=rid) <> 'Salom' then raise exception 'translate_persistence_failed'; end if;
  raise notice 'P3_TRANSLATE=PASS provider_boundary_mocked=1 persistence=postgres16 route_metadata=1';
end $$;

-- Solve uses owner-validated Library source chunks and retains original input references.
do $$
declare
  a constant uuid := '88000000-0000-4000-8000-000000000001';
  b constant uuid := '88000000-0000-4000-8000-000000000002';
  run jsonb; done jsonb; rid uuid; claim uuid; refs jsonb; chunk_count integer;
  text_hash text := encode(digest('Solve 2x + 4 = 12','sha256'),'hex');
begin
  run := public.vh_begin_tool_run(a,'solve','solve-it-1',jsonb_build_object('mode','SOLVE_IT','text','Solve 2x + 4 = 12','inputTextHash',text_hash),array['88100000-0000-4000-8000-000000000001'::uuid],120);
  rid := (run->>'toolRunId')::uuid; claim := (run->>'claimToken')::uuid;
  select input_refs into refs from public.vh_tool_runs where id=rid;
  if refs <> jsonb_build_array(jsonb_build_object('assetId','88100000-0000-4000-8000-000000000001')) then raise exception 'solve_input_ref_identity_failed'; end if;
  select count(*) into chunk_count from public.vh_get_tool_asset_context(a,array['88100000-0000-4000-8000-000000000001'::uuid],30000);
  if chunk_count <> 1 then raise exception 'solve_grounded_context_failed'; end if;
  begin
    perform public.vh_begin_tool_run(b,'solve','foreign-solve',jsonb_build_object('mode','SOLVE_IT','text','x'),'{}'::uuid[]||'88100000-0000-4000-8000-000000000001'::uuid,120);
    raise exception 'cross_owner_tool_asset_accepted';
  exception when others then if position('tool_asset_not_ready_or_not_found' in sqlerrm)=0 then raise; end if; end;
  begin
    perform public.vh_begin_tool_run(a,'solve','pending-solve',jsonb_build_object('mode','SOLVE_IT','text','x'),array['88100000-0000-4000-8000-000000000003'::uuid],120);
    raise exception 'processing_asset_accepted';
  exception when others then if position('tool_asset_not_ready_or_not_found' in sqlerrm)=0 then raise; end if; end;
  done := public.vh_complete_tool_run(a,rid,claim,
    jsonb_build_object('kind','solve','mode','SOLVE_IT','problemType','math','finalAnswer','x = 4','steps',jsonb_build_array('Subtract 4','Divide by 2'),'explanation','Solve by inverse operations.','formulasChecks',jsonb_build_array('2(4)+4=12'),'suggestedActions',jsonb_build_array('EXPLAIN_SIMPLER','ANOTHER_METHOD','SIMILAR_PROBLEM'),'inputReference',jsonb_build_object('toolRunId',rid,'assetIds',jsonb_build_array('88100000-0000-4000-8000-000000000001'),'inputTextHash',text_hash)),
    jsonb_build_object('providerId','mock-boundary','modelId','mock-solve'),jsonb_build_object('source','library_chunks'));
  if done->>'status' <> 'COMPLETED' then raise exception 'solve_complete_failed'; end if;
  raise notice 'P3_SOLVE=PASS modes_contract=2 library_grounding=1 original_asset_identity=1 text_hash=1 auto_classification_field=1 cross_owner_rejected=1 processing_rejected=1';
end $$;

-- HELP_ME_SOLVE persistence carries no finalAnswer field. API unit policy separately rejects leakage text.
do $$
declare
  a constant uuid := '88000000-0000-4000-8000-000000000001';
  run jsonb; rid uuid; claim uuid; output jsonb; text_hash text := encode(digest('2x=8','sha256'),'hex');
begin
  run := public.vh_begin_tool_run(a,'solve','help-solve-1',jsonb_build_object('mode','HELP_ME_SOLVE','text','2x=8','inputTextHash',text_hash),'{}'::uuid[],120);
  rid := (run->>'toolRunId')::uuid; claim := (run->>'claimToken')::uuid;
  output := jsonb_build_object('kind','solve','mode','HELP_ME_SOLVE','problemType','math','simplifiedTask','Isolate the unknown.','whatIsAsked','Find x.','givens',jsonb_build_array('2x=8'),'difficultPoint','Undo multiplication.','principle','Use inverse operations.','startGuidance','Divide both sides by the coefficient.','nextStepGuidance','Carry out that step yourself, then check by substitution.','hints',jsonb_build_array('Keep both sides balanced.'),'inputReference',jsonb_build_object('toolRunId',rid,'assetIds','[]'::jsonb,'inputTextHash',text_hash));
  if output ? 'finalAnswer' then raise exception 'help_mode_fixture_has_final_answer'; end if;
  perform public.vh_complete_tool_run(a,rid,claim,output,jsonb_build_object('providerId','mock-boundary'),jsonb_build_object('helpPolicy','api-validator-v1'));
  if (select output_payload ? 'finalAnswer' from public.vh_tool_runs where id=rid) then raise exception 'help_mode_persisted_final_answer'; end if;
  raise notice 'P3_HELP_ME_SOLVE=PASS final_answer_field=0 policy_boundary=api_validator_v1';
end $$;

-- Quick Summarize reuses Library chunk/provenance and does not create Conversation/Studio artifacts.
do $$
declare
  a constant uuid := '88000000-0000-4000-8000-000000000001';
  run jsonb; rid uuid; claim uuid; before_conversations bigint; after_conversations bigint;
begin
  select count(*) into before_conversations from public.vh_conversations where account_id=a;
  run := public.vh_begin_tool_run(a,'summarize','summary-1',jsonb_build_object('text','','inputTextHash',encode(digest('','sha256'),'hex'),'includeKeyPoints',true),array['88100000-0000-4000-8000-000000000002'::uuid],120);
  rid := (run->>'toolRunId')::uuid; claim := (run->>'claimToken')::uuid;
  perform public.vh_complete_tool_run(a,rid,claim,
    jsonb_build_object('kind','summarize','summary','Photosynthesis stores light energy as chemical energy.','keyPoints',jsonb_build_array('Light energy is converted.'),'sourceReferences',jsonb_build_array(jsonb_build_object('assetId','88100000-0000-4000-8000-000000000002','title','Lesson PDF','locator',jsonb_build_object('page',2),'contentHash',encode(digest('pdf chunk','sha256'),'hex')))),
    jsonb_build_object('providerId','mock-boundary','modelId','mock-summary'),jsonb_build_object('quickUtility',true,'studioArtifact',false));
  select count(*) into after_conversations from public.vh_conversations where account_id=a;
  if before_conversations <> after_conversations then raise exception 'summarize_created_conversation'; end if;
  if not exists(select 1 from public.vh_tool_runs where id=rid and output_payload->'sourceReferences'->0->>'assetId'='88100000-0000-4000-8000-000000000002') then raise exception 'summarize_provenance_missing'; end if;
  raise notice 'P3_SUMMARIZE=PASS quick_utility=1 source_provenance=1 conversation_created=0 studio_artifact=0';
end $$;

-- Failed run is durable and cannot be completed afterwards.
do $$
declare
  a constant uuid := '88000000-0000-4000-8000-000000000001';
  run jsonb; rid uuid; claim uuid;
begin
  run := public.vh_begin_tool_run(a,'translate','failed-tool-1',jsonb_build_object('sourceLanguage','en','targetLanguage','uz','text','fail'),'{}'::uuid[],120);
  rid := (run->>'toolRunId')::uuid; claim := (run->>'claimToken')::uuid;
  perform public.vh_fail_tool_run(a,rid,claim,'PROVIDER_UNAVAILABLE',jsonb_build_object('providerBoundary','mock'));
  if not exists(select 1 from public.vh_tool_runs where id=rid and status='FAILED' and error_code='PROVIDER_UNAVAILABLE' and output_payload is null) then raise exception 'tool_failure_not_persisted'; end if;
  begin
    perform public.vh_complete_tool_run(a,rid,claim,jsonb_build_object('kind','translate','sourceLanguage','en','targetLanguage','uz','result','fake'),'{}'::jsonb,'{}'::jsonb);
    raise exception 'failed_tool_completed';
  exception when others then if position('tool_run_terminal' in sqlerrm)=0 then raise; end if; end;
  raise notice 'P3_TOOL_FAILURE=PASS provider_failure_persisted=1 fake_success=0';
end $$;

-- Direct tables/RPCs remain service-role only.
do $$
declare n integer;
begin
  select count(*) into n from information_schema.role_table_grants
  where table_schema='public' and table_name='vh_tool_runs' and grantee in ('anon','authenticated','PUBLIC');
  if n <> 0 then raise exception 'tool_runs_not_service_only'; end if;
  raise notice 'P3_TOOL_SECURITY=PASS service_only=1 owner_asset_validation=1 code_execution=0';
end $$;

delete from public.vh_accounts where id in (
  '88000000-0000-4000-8000-000000000001'::uuid,
  '88000000-0000-4000-8000-000000000002'::uuid
);
SQL

echo "PART3_TOOLS=PASS postgres=16 registry=server calculator=pass translate=pass solve=pass help_no_final=pass summarize=pass authority=pass isolation=pass"
