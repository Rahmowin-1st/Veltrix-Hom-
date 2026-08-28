-- Veltrix Hom Backend Part 4: explicit Studio artifact lifecycle.
-- Adds rename, duplicate, regenerate and revise-with-prompt without changing accepted Part3 semantics.

alter table public.vh_studio_generations
  add column if not exists target_artifact_id uuid references public.vh_studio_artifacts(id) on delete set null;
alter table public.vh_studio_generations
  add column if not exists generation_mode text not null default 'NEW';

alter table public.vh_studio_generations
  drop constraint if exists vh_studio_generations_generation_mode_check;
alter table public.vh_studio_generations
  add constraint vh_studio_generations_generation_mode_check
  check (generation_mode in ('NEW','REGENERATE','REVISE'));

create index if not exists vh_studio_generations_target_idx
  on public.vh_studio_generations(account_id,target_artifact_id,created_at desc,id desc)
  where target_artifact_id is not null;

create or replace function public.vh_rename_studio_artifact(
  p_account_id uuid,
  p_artifact_id uuid,
  p_expected_revision bigint,
  p_title text
) returns bigint
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare a public.vh_studio_artifacts%rowtype; outrev bigint;
begin
  if char_length(btrim(coalesce(p_title,''))) not between 1 and 240 then
    raise exception 'studio_artifact_title_invalid' using errcode='22023';
  end if;
  select * into a from public.vh_studio_artifacts
  where id=p_artifact_id and account_id=p_account_id and trashed_at is null for update;
  if not found then raise exception 'studio_artifact_forbidden' using errcode='P0001'; end if;
  if a.revision<>p_expected_revision then raise exception 'studio_revision_conflict' using errcode='40001'; end if;
  update public.vh_studio_artifacts
  set title=btrim(p_title),revision=revision+1,updated_at=now()
  where id=p_artifact_id and account_id=p_account_id
  returning revision into outrev;
  return outrev;
