-- Veltrix Hom Backend Part 4: Studio owner validation, live snapshots, limits, idempotency and versions.

alter table public.vh_studio_generations add column if not exists request_fingerprint text;
alter table public.vh_studio_generations add column if not exists job_id uuid references public.vh_jobs(id) on delete set null;
create unique index if not exists vh_studio_generations_job_uq on public.vh_studio_generations(job_id) where job_id is not null;

create or replace function public.vh_part4_sha256(p_text text) returns text
language sql immutable strict
as $$ select encode(digest(p_text,'sha256'),'hex') $$;

-- Resolve the latest owner-authorized state for one live binding.
create or replace function public.vh_resolve_studio_binding_snapshot(
  p_account_id uuid,
  p_kind text,
  p_target_id uuid,
  p_selector jsonb default '{}'::jsonb,
  p_direct_text text default null
) returns table(resolved_revision text,resolved_fingerprint text)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_payload jsonb;
  v_revision text;
begin
  if p_kind='direct_text' then
    if p_direct_text is null or char_length(p_direct_text)>20000 then raise exception 'studio_direct_text_invalid' using errcode='22023'; end if;
    return query select 'direct:1'::text, public.vh_part4_sha256(p_direct_text);
    return;
  end if;

  if p_kind='project' then
    select jsonb_build_object(
      'id',p.id,'revision',p.revision,'updatedAt',p.updated_at,
      'assets',coalesce((select jsonb_agg(jsonb_build_array(a.id,a.source_revision,a.content_sha256) order by a.id)
        from public.vh_project_references r join public.vh_library_assets a on a.id=r.asset_id
        where r.account_id=p_account_id and r.project_id=p.id and a.account_id=p_account_id and a.trashed_at is null),'[]'::jsonb),
      'notebooks',coalesce((select jsonb_agg(jsonb_build_array(n.id,n.revision,n.updated_at) order by n.id)
        from public.vh_project_notebooks pn join public.vh_notebooks n on n.id=pn.notebook_id
        where pn.account_id=p_account_id and pn.project_id=p.id and n.account_id=p_account_id and n.trashed_at is null),'[]'::jsonb)
    ), p.revision::text into v_payload,v_revision
    from public.vh_projects p where p.id=p_target_id and p.account_id=p_account_id and p.trashed_at is null;
  elsif p_kind='notebook' then
    select jsonb_build_object(
      'id',n.id,'revision',n.revision,'updatedAt',n.updated_at,
      'sources',coalesce((select jsonb_agg(jsonb_build_array(a.id,a.source_revision,a.content_sha256,s.enabled) order by a.id)
        from public.vh_notebook_sources s join public.vh_library_assets a on a.id=s.asset_id
        where s.account_id=p_account_id and s.notebook_id=n.id and a.account_id=p_account_id and a.trashed_at is null),'[]'::jsonb)
    ), n.revision::text into v_payload,v_revision
    from public.vh_notebooks n where n.id=p_target_id and n.account_id=p_account_id and n.trashed_at is null;
  elsif p_kind='conversation' then
    select jsonb_build_object(
      'id',c.id,'revision',c.revision,'updatedAt',c.updated_at,
      'messageCount',(select count(*) from public.vh_conversation_messages m where m.account_id=p_account_id and m.conversation_id=c.id and m.status='COMPLETED'),
      'messageTip',(select max(m.updated_at) from public.vh_conversation_messages m where m.account_id=p_account_id and m.conversation_id=c.id),
      'notebooks',coalesce((select jsonb_agg(jsonb_build_array(n.id,n.revision,n.updated_at) order by n.id)
        from public.vh_conversation_notebooks cn join public.vh_notebooks n on n.id=cn.notebook_id
        where cn.account_id=p_account_id and cn.conversation_id=c.id and n.account_id=p_account_id and n.trashed_at is null),'[]'::jsonb),
      'reference',(select jsonb_build_array(a.id,a.source_revision,a.content_sha256) from public.vh_library_assets a where a.id=c.permanent_reference_asset_id and a.account_id=p_account_id and a.trashed_at is null)
    ), c.revision::text into v_payload,v_revision
    from public.vh_conversations c where c.id=p_target_id and c.account_id=p_account_id and c.trashed_at is null;
  elsif p_kind in ('library_asset','direct_attachment') then
    select jsonb_build_object('id',a.id,'sourceRevision',a.source_revision,'sha256',a.content_sha256,'updatedAt',a.updated_at), a.source_revision::text
      into v_payload,v_revision
    from public.vh_library_assets a where a.id=p_target_id and a.account_id=p_account_id and a.trashed_at is null;
  elsif p_kind='collection' then
    select jsonb_build_object(
      'id',c.id,'revision',c.revision,'updatedAt',c.updated_at,
      'assets',coalesce((select jsonb_agg(jsonb_build_array(a.id,a.source_revision,a.content_sha256) order by ca.manual_order,a.id)
        from public.vh_collection_assets ca join public.vh_library_assets a on a.id=ca.asset_id
        where ca.account_id=p_account_id and ca.collection_id=c.id and a.account_id=p_account_id and a.trashed_at is null),'[]'::jsonb)
    ), c.revision::text into v_payload,v_revision
    from public.vh_library_collections c where c.id=p_target_id and c.account_id=p_account_id and c.trashed_at is null;
  elsif p_kind='tag' then
    select jsonb_build_object(
      'id',t.id,'updatedAt',t.updated_at,
      'assets',coalesce((select jsonb_agg(jsonb_build_array(a.id,a.source_revision,a.content_sha256) order by a.id)
        from public.vh_library_asset_tags at join public.vh_library_assets a on a.id=at.asset_id
        where at.account_id=p_account_id and at.tag_id=t.id and a.account_id=p_account_id and a.trashed_at is null),'[]'::jsonb)
    ), extract(epoch from t.updated_at)::text into v_payload,v_revision
    from public.vh_library_tags t where t.id=p_target_id and t.account_id=p_account_id;
  elsif p_kind='note' then
    select jsonb_build_object('id',n.id,'revision',n.revision,'updatedAt',n.updated_at,'blocksFingerprint',v.blocks_fingerprint), n.revision::text
      into v_payload,v_revision
    from public.vh_notes n left join public.vh_note_versions v on v.id=n.current_revision_id and v.account_id=p_account_id
    where n.id=p_target_id and n.account_id=p_account_id and n.trashed_at is null;
  elsif p_kind='library_selection' then
    if jsonb_typeof(coalesce(p_selector,'{}'::jsonb))<>'object' then raise exception 'studio_selector_invalid' using errcode='22023'; end if;
    select jsonb_build_object('selector',p_selector,'assets',coalesce(jsonb_agg(jsonb_build_array(a.id,a.source_revision,a.content_sha256) order by a.id) filter(where a.id is not null),'[]'::jsonb))
      into v_payload
    from public.vh_library_assets a
    where a.account_id=p_account_id and a.trashed_at is null and (
      (p_selector ? 'assetIds' and a.id::text in (select jsonb_array_elements_text(p_selector->'assetIds')))
      or (p_selector ? 'collectionId' and exists(select 1 from public.vh_collection_assets ca where ca.account_id=p_account_id and ca.collection_id=(p_selector->>'collectionId')::uuid and ca.asset_id=a.id))
      or (p_selector ? 'tagId' and exists(select 1 from public.vh_library_asset_tags at where at.account_id=p_account_id and at.tag_id=(p_selector->>'tagId')::uuid and at.asset_id=a.id))
    );
    v_revision := public.vh_part4_sha256(coalesce(p_selector::text,'{}'));
  else
    raise exception 'studio_binding_kind_unsupported:%',p_kind using errcode='22023';
  end if;

  if v_payload is null then raise exception 'studio_binding_not_found_or_forbidden:%',p_kind using errcode='P0001'; end if;
  return query select v_revision, public.vh_part4_sha256(v_payload::text);
