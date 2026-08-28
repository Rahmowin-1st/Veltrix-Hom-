-- Veltrix Hom Backend Part 4 Stage90: asynchronous universal search + unified Trash support.
-- Additive over Manager-accepted Part3 and Part4 migrations 123-127.

create table if not exists public.vh_search_reindex_queue (
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  entity_type text not null check (entity_type in ('project','notebook','conversation','conversation_message','library_asset','library_content','note','todo','goal','studio_artifact','tag','collection')),
  entity_id uuid not null,
  reason text not null default 'update' check (char_length(reason) between 1 and 80),
  queued_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts between 0 and 25),
  last_error_code text,
  primary key(account_id,entity_type,entity_id)
);
create index if not exists vh_search_reindex_queue_oldest_idx on public.vh_search_reindex_queue(queued_at,account_id,entity_type,entity_id);
alter table public.vh_search_reindex_queue enable row level security;

create or replace function public.vh_part4_jsonb_index_text(p_value jsonb) returns text
language sql immutable
as $$
  select left(regexp_replace(coalesce(p_value,'{}'::jsonb)::text,'[{}\[\]",:]+',' ','g'),200000)
$$;

create or replace function public.vh_enqueue_search_projection(
  p_account_id uuid,p_entity_type text,p_entity_id uuid,p_reason text default 'update',p_create_job boolean default true
) returns boolean
language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  if p_entity_type not in ('project','notebook','conversation','conversation_message','library_asset','library_content','note','todo','goal','studio_artifact','tag','collection') then
    raise exception 'search_entity_type_invalid' using errcode='22023';
  end if;
  insert into public.vh_search_reindex_queue(account_id,entity_type,entity_id,reason,queued_at,attempts,last_error_code)
  values(p_account_id,p_entity_type,p_entity_id,left(coalesce(nullif(p_reason,''),'update'),80),now(),0,null)
  on conflict(account_id,entity_type,entity_id) do update set reason=excluded.reason,queued_at=now(),attempts=0,last_error_code=null;
  if p_create_job then
    insert into public.vh_jobs(account_id,kind,payload,state,max_attempts)
    values(p_account_id,'search.reindex',jsonb_build_object('entityType',p_entity_type,'entityId',p_entity_id),'queued',3);
  end if;
  return true;