end;
$$;
revoke all on function public.vh_rename_studio_artifact(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.vh_rename_studio_artifact(uuid,uuid,bigint,text) to service_role;

create or replace function public.vh_duplicate_studio_artifact(
  p_account_id uuid,
  p_artifact_id uuid,
  p_title text default null
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  a public.vh_studio_artifacts%rowtype;
  v public.vh_studio_artifact_versions%rowtype;
  out_id uuid;
  out_title text;
begin
  select * into a from public.vh_studio_artifacts
  where id=p_artifact_id and account_id=p_account_id and trashed_at is null for share;
  if not found then raise exception 'studio_artifact_forbidden' using errcode='P0001'; end if;
  select * into v from public.vh_studio_artifact_versions
  where artifact_id=a.id and account_id=p_account_id and version_no=a.current_version;
  if not found then raise exception 'studio_artifact_version_missing' using errcode='P0001'; end if;

  out_title:=coalesce(nullif(btrim(p_title),''),left(a.title,235)||' copy');
  if char_length(out_title) not between 1 and 240 then raise exception 'studio_artifact_title_invalid' using errcode='22023'; end if;

  insert into public.vh_studio_artifacts(account_id,artifact_type,artifact_type_version,title,current_version,revision)
  values(p_account_id,a.artifact_type,a.artifact_type_version,out_title,1,1)
  returning id into out_id;

  insert into public.vh_studio_artifact_versions(
    account_id,artifact_id,version_no,source_kind,generation_id,based_on_version,
    content,binary_object_id,source_fingerprint,provenance
  ) values(
    p_account_id,out_id,1,v.source_kind,v.generation_id,null,
    v.content,v.binary_object_id,v.source_fingerprint,
    coalesce(v.provenance,'{}'::jsonb) || jsonb_build_object(
      'operation','DUPLICATE','sourceArtifactId',a.id,'sourceVersion',a.current_version
    )
  );
  return out_id;
end;
$$;
revoke all on function public.vh_duplicate_studio_artifact(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.vh_duplicate_studio_artifact(uuid,uuid,text) to service_role;

create or replace function public.vh_create_studio_revision_generation(
  p_account_id uuid,
  p_artifact_id uuid,
  p_idempotency_key text,
  p_mode text,
  p_prompt_override text default null
) returns table(generation_id uuid,job_id uuid,replayed boolean,resolved_context_fingerprint text)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  a public.vh_studio_artifacts%rowtype;
  source_generation public.vh_studio_generations%rowtype;
  source_generation_id uuid;
  bindings jsonb := '[]'::jsonb;
  attachments jsonb := '[]'::jsonb;
  final_prompt text;
  internal_key text;
  created record;
  existing_target uuid;
  existing_mode text;
begin
  if p_mode not in ('REGENERATE','REVISE') then raise exception 'studio_revision_mode_invalid' using errcode='22023'; end if;
  if char_length(btrim(coalesce(p_idempotency_key,''))) not between 1 and 200 then raise exception 'studio_idempotency_key_invalid' using errcode='22023'; end if;
  if p_mode='REVISE' and char_length(btrim(coalesce(p_prompt_override,''))) not between 1 and 20000 then
    raise exception 'studio_revision_prompt_invalid' using errcode='22023';
  end if;

  select * into a from public.vh_studio_artifacts
  where id=p_artifact_id and account_id=p_account_id and trashed_at is null;
  if not found then raise exception 'studio_artifact_forbidden' using errcode='P0001'; end if;

  select v.generation_id into source_generation_id
  from public.vh_studio_artifact_versions v
  where v.account_id=p_account_id and v.artifact_id=p_artifact_id and v.generation_id is not null
  order by v.version_no desc limit 1;
  if source_generation_id is null then raise exception 'studio_revision_source_generation_missing' using errcode='P0001'; end if;

  select * into source_generation from public.vh_studio_generations
  where id=source_generation_id and account_id=p_account_id;
  if not found then raise exception 'studio_revision_source_generation_missing' using errcode='P0001'; end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'kind',b.binding_kind,
    'targetId',case when b.target_id is null then null else b.target_id::text end,
    'selector',b.selector,
    'text',b.direct_text
  )) order by b.created_at,b.id),'[]'::jsonb)
  into bindings
  from public.vh_studio_input_bindings b
  where b.account_id=p_account_id and b.generation_id=source_generation_id;

  select coalesce(jsonb_agg(a2.asset_id::text order by a2.asset_id),'[]'::jsonb)
  into attachments
  from public.vh_studio_generation_attachments a2
  where a2.account_id=p_account_id and a2.generation_id=source_generation_id;

  final_prompt:=case when p_mode='REVISE' then btrim(p_prompt_override) else source_generation.prompt end;
  internal_key:='revision:'||public.vh_part4_sha256(p_artifact_id::text||':'||p_idempotency_key);

  select * into created from public.vh_create_studio_generation(
    p_account_id,null,a.artifact_type,a.artifact_type_version,internal_key,final_prompt,bindings,attachments
  );

  if created.replayed then
    select g.target_artifact_id,g.generation_mode into existing_target,existing_mode
    from public.vh_studio_generations g where g.id=created.generation_id and g.account_id=p_account_id;
    if existing_target is distinct from p_artifact_id or existing_mode is distinct from p_mode then
      raise exception 'studio_revision_idempotency_conflict' using errcode='P0001';
    end if;
  else
    update public.vh_studio_generations
    set target_artifact_id=p_artifact_id,generation_mode=p_mode,updated_at=now()
    where id=created.generation_id and account_id=p_account_id and target_artifact_id is null;
    if not found then raise exception 'studio_revision_generation_claim_failed' using errcode='P0001'; end if;
    update public.vh_jobs set kind='studio.revise',updated_at=now()
    where id=created.job_id and account_id=p_account_id and kind='studio.generate';
    if not found then raise exception 'studio_revision_job_claim_failed' using errcode='P0001'; end if;
  end if;

  return query select created.generation_id,created.job_id,created.replayed,created.resolved_context_fingerprint;
end;
$$;
revoke all on function public.vh_create_studio_revision_generation(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.vh_create_studio_revision_generation(uuid,uuid,text,text,text) to service_role;