end;
$$;
revoke all on function public.vh_resolve_studio_binding_snapshot(uuid,text,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.vh_resolve_studio_binding_snapshot(uuid,text,uuid,jsonb,text) to service_role;

create or replace function public.vh_create_studio_generation(
  p_account_id uuid,
  p_session_id uuid,
  p_artifact_type text,
  p_artifact_type_version integer,
  p_idempotency_key text,
  p_prompt text,
  p_bindings jsonb default '[]'::jsonb,
  p_attachment_asset_ids jsonb default '[]'::jsonb
) returns table(generation_id uuid,job_id uuid,replayed boolean,resolved_context_fingerprint text)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_gen public.vh_studio_generations%rowtype;
  v_job uuid;
  v_req text;
  v_binding jsonb;
  v_kind text;
  v_target uuid;
  v_selector jsonb;
  v_text text;
  v_rev text;
  v_fp text;
  v_attachment_count integer;
  v_attachment_bytes bigint;
  v_all_fp text := '';
  v_asset record;
begin
  if jsonb_typeof(p_bindings)<>'array' or jsonb_array_length(p_bindings)>50 then raise exception 'studio_bindings_invalid' using errcode='22023'; end if;
  if jsonb_typeof(p_attachment_asset_ids)<>'array' then raise exception 'studio_attachments_invalid' using errcode='22023'; end if;
  if jsonb_array_length(p_attachment_asset_ids)>5 then raise exception 'studio_attachment_count_exceeded' using errcode='P0001'; end if;
  if char_length(coalesce(p_prompt,''))>20000 or char_length(p_idempotency_key) not between 1 and 200 then raise exception 'studio_request_invalid' using errcode='22023'; end if;
  if not exists(select 1 from public.vh_studio_artifact_registry r where r.artifact_type=p_artifact_type and r.version=p_artifact_type_version and r.active) then raise exception 'studio_artifact_type_unsupported' using errcode='22023'; end if;
  if p_session_id is not null and not exists(select 1 from public.vh_studio_sessions s where s.id=p_session_id and s.account_id=p_account_id) then raise exception 'studio_session_forbidden' using errcode='P0001'; end if;

  v_req := public.vh_part4_sha256(jsonb_build_object('artifactType',p_artifact_type,'version',p_artifact_type_version,'prompt',coalesce(p_prompt,''),'bindings',p_bindings,'attachments',p_attachment_asset_ids)::text);
  select * into v_gen from public.vh_studio_generations where account_id=p_account_id and idempotency_key=p_idempotency_key for update;
  if found then
    if v_gen.request_fingerprint is distinct from v_req then raise exception 'studio_idempotency_conflict' using errcode='P0001'; end if;
    return query select v_gen.id,v_gen.job_id,true,v_gen.resolved_context_fingerprint;
    return;
  end if;

  insert into public.vh_studio_generations(account_id,session_id,artifact_type,artifact_type_version,idempotency_key,prompt,request_fingerprint)
  values(p_account_id,p_session_id,p_artifact_type,p_artifact_type_version,p_idempotency_key,coalesce(p_prompt,''),v_req)
  returning * into v_gen;

  for v_binding in select value from jsonb_array_elements(p_bindings) loop
    v_kind := v_binding->>'kind';
    v_target := nullif(v_binding->>'targetId','')::uuid;
    v_selector := coalesce(v_binding->'selector','{}'::jsonb);
    v_text := v_binding->>'text';
    select s.resolved_revision,s.resolved_fingerprint into v_rev,v_fp
      from public.vh_resolve_studio_binding_snapshot(p_account_id,v_kind,v_target,v_selector,v_text) s;
    insert into public.vh_studio_input_bindings(account_id,generation_id,binding_kind,target_id,selector,direct_text,resolved_revision,resolved_fingerprint,resolved_at)
    values(p_account_id,v_gen.id,v_kind,v_target,v_selector,v_text,v_rev,v_fp,now());
    v_all_fp := v_all_fp || ':' || v_kind || ':' || v_fp;
  end loop;

  select count(*),coalesce(sum(a.original_size_bytes),0)
    into v_attachment_count,v_attachment_bytes
  from public.vh_library_assets a
  where a.account_id=p_account_id and a.trashed_at is null
    and a.id::text in (select jsonb_array_elements_text(p_attachment_asset_ids));
  if v_attachment_count <> jsonb_array_length(p_attachment_asset_ids) then raise exception 'studio_attachment_not_found_or_forbidden' using errcode='P0001'; end if;
  if v_attachment_bytes > 20*1024*1024 then raise exception 'studio_attachment_bytes_exceeded' using errcode='P0001'; end if;

  for v_asset in
    select a.id,a.original_size_bytes,a.content_sha256,a.source_revision from public.vh_library_assets a
    where a.account_id=p_account_id and a.trashed_at is null and a.id::text in (select jsonb_array_elements_text(p_attachment_asset_ids)) order by a.id
  loop
    insert into public.vh_studio_generation_attachments(account_id,generation_id,asset_id,source_size_bytes)
    values(p_account_id,v_gen.id,v_asset.id,v_asset.original_size_bytes);
    v_all_fp := v_all_fp || ':attachment:' || v_asset.id::text || ':' || v_asset.source_revision::text || ':' || v_asset.content_sha256;
  end loop;

  update public.vh_studio_generations set resolved_context_fingerprint=public.vh_part4_sha256(v_all_fp),updated_at=now() where id=v_gen.id;
  insert into public.vh_jobs(account_id,kind,payload,state,max_attempts)
  values(p_account_id,'studio.generate',jsonb_build_object('generationId',v_gen.id,'artifactType',p_artifact_type,'artifactTypeVersion',p_artifact_type_version),'queued',5)
  returning id into v_job;
  update public.vh_studio_generations set job_id=v_job where id=v_gen.id;
  if p_session_id is not null then update public.vh_studio_sessions set last_used_at=now(),updated_at=now(),revision=revision+1 where id=p_session_id and account_id=p_account_id; end if;

  select * into v_gen from public.vh_studio_generations where id=v_gen.id;
  return query select v_gen.id,v_job,false,v_gen.resolved_context_fingerprint;
end;
$$;
revoke all on function public.vh_create_studio_generation(uuid,uuid,text,integer,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.vh_create_studio_generation(uuid,uuid,text,integer,text,text,jsonb,jsonb) to service_role;

create or replace function public.vh_create_studio_artifact_from_generation(
  p_account_id uuid,
  p_generation_id uuid,
  p_title text,
  p_content jsonb,
  p_binary_object_id uuid default null,
  p_provenance jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_gen public.vh_studio_generations%rowtype; v_artifact uuid;
begin
  select * into v_gen from public.vh_studio_generations where id=p_generation_id and account_id=p_account_id for update;
  if not found then raise exception 'studio_generation_forbidden' using errcode='P0001'; end if;
  if v_gen.status='FAILED' or v_gen.status='CANCELLED' then raise exception 'studio_generation_terminal_failure' using errcode='P0001'; end if;
  if p_binary_object_id is not null and not exists(select 1 from public.vh_storage_objects o where o.id=p_binary_object_id and o.account_id=p_account_id and o.kind='studio' and o.state='ready') then raise exception 'studio_binary_forbidden' using errcode='P0001'; end if;
  insert into public.vh_studio_artifacts(account_id,artifact_type,artifact_type_version,title,current_version,revision)
  values(p_account_id,v_gen.artifact_type,v_gen.artifact_type_version,p_title,1,1) returning id into v_artifact;
  insert into public.vh_studio_artifact_versions(account_id,artifact_id,version_no,source_kind,generation_id,content,binary_object_id,source_fingerprint,provenance)
  values(p_account_id,v_artifact,1,'AI_GENERATED',p_generation_id,coalesce(p_content,'{}'::jsonb),p_binary_object_id,v_gen.resolved_context_fingerprint,coalesce(p_provenance,'{}'::jsonb));
  update public.vh_studio_generations set status='COMPLETED',progress=100,completed_at=now(),updated_at=now(),provenance=provenance || jsonb_build_object('artifactId',v_artifact) where id=p_generation_id;
  return v_artifact;
end;
$$;
revoke all on function public.vh_create_studio_artifact_from_generation(uuid,uuid,text,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.vh_create_studio_artifact_from_generation(uuid,uuid,text,jsonb,uuid,jsonb) to service_role;

create or replace function public.vh_append_studio_artifact_version(
  p_account_id uuid,
  p_artifact_id uuid,
  p_expected_revision bigint,
  p_source_kind text,
  p_content jsonb,
  p_binary_object_id uuid default null,
  p_generation_id uuid default null,
  p_provenance jsonb default '{}'::jsonb
) returns table(version_no integer,new_revision bigint)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_art public.vh_studio_artifacts%rowtype; v_next integer;
begin
  if p_source_kind not in ('USER_EDIT','REGENERATED','PROMPT_REVISION','RESTORED') then raise exception 'studio_version_source_invalid' using errcode='22023'; end if;
  select * into v_art from public.vh_studio_artifacts where id=p_artifact_id and account_id=p_account_id and trashed_at is null for update;
  if not found then raise exception 'studio_artifact_forbidden' using errcode='P0001'; end if;
  if v_art.revision<>p_expected_revision then raise exception 'studio_revision_conflict' using errcode='40001'; end if;
  if p_binary_object_id is not null and not exists(select 1 from public.vh_storage_objects o where o.id=p_binary_object_id and o.account_id=p_account_id and o.kind='studio' and o.state='ready') then raise exception 'studio_binary_forbidden' using errcode='P0001'; end if;
  v_next:=v_art.current_version+1;
  insert into public.vh_studio_artifact_versions(account_id,artifact_id,version_no,source_kind,generation_id,based_on_version,content,binary_object_id,source_fingerprint,provenance)
  values(p_account_id,p_artifact_id,v_next,p_source_kind,p_generation_id,v_art.current_version,coalesce(p_content,'{}'::jsonb),p_binary_object_id,
    case when p_generation_id is null then null else (select resolved_context_fingerprint from public.vh_studio_generations where id=p_generation_id and account_id=p_account_id) end,
    coalesce(p_provenance,'{}'::jsonb));
  update public.vh_studio_artifacts set current_version=v_next,revision=revision+1,updated_at=now() where id=p_artifact_id;
  return query select v_next,p_expected_revision+1;
end;
$$;
revoke all on function public.vh_append_studio_artifact_version(uuid,uuid,bigint,text,jsonb,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.vh_append_studio_artifact_version(uuid,uuid,bigint,text,jsonb,uuid,uuid,jsonb) to service_role;