end;
$$;
revoke all on function public.vh_enqueue_search_projection(uuid,text,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.vh_enqueue_search_projection(uuid,text,uuid,text,boolean) to service_role;

create or replace function public.vh_search_queue_trigger() returns trigger
language plpgsql security definer set search_path=public,pg_temp
as $$
declare r jsonb; v_account uuid; v_id uuid; v_type text:=tg_argv[0]; v_id_key text:=coalesce(tg_argv[1],'id');
begin
  if tg_op='DELETE' then r:=to_jsonb(old); else r:=to_jsonb(new); end if;
  v_account:=(r->>'account_id')::uuid;
  v_id:=(r->>v_id_key)::uuid;
  perform public.vh_enqueue_search_projection(v_account,v_type,v_id,lower(tg_op),true);
  if v_type='library_asset' then perform public.vh_enqueue_search_projection(v_account,'library_content',v_id,lower(tg_op),true); end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.vh_search_queue_trigger() from public,anon,authenticated;
grant execute on function public.vh_search_queue_trigger() to service_role;

-- Owner-first projection rebuild. A missing/deleted source removes its search projection.
create or replace function public.vh_reindex_search_entity(
  p_account_id uuid,p_entity_type text,p_entity_id uuid
) returns boolean
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_title text:=''; v_body text:=''; v_meta jsonb:='{}'::jsonb; v_link jsonb:='{}'::jsonb;
  v_rev text; v_deleted boolean:=false; v_found boolean:=false;
begin
  if p_entity_type='project' then
    select p.name,coalesce(p.purpose,''),jsonb_build_object('kind','project'),jsonb_build_object('route','projects','entityType','project','entityId',p.id),p.revision::text,p.trashed_at is not null,true
      into v_title,v_body,v_meta,v_link,v_rev,v_deleted,v_found from public.vh_projects p where p.account_id=p_account_id and p.id=p_entity_id;
  elsif p_entity_type='notebook' then
    select n.name,coalesce(n.description,''),jsonb_build_object('kind','notebook'),jsonb_build_object('route','library','entityType','notebook','entityId',n.id),n.revision::text,n.trashed_at is not null,true
      into v_title,v_body,v_meta,v_link,v_rev,v_deleted,v_found from public.vh_notebooks n where n.account_id=p_account_id and n.id=p_entity_id;
  elsif p_entity_type='conversation' then
    select c.title,'',jsonb_build_object('kind','conversation'),jsonb_build_object('route','conversation','entityType','conversation','entityId',c.id),c.revision::text,c.trashed_at is not null,true
      into v_title,v_body,v_meta,v_link,v_rev,v_deleted,v_found from public.vh_conversations c where c.account_id=p_account_id and c.id=p_entity_id;
  elsif p_entity_type='conversation_message' then
    select c.title,m.plain_text,jsonb_build_object('kind','conversation_message','conversationId',m.conversation_id),jsonb_build_object('route','conversation','entityType','conversation_message','entityId',m.id,'conversationId',m.conversation_id),extract(epoch from m.updated_at)::text,c.trashed_at is not null,true
      into v_title,v_body,v_meta,v_link,v_rev,v_deleted,v_found
      from public.vh_conversation_messages m join public.vh_conversations c on c.id=m.conversation_id and c.account_id=m.account_id
      where m.account_id=p_account_id and m.id=p_entity_id;
  elsif p_entity_type='library_asset' then
    select a.display_title,coalesce(a.original_filename,'')||' '||coalesce(a.detected_mime,a.declared_mime,''),jsonb_build_object('kind','library_asset','sourceKind',a.source_kind),jsonb_build_object('route','library','entityType','library_asset','entityId',a.id),a.source_revision::text,a.trashed_at is not null,true
      into v_title,v_body,v_meta,v_link,v_rev,v_deleted,v_found from public.vh_library_assets a where a.account_id=p_account_id and a.id=p_entity_id;
  elsif p_entity_type='library_content' then
    select a.display_title,left(coalesce((select string_agg(c.content,' ' order by c.chunk_index) from public.vh_source_chunks c where c.account_id=p_account_id and c.asset_id=a.id and c.source_revision=a.source_revision),''),200000),jsonb_build_object('kind','library_content','sourceKind',a.source_kind),jsonb_build_object('route','library','entityType','library_asset','entityId',a.id),a.source_revision::text,a.trashed_at is not null,true
      into v_title,v_body,v_meta,v_link,v_rev,v_deleted,v_found from public.vh_library_assets a where a.account_id=p_account_id and a.id=p_entity_id;
  elsif p_entity_type='note' then
    select n.title,public.vh_part4_jsonb_index_text(coalesce(v.blocks,'[]'::jsonb)),jsonb_build_object('kind','note'),jsonb_build_object('route','notes','entityType','note','entityId',n.id),n.revision::text,n.trashed_at is not null,true
      into v_title,v_body,v_meta,v_link,v_rev,v_deleted,v_found
      from public.vh_notes n left join public.vh_note_versions v on v.id=n.current_revision_id and v.account_id=n.account_id
      where n.account_id=p_account_id and n.id=p_entity_id;
  elsif p_entity_type='todo' then
    select t.title,coalesce(t.description,''),jsonb_build_object('kind','todo','status',t.status),jsonb_build_object('route','todos','entityType','todo','entityId',t.id),t.revision::text,t.trashed_at is not null,true
      into v_title,v_body,v_meta,v_link,v_rev,v_deleted,v_found from public.vh_todos t where t.account_id=p_account_id and t.id=p_entity_id;
  elsif p_entity_type='goal' then
    select g.title,coalesce(g.description,''),jsonb_build_object('kind','goal','state',g.state),jsonb_build_object('route','goals','entityType','goal','entityId',g.id),g.revision::text,g.trashed_at is not null,true
      into v_title,v_body,v_meta,v_link,v_rev,v_deleted,v_found from public.vh_goals g where g.account_id=p_account_id and g.id=p_entity_id;
  elsif p_entity_type='studio_artifact' then
    select a.title,public.vh_part4_jsonb_index_text(coalesce(v.content,'{}'::jsonb)),jsonb_build_object('kind','studio_artifact','artifactType',a.artifact_type),jsonb_build_object('route','studio','entityType','studio_artifact','entityId',a.id),a.revision::text,a.trashed_at is not null,true
      into v_title,v_body,v_meta,v_link,v_rev,v_deleted,v_found
      from public.vh_studio_artifacts a left join public.vh_studio_artifact_versions v on v.account_id=a.account_id and v.artifact_id=a.id and v.version_no=a.current_version
      where a.account_id=p_account_id and a.id=p_entity_id;
  elsif p_entity_type='tag' then
    select t.name,t.normalized_name,jsonb_build_object('kind','tag'),jsonb_build_object('route','library','entityType','tag','entityId',t.id),extract(epoch from t.updated_at)::text,false,true
      into v_title,v_body,v_meta,v_link,v_rev,v_deleted,v_found from public.vh_library_tags t where t.account_id=p_account_id and t.id=p_entity_id;
  elsif p_entity_type='collection' then
    select c.name,coalesce(c.description,''),jsonb_build_object('kind','collection'),jsonb_build_object('route','library','entityType','collection','entityId',c.id),c.revision::text,c.trashed_at is not null,true
      into v_title,v_body,v_meta,v_link,v_rev,v_deleted,v_found from public.vh_library_collections c where c.account_id=p_account_id and c.id=p_entity_id;
  else
    raise exception 'search_entity_type_invalid' using errcode='22023';
  end if;

  if not coalesce(v_found,false) then
    delete from public.vh_search_documents where account_id=p_account_id and entity_type=p_entity_type and entity_id=p_entity_id;
    delete from public.vh_search_reindex_queue where account_id=p_account_id and entity_type=p_entity_type and entity_id=p_entity_id;
    return false;
  end if;

  insert into public.vh_search_documents(account_id,entity_type,entity_id,title,body,match_metadata,deep_link,source_revision,deleted,updated_at)
  values(p_account_id,p_entity_type,p_entity_id,coalesce(v_title,''),coalesce(v_body,''),coalesce(v_meta,'{}'::jsonb),coalesce(v_link,'{}'::jsonb),v_rev,v_deleted,now())
  on conflict(account_id,entity_type,entity_id) do update set title=excluded.title,body=excluded.body,match_metadata=excluded.match_metadata,deep_link=excluded.deep_link,source_revision=excluded.source_revision,deleted=excluded.deleted,updated_at=now();
  delete from public.vh_search_reindex_queue where account_id=p_account_id and entity_type=p_entity_type and entity_id=p_entity_id;
  return true;
end;
$$;
revoke all on function public.vh_reindex_search_entity(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.vh_reindex_search_entity(uuid,text,uuid) to service_role;

create or replace function public.vh_global_search(
  p_account_id uuid,p_query text,p_limit integer default 40,p_types text[] default null
) returns table(entity_type text,entity_id uuid,title text,snippet text,match_reason text,deep_link jsonb,rank_score double precision)
language sql security definer set search_path=public,pg_temp
as $$
with q as (select websearch_to_tsquery('simple',left(coalesce(p_query,''),500)) query), ranked as (
  select d.*,
    ts_rank_cd(d.search_vector,q.query)::double precision + case when lower(d.title) like '%'||lower(p_query)||'%' then 2 else 0 end as score,
    case when lower(d.title) like '%'||lower(p_query)||'%' then 'title' else 'content' end as reason
  from public.vh_search_documents d cross join q
  where d.account_id=p_account_id and d.deleted=false
    and (p_types is null or d.entity_type=any(p_types))
    and (btrim(coalesce(p_query,''))='' or d.search_vector @@ q.query or lower(d.title) like '%'||lower(p_query)||'%' or lower(d.body) like '%'||lower(p_query)||'%')
)
select entity_type,entity_id,title,left(body,320),reason,deep_link,score from ranked
order by score desc,updated_at desc,entity_type,entity_id
limit least(greatest(coalesce(p_limit,40),1),100)
$$;
revoke all on function public.vh_global_search(uuid,text,integer,text[]) from public,anon,authenticated;
grant execute on function public.vh_global_search(uuid,text,integer,text[]) to service_role;

-- Search queue triggers. Version tables queue their owning Note/Artifact identity.
do $$ begin
  execute 'drop trigger if exists vh_p4_search_project on public.vh_projects';
  execute 'create trigger vh_p4_search_project after insert or update or delete on public.vh_projects for each row execute function public.vh_search_queue_trigger(''project'',''id'')';
  execute 'drop trigger if exists vh_p4_search_notebook on public.vh_notebooks';
  execute 'create trigger vh_p4_search_notebook after insert or update or delete on public.vh_notebooks for each row execute function public.vh_search_queue_trigger(''notebook'',''id'')';
  execute 'drop trigger if exists vh_p4_search_conversation on public.vh_conversations';
  execute 'create trigger vh_p4_search_conversation after insert or update or delete on public.vh_conversations for each row execute function public.vh_search_queue_trigger(''conversation'',''id'')';
  execute 'drop trigger if exists vh_p4_search_message on public.vh_conversation_messages';
  execute 'create trigger vh_p4_search_message after insert or update or delete on public.vh_conversation_messages for each row execute function public.vh_search_queue_trigger(''conversation_message'',''id'')';
  execute 'drop trigger if exists vh_p4_search_asset on public.vh_library_assets';
  execute 'create trigger vh_p4_search_asset after insert or update or delete on public.vh_library_assets for each row execute function public.vh_search_queue_trigger(''library_asset'',''id'')';
  execute 'drop trigger if exists vh_p4_search_chunk on public.vh_source_chunks';
  execute 'create trigger vh_p4_search_chunk after insert or update or delete on public.vh_source_chunks for each row execute function public.vh_search_queue_trigger(''library_content'',''asset_id'')';
  execute 'drop trigger if exists vh_p4_search_note on public.vh_notes';
  execute 'create trigger vh_p4_search_note after insert or update or delete on public.vh_notes for each row execute function public.vh_search_queue_trigger(''note'',''id'')';
  execute 'drop trigger if exists vh_p4_search_note_version on public.vh_note_versions';
  execute 'create trigger vh_p4_search_note_version after insert or update or delete on public.vh_note_versions for each row execute function public.vh_search_queue_trigger(''note'',''note_id'')';
  execute 'drop trigger if exists vh_p4_search_todo on public.vh_todos';
  execute 'create trigger vh_p4_search_todo after insert or update or delete on public.vh_todos for each row execute function public.vh_search_queue_trigger(''todo'',''id'')';
  execute 'drop trigger if exists vh_p4_search_goal on public.vh_goals';
  execute 'create trigger vh_p4_search_goal after insert or update or delete on public.vh_goals for each row execute function public.vh_search_queue_trigger(''goal'',''id'')';
  execute 'drop trigger if exists vh_p4_search_studio on public.vh_studio_artifacts';
  execute 'create trigger vh_p4_search_studio after insert or update or delete on public.vh_studio_artifacts for each row execute function public.vh_search_queue_trigger(''studio_artifact'',''id'')';
  execute 'drop trigger if exists vh_p4_search_studio_version on public.vh_studio_artifact_versions';
  execute 'create trigger vh_p4_search_studio_version after insert or update or delete on public.vh_studio_artifact_versions for each row execute function public.vh_search_queue_trigger(''studio_artifact'',''artifact_id'')';
  execute 'drop trigger if exists vh_p4_search_tag on public.vh_library_tags';
  execute 'create trigger vh_p4_search_tag after insert or update or delete on public.vh_library_tags for each row execute function public.vh_search_queue_trigger(''tag'',''id'')';
  execute 'drop trigger if exists vh_p4_search_collection on public.vh_library_collections';
  execute 'create trigger vh_p4_search_collection after insert or update or delete on public.vh_library_collections for each row execute function public.vh_search_queue_trigger(''collection'',''id'')';
end $$;

-- Migration-time backfill queue for existing owner data; one batch job per owner drains it asynchronously.
insert into public.vh_search_reindex_queue(account_id,entity_type,entity_id,reason)
select account_id,'project',id,'backfill' from public.vh_projects
union all select account_id,'notebook',id,'backfill' from public.vh_notebooks
union all select account_id,'conversation',id,'backfill' from public.vh_conversations
union all select account_id,'conversation_message',id,'backfill' from public.vh_conversation_messages
union all select account_id,'library_asset',id,'backfill' from public.vh_library_assets
union all select account_id,'library_content',id,'backfill' from public.vh_library_assets
union all select account_id,'note',id,'backfill' from public.vh_notes
union all select account_id,'todo',id,'backfill' from public.vh_todos
union all select account_id,'goal',id,'backfill' from public.vh_goals
union all select account_id,'studio_artifact',id,'backfill' from public.vh_studio_artifacts
union all select account_id,'tag',id,'backfill' from public.vh_library_tags
union all select account_id,'collection',id,'backfill' from public.vh_library_collections
on conflict(account_id,entity_type,entity_id) do update set reason='backfill',queued_at=now();

insert into public.vh_jobs(account_id,kind,payload,state,max_attempts)
select distinct account_id,'search.reindex.batch','{}'::jsonb,'queued',5 from public.vh_search_reindex_queue;

-- Explicit owner-scoped Trash metadata RPC for the Part4-native types and Conversation.
create or replace function public.vh_set_trash_state(
  p_account_id uuid,p_kind text,p_object_id uuid,p_trashed boolean
) returns boolean
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_after timestamptz:=case when p_trashed then now()+interval '30 days' else null end; v_count integer;
begin
  if p_kind='project' then update public.vh_projects set trashed_at=case when p_trashed then coalesce(trashed_at,now()) else null end,purge_after=v_after,updated_at=now(),revision=revision+1 where account_id=p_account_id and id=p_object_id;
  elsif p_kind='notebook' then update public.vh_notebooks set trashed_at=case when p_trashed then coalesce(trashed_at,now()) else null end,purge_after=v_after,updated_at=now(),revision=revision+1 where account_id=p_account_id and id=p_object_id;
  elsif p_kind='conversation' then update public.vh_conversations set trashed_at=case when p_trashed then coalesce(trashed_at,now()) else null end,purge_after=v_after,updated_at=now(),revision=revision+1 where account_id=p_account_id and id=p_object_id;
  elsif p_kind='note' then update public.vh_notes set trashed_at=case when p_trashed then coalesce(trashed_at,now()) else null end,purge_after=v_after,updated_at=now(),revision=revision+1 where account_id=p_account_id and id=p_object_id;
  elsif p_kind='todo' then update public.vh_todos set trashed_at=case when p_trashed then coalesce(trashed_at,now()) else null end,purge_after=v_after,updated_at=now(),revision=revision+1 where account_id=p_account_id and id=p_object_id;
  elsif p_kind='goal' then update public.vh_goals set trashed_at=case when p_trashed then coalesce(trashed_at,now()) else null end,purge_after=v_after,updated_at=now(),revision=revision+1 where account_id=p_account_id and id=p_object_id;
  elsif p_kind='studio_artifact' then update public.vh_studio_artifacts set trashed_at=case when p_trashed then coalesce(trashed_at,now()) else null end,purge_after=v_after,updated_at=now(),revision=revision+1 where account_id=p_account_id and id=p_object_id;
  elsif p_kind='library_asset' then update public.vh_library_assets set trashed_at=case when p_trashed then coalesce(trashed_at,now()) else null end,purge_after=v_after,updated_at=now() where account_id=p_account_id and id=p_object_id;
  else raise exception 'trash_kind_invalid' using errcode='22023'; end if;
  get diagnostics v_count=row_count;
  if v_count=0 then return false; end if;
  return true;
end;
$$;
revoke all on function public.vh_set_trash_state(uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.vh_set_trash_state(uuid,text,uuid,boolean) to service_role;

create or replace function public.vh_delete_part4_trash_metadata(p_account_id uuid,p_kind text,p_object_id uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_count integer;
begin
  if p_kind='conversation' then delete from public.vh_conversations where account_id=p_account_id and id=p_object_id and trashed_at is not null;
  elsif p_kind='note' then delete from public.vh_notes where account_id=p_account_id and id=p_object_id and trashed_at is not null;
  elsif p_kind='todo' then delete from public.vh_todos where account_id=p_account_id and id=p_object_id and trashed_at is not null;
  elsif p_kind='goal' then delete from public.vh_goals where account_id=p_account_id and id=p_object_id and trashed_at is not null;
  elsif p_kind='studio_artifact' then delete from public.vh_studio_artifacts where account_id=p_account_id and id=p_object_id and trashed_at is not null;
  else raise exception 'part4_delete_kind_invalid' using errcode='22023'; end if;
  get diagnostics v_count=row_count;
  delete from public.vh_search_documents where account_id=p_account_id and entity_type=case when p_kind='conversation' then 'conversation' else p_kind end and entity_id=p_object_id;
  return v_count=1;
end;
$$;
revoke all on function public.vh_delete_part4_trash_metadata(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.vh_delete_part4_trash_metadata(uuid,text,uuid) to service_role;
