-- Veltrix Hom Backend Part 4: global user Memory Engine / Manager.

alter table public.vh_memories add column if not exists search_vector tsvector
  generated always as (to_tsvector('simple', coalesce(content,''))) stored;
create index if not exists vh_memories_search_idx on public.vh_memories using gin(search_vector);
create unique index if not exists vh_memories_inferred_key_uq
  on public.vh_memories(account_id,canonical_key)
  where canonical_key is not null and authority='INFERRED' and deleted_at is null;

create or replace function public.vh_memory_canonical_key(p_class text,p_content text) returns text
language sql immutable strict
as $$
  select encode(digest(lower(regexp_replace(btrim(p_class || ':' || p_content),'\s+',' ','g')),'sha256'),'hex')
$$;

-- Explicit memory is user-authoritative. It replaces an inferred record with the same canonical key,
-- but never silently rewrites another explicit memory under a different revision.
create or replace function public.vh_remember_explicit(
  p_account_id uuid,
  p_memory_class text,
  p_content text,
  p_structured_value jsonb default '{}'::jsonb,
  p_provenance jsonb default '{}'::jsonb,
  p_canonical_key text default null,
  p_pinned boolean default false,
  p_important boolean default true
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_key text; v_id uuid;
begin
  if p_memory_class not in ('explicit','profile','preference','learning','interest','behavior_workflow','project_signal','notebook_signal','conversation_derived','goal_todo_note_signal','recent_context','ai_inference') then
    raise exception 'memory_class_invalid' using errcode='22023';
  end if;
  if char_length(btrim(p_content)) not between 1 and 12000 or jsonb_typeof(coalesce(p_structured_value,'{}'::jsonb))<>'object' or jsonb_typeof(coalesce(p_provenance,'{}'::jsonb))<>'object' then
    raise exception 'memory_payload_invalid' using errcode='22023';
  end if;
  v_key:=coalesce(nullif(p_canonical_key,''),public.vh_memory_canonical_key(p_memory_class,p_content));
  if v_key !~ '^[0-9a-zA-Z._:-]{1,256}$' and v_key !~ '^[0-9a-f]{64}$' then raise exception 'memory_key_invalid' using errcode='22023'; end if;

  -- Explicit authority supersedes conflicting inferred state under the exact semantic key.
  update public.vh_memories set deleted_at=now(),updated_at=now(),revision=revision+1
    where account_id=p_account_id and canonical_key=v_key and authority='INFERRED' and deleted_at is null;

  select id into v_id from public.vh_memories
    where account_id=p_account_id and canonical_key=v_key and authority='EXPLICIT' and deleted_at is null for update;
  if found then
    update public.vh_memories set
      memory_class=p_memory_class,content=btrim(p_content),structured_value=coalesce(p_structured_value,'{}'::jsonb),
      provenance=coalesce(p_provenance,'{}'::jsonb) || jsonb_build_object('authority','user_explicit'),confidence=1,
      pinned=p_pinned,important=p_important,updated_at=now(),revision=revision+1
    where id=v_id;
    return v_id;
  end if;

  insert into public.vh_memories(account_id,memory_class,content,structured_value,authority,confidence,provenance,canonical_key,pinned,important)
  values(p_account_id,p_memory_class,btrim(p_content),coalesce(p_structured_value,'{}'::jsonb),'EXPLICIT',1,
    coalesce(p_provenance,'{}'::jsonb) || jsonb_build_object('authority','user_explicit'),v_key,p_pinned,p_important)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.vh_remember_explicit(uuid,text,text,jsonb,jsonb,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.vh_remember_explicit(uuid,text,text,jsonb,jsonb,text,boolean,boolean) to service_role;

-- Inferred persistence is thresholded and fail-closed against explicit conflicts.
-- Return NULL when inference is intentionally not persisted.
create or replace function public.vh_persist_inferred_memory(
  p_account_id uuid,
  p_memory_class text,
  p_content text,
  p_confidence numeric,
  p_structured_value jsonb default '{}'::jsonb,
  p_provenance jsonb default '{}'::jsonb,
  p_canonical_key text default null,
  p_threshold numeric default 0.72
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_key text; v_id uuid;
begin
  if p_memory_class not in ('profile','preference','learning','interest','behavior_workflow','project_signal','notebook_signal','conversation_derived','goal_todo_note_signal','recent_context','ai_inference') then
    raise exception 'inferred_memory_class_invalid' using errcode='22023';
  end if;
  if p_confidence<0 or p_confidence>1 or p_threshold<0.5 or p_threshold>1 then raise exception 'memory_confidence_invalid' using errcode='22023'; end if;
  if p_confidence<p_threshold then return null; end if;
  if char_length(btrim(p_content)) not between 1 and 12000 then raise exception 'memory_payload_invalid' using errcode='22023'; end if;
  v_key:=coalesce(nullif(p_canonical_key,''),public.vh_memory_canonical_key(p_memory_class,p_content));

  -- Explicit always wins. Inference cannot overwrite or merge into it.
  if exists(select 1 from public.vh_memories where account_id=p_account_id and canonical_key=v_key and authority='EXPLICIT' and deleted_at is null) then return null; end if;

  select id into v_id from public.vh_memories where account_id=p_account_id and canonical_key=v_key and authority='INFERRED' and deleted_at is null for update;
  if found then
    update public.vh_memories set
      content=btrim(p_content),structured_value=coalesce(p_structured_value,'{}'::jsonb),
      confidence=greatest(confidence,p_confidence),
      provenance=provenance || coalesce(p_provenance,'{}'::jsonb) || jsonb_build_object('dedupMergedAt',now()),
      updated_at=now(),revision=revision+1
    where id=v_id;
    return v_id;
  end if;

  insert into public.vh_memories(account_id,memory_class,content,structured_value,authority,confidence,provenance,canonical_key)
  values(p_account_id,p_memory_class,btrim(p_content),coalesce(p_structured_value,'{}'::jsonb),'INFERRED',p_confidence,
    coalesce(p_provenance,'{}'::jsonb) || jsonb_build_object('authority','ai_inferred'),v_key)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.vh_persist_inferred_memory(uuid,text,text,numeric,jsonb,jsonb,text,numeric) from public,anon,authenticated;
grant execute on function public.vh_persist_inferred_memory(uuid,text,text,numeric,jsonb,jsonb,text,numeric) to service_role;

create or replace function public.vh_retrieve_memories(
  p_account_id uuid,
  p_query text,
  p_limit integer default 12,
  p_classes text[] default null
) returns table(
  id uuid,memory_class text,content text,structured_value jsonb,authority text,confidence numeric,
  provenance jsonb,pinned boolean,important boolean,last_used_at timestamptz,updated_at timestamptz,rank_score double precision
)
language sql
security definer
set search_path=public,pg_temp
as $$
with q as (select plainto_tsquery('simple',coalesce(p_query,'')) query), eligible as (
  select m.*,
    case when btrim(coalesce(p_query,''))='' then 0::real else ts_rank_cd(m.search_vector,q.query) end lexical,
    extract(epoch from (now()-m.updated_at))/86400.0 age_days
  from public.vh_memories m cross join q
  where m.account_id=p_account_id and m.deleted_at is null
    and (p_classes is null or m.memory_class=any(p_classes))
    and (btrim(coalesce(p_query,''))='' or m.search_vector @@ q.query or lower(m.content) like '%'||lower(p_query)||'%')
), ranked as (
  select e.*,
    (case when authority='EXPLICIT' then 100 else 0 end
     + case when pinned then 30 else 0 end
     + case when important then 15 else 0 end
     + confidence::double precision*10
     + lexical::double precision*25
     + greatest(0,10-least(10,age_days/7))) as score
  from eligible e
)
select id,memory_class,content,structured_value,authority,confidence,provenance,pinned,important,last_used_at,updated_at,score
from ranked
order by score desc,updated_at desc,id
limit least(greatest(coalesce(p_limit,12),1),30)
$$;
revoke all on function public.vh_retrieve_memories(uuid,text,integer,text[]) from public,anon,authenticated;
grant execute on function public.vh_retrieve_memories(uuid,text,integer,text[]) to service_role;

create or replace function public.vh_patch_memory(
  p_account_id uuid,p_memory_id uuid,p_expected_revision bigint,p_patch jsonb
) returns bigint
language plpgsql security definer set search_path=public,pg_temp
as $$
declare m public.vh_memories%rowtype; outrev bigint;
begin
  select * into m from public.vh_memories where id=p_memory_id and account_id=p_account_id and deleted_at is null for update;
  if not found then raise exception 'memory_forbidden' using errcode='P0001'; end if;
  if m.revision<>p_expected_revision then raise exception 'memory_revision_conflict' using errcode='40001'; end if;
  if m.authority<>'EXPLICIT' and (p_patch?'content' or p_patch?'structuredValue') then raise exception 'inferred_memory_content_edit_forbidden' using errcode='P0001'; end if;
  if exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('content','structuredValue','pinned','important')) then raise exception 'memory_patch_field_invalid' using errcode='22023'; end if;
  update public.vh_memories set
    content=case when p_patch?'content' then btrim(p_patch->>'content') else content end,
    structured_value=case when p_patch?'structuredValue' then p_patch->'structuredValue' else structured_value end,
    pinned=case when p_patch?'pinned' then (p_patch->>'pinned')::boolean else pinned end,
    important=case when p_patch?'important' then (p_patch->>'important')::boolean else important end,
    updated_at=now(),revision=revision+1
  where id=p_memory_id and account_id=p_account_id returning revision into outrev;
  return outrev;
end;
$$;
revoke all on function public.vh_patch_memory(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.vh_patch_memory(uuid,uuid,bigint,jsonb) to service_role;

create or replace function public.vh_delete_memory(p_account_id uuid,p_memory_id uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  update public.vh_memories set deleted_at=now(),updated_at=now(),revision=revision+1
  where id=p_memory_id and account_id=p_account_id and deleted_at is null;
  return found;
end;
$$;
revoke all on function public.vh_delete_memory(uuid,uuid) from public,anon,authenticated;
grant execute on function public.vh_delete_memory(uuid,uuid) to service_role;
