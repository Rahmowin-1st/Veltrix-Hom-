-- Veltrix Hom Backend Part 3 Stage 60: titles, manual tags, pin/archive, exact Conversation search.
-- Additive over accepted Part 3 migrations 115-118.

-- Full-text indexes for all canonical Conversation search surfaces.
alter table public.vh_conversations
  add column if not exists title_search_vector tsvector
  generated always as (to_tsvector('simple', coalesce(title,''))) stored;
create index if not exists vh_conversations_title_search_idx
  on public.vh_conversations using gin(title_search_vector);

alter table public.vh_conversation_messages
  add column if not exists block_search_vector tsvector
  generated always as (jsonb_to_tsvector('simple', content_blocks, '["string"]'::jsonb)) stored;
create index if not exists vh_conversation_messages_block_search_idx
  on public.vh_conversation_messages using gin(block_search_vector);

alter table public.vh_conversation_tags
  add column if not exists catalog_key text,
  add column if not exists search_vector tsvector
  generated always as (to_tsvector('simple', coalesce(name,''))) stored;
create unique index if not exists vh_conversation_tags_owner_catalog_uq
  on public.vh_conversation_tags(account_id,catalog_key) where catalog_key is not null;
create index if not exists vh_conversation_tags_search_idx
  on public.vh_conversation_tags using gin(search_vector);

create index if not exists vh_projects_name_search_idx
  on public.vh_projects using gin(to_tsvector('simple', coalesce(name,'')));
create index if not exists vh_notebooks_name_search_idx
  on public.vh_notebooks using gin(to_tsvector('simple', coalesce(name,'')));
create index if not exists vh_library_assets_reference_search_idx
  on public.vh_library_assets using gin(to_tsvector('simple', coalesce(display_title,'') || ' ' || coalesce(original_filename,'')));

-- Catalog keys are the durable identity. Labels are seed presentation defaults and may evolve;
-- no backend behavior depends on the exact English labels.
create table if not exists public.vh_conversation_default_tag_catalog (
  catalog_key text primary key check (catalog_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  default_label text not null check (char_length(btrim(default_label)) between 1 and 64),
  manual_order integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.vh_conversation_default_tag_catalog(catalog_key,default_label,manual_order,active) values
  ('important','Important',10,true),
  ('study','Study',20,true),
  ('review','Review',30,true)
on conflict(catalog_key) do nothing;

create or replace function public.vh_ensure_conversation_default_tags(p_account_id uuid)
returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer;
begin
  perform 1 from public.vh_accounts where id=p_account_id;
  if not found then raise exception 'account_not_found' using errcode='P0002'; end if;
  insert into public.vh_conversation_tags(account_id,name,normalized_name,is_default,catalog_key)
  select p_account_id,c.default_label,lower(btrim(c.default_label)),true,c.catalog_key
  from public.vh_conversation_default_tag_catalog c
  where c.active
    and not exists (
      select 1 from public.vh_conversation_tags t
      where t.account_id=p_account_id and t.catalog_key=c.catalog_key
    )
  on conflict(account_id,normalized_name) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.vh_set_conversation_title_user(
  p_account_id uuid,p_conversation_id uuid,p_title text
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_title text;
begin
  v_title := regexp_replace(btrim(coalesce(p_title,'')), '\s+', ' ', 'g');
  if char_length(v_title) not between 1 and 200 then raise exception 'conversation_title_invalid' using errcode='22023'; end if;
  update public.vh_conversations
  set title=v_title,title_source='USER',updated_at=now(),revision=revision+1
  where id=p_conversation_id and account_id=p_account_id and trashed_at is null;
  if not found then raise exception 'conversation_not_found' using errcode='P0002'; end if;
  return jsonb_build_object('conversationId',p_conversation_id,'title',v_title,'titleSource','USER');
end $$;

create or replace function public.vh_apply_auto_conversation_title(
  p_account_id uuid,p_conversation_id uuid,p_title text
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_title text; v_current text; v_source text; v_applied boolean := false;
begin
  v_title := regexp_replace(btrim(coalesce(p_title,'')), '\s+', ' ', 'g');
  if char_length(v_title) not between 1 and 200 then raise exception 'conversation_title_invalid' using errcode='22023'; end if;
  select title,title_source into v_current,v_source from public.vh_conversations
  where id=p_conversation_id and account_id=p_account_id and trashed_at is null for update;
  if not found then raise exception 'conversation_not_found' using errcode='P0002'; end if;
  if v_source='AUTO' then
    update public.vh_conversations
    set title=v_title,updated_at=now(),revision=revision+1
    where id=p_conversation_id;
    v_current := v_title;
    v_applied := true;
  end if;
  return jsonb_build_object('conversationId',p_conversation_id,'title',v_current,'titleSource',v_source,'applied',v_applied);
end $$;

create or replace function public.vh_create_conversation_tag(
  p_account_id uuid,p_name text
) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_name text; v_normalized text; v_id uuid;
begin
  v_name := regexp_replace(btrim(coalesce(p_name,'')), '\s+', ' ', 'g');
  v_normalized := lower(v_name);
  if char_length(v_name) not between 1 and 64 then raise exception 'conversation_tag_invalid' using errcode='22023'; end if;
  perform public.vh_ensure_conversation_default_tags(p_account_id);
  select id into v_id from public.vh_conversation_tags where account_id=p_account_id and normalized_name=v_normalized;
  if found then return v_id; end if;
  insert into public.vh_conversation_tags(account_id,name,normalized_name,is_default,catalog_key)
  values(p_account_id,v_name,v_normalized,false,null) returning id into v_id;
  return v_id;
end $$;

create or replace function public.vh_rename_conversation_tag(
  p_account_id uuid,p_tag_id uuid,p_name text
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_name text; v_normalized text;
begin
  v_name := regexp_replace(btrim(coalesce(p_name,'')), '\s+', ' ', 'g');
  v_normalized := lower(v_name);
  if char_length(v_name) not between 1 and 64 then raise exception 'conversation_tag_invalid' using errcode='22023'; end if;
  perform 1 from public.vh_conversation_tags where id=p_tag_id and account_id=p_account_id and is_default=false for update;
  if not found then
    if exists(select 1 from public.vh_conversation_tags where id=p_tag_id and account_id=p_account_id) then
      raise exception 'default_tag_immutable' using errcode='P0001';
    end if;
    raise exception 'conversation_tag_not_found' using errcode='P0002';
  end if;
  begin
    update public.vh_conversation_tags set name=v_name,normalized_name=v_normalized,updated_at=now() where id=p_tag_id;
  exception when unique_violation then raise exception 'conversation_tag_name_conflict' using errcode='P0001'; end;
  return jsonb_build_object('tagId',p_tag_id,'name',v_name,'isDefault',false);
end $$;

create or replace function public.vh_delete_conversation_tag(
  p_account_id uuid,p_tag_id uuid
) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.vh_conversation_tags where id=p_tag_id and account_id=p_account_id and is_default=false for update;
  if not found then
    if exists(select 1 from public.vh_conversation_tags where id=p_tag_id and account_id=p_account_id) then
      raise exception 'default_tag_immutable' using errcode='P0001';
    end if;
    raise exception 'conversation_tag_not_found' using errcode='P0002';
  end if;
  delete from public.vh_conversation_tags where id=p_tag_id and account_id=p_account_id;
  return true;
end $$;

create or replace function public.vh_attach_conversation_tag(
  p_account_id uuid,p_conversation_id uuid,p_tag_id uuid
) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.vh_conversations where id=p_conversation_id and account_id=p_account_id and trashed_at is null;
  if not found then raise exception 'conversation_not_found' using errcode='P0002'; end if;
  perform 1 from public.vh_conversation_tags where id=p_tag_id and account_id=p_account_id;
  if not found then raise exception 'conversation_tag_not_found' using errcode='P0002'; end if;
  insert into public.vh_conversation_tag_links(account_id,conversation_id,tag_id)
  values(p_account_id,p_conversation_id,p_tag_id) on conflict(conversation_id,tag_id) do nothing;
  return true;
end $$;

create or replace function public.vh_detach_conversation_tag(
  p_account_id uuid,p_conversation_id uuid,p_tag_id uuid
) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  delete from public.vh_conversation_tag_links
  where account_id=p_account_id and conversation_id=p_conversation_id and tag_id=p_tag_id;
  return true;
end $$;

create or replace function public.vh_set_conversation_pin(
  p_account_id uuid,p_conversation_id uuid,p_pinned boolean,p_pin_order bigint default null
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_archived timestamptz;
begin
  select archived_at into v_archived from public.vh_conversations
  where id=p_conversation_id and account_id=p_account_id and trashed_at is null for update;
  if not found then raise exception 'conversation_not_found' using errcode='P0002'; end if;
  if p_pinned and v_archived is not null then raise exception 'archived_conversation_cannot_pin' using errcode='P0001'; end if;
  if p_pinned and p_pin_order is not null and p_pin_order < 0 then raise exception 'pin_order_invalid' using errcode='22023'; end if;
  update public.vh_conversations set
    pinned=p_pinned,
    pin_order=case when p_pinned then p_pin_order else null end,
    updated_at=now(),revision=revision+1
  where id=p_conversation_id;
  return jsonb_build_object('conversationId',p_conversation_id,'pinned',p_pinned,'pinOrder',case when p_pinned then p_pin_order else null end);
end $$;

create or replace function public.vh_set_conversation_archive(
  p_account_id uuid,p_conversation_id uuid,p_archived boolean
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_archived_at timestamptz;
begin
  update public.vh_conversations set
    archived_at=case when p_archived then coalesce(archived_at,now()) else null end,
    pinned=case when p_archived then false else pinned end,
    pin_order=case when p_archived then null else pin_order end,
    updated_at=now(),revision=revision+1
  where id=p_conversation_id and account_id=p_account_id and trashed_at is null
  returning archived_at into v_archived_at;
  if not found then raise exception 'conversation_not_found' using errcode='P0002'; end if;
  return jsonb_build_object('conversationId',p_conversation_id,'archived',v_archived_at is not null,'archivedAt',v_archived_at,'pinNormalized',p_archived);
end $$;

-- Active/archived history with optional all-tags filter. Pinned active conversations sort first.
create or replace function public.vh_list_conversation_history(
  p_account_id uuid,
  p_view text default 'active',
  p_tag_ids uuid[] default '{}'::uuid[],
  p_limit integer default 50
) returns table(
  conversation_id uuid,title text,title_source text,pinned boolean,pin_order bigint,
  archived_at timestamptz,last_message_at timestamptz,project_id uuid,tags jsonb
)
language sql stable security definer set search_path=public,pg_temp as $$
  select c.id,c.title,c.title_source,c.pinned,c.pin_order,c.archived_at,c.last_message_at,c.project_id,
    coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'isDefault',t.is_default) order by t.name)
      from public.vh_conversation_tag_links l join public.vh_conversation_tags t on t.id=l.tag_id and t.account_id=p_account_id
      where l.account_id=p_account_id and l.conversation_id=c.id),'[]'::jsonb) as tags
  from public.vh_conversations c
  where c.account_id=p_account_id and c.trashed_at is null
    and ((p_view='active' and c.archived_at is null) or (p_view='archived' and c.archived_at is not null) or p_view='all')
    and (coalesce(array_length(p_tag_ids,1),0)=0 or (
      select count(distinct l.tag_id) from public.vh_conversation_tag_links l
      where l.account_id=p_account_id and l.conversation_id=c.id and l.tag_id=any(p_tag_ids)
    )=array_length(p_tag_ids,1))
  order by
    case when c.archived_at is null then c.pinned else false end desc,
    case when c.archived_at is null and c.pinned then c.pin_order end asc nulls last,
    c.last_message_at desc nulls last,c.created_at desc,c.id desc
  limit greatest(1,least(coalesce(p_limit,50),100));
$$;

-- Exact lexical search across every frozen Conversation surface. Message hits carry the
-- precise message locator; AI block hits additionally carry the exact block id.
create or replace function public.vh_search_conversations(
  p_account_id uuid,p_query text,p_include_archived boolean default false,p_limit integer default 50
) returns table(
  hit_type text,conversation_id uuid,message_id uuid,block_id text,title text,match_text text,rank real
)
language sql stable security definer set search_path=public,pg_temp as $$
with q as (
  select plainto_tsquery('simple', left(btrim(p_query),500)) query
), eligible as (
  select c.* from public.vh_conversations c
  where c.account_id=p_account_id and c.trashed_at is null and (p_include_archived or c.archived_at is null)
), hits as (
  select 'title'::text hit_type,c.id conversation_id,null::uuid message_id,null::text block_id,c.title,
    c.title match_text,ts_rank(c.title_search_vector,q.query)::real rank
  from eligible c cross join q where q.query <> ''::tsquery and c.title_search_vector @@ q.query

  union all
  select 'user_message',c.id,m.id,null::text,c.title,left(m.plain_text,500),ts_rank(m.search_vector,q.query)::real
  from eligible c join public.vh_conversation_messages m on m.conversation_id=c.id and m.account_id=p_account_id
  cross join q where m.role='USER' and q.query <> ''::tsquery and m.search_vector @@ q.query

  union all
  select 'ai_block',c.id,m.id,b.value->>'id',c.title,left(b.value::text,500),
    ts_rank(jsonb_to_tsvector('simple',b.value,'["string"]'::jsonb),q.query)::real
  from eligible c join public.vh_conversation_messages m on m.conversation_id=c.id and m.account_id=p_account_id
  cross join q cross join lateral jsonb_array_elements(m.content_blocks) b(value)
  where m.role='ASSISTANT' and q.query <> ''::tsquery and m.block_search_vector @@ q.query
    and jsonb_to_tsvector('simple',b.value,'["string"]'::jsonb) @@ q.query

  union all
  select 'tag',c.id,null::uuid,null::text,c.title,t.name,ts_rank(t.search_vector,q.query)::real
  from eligible c join public.vh_conversation_tag_links l on l.conversation_id=c.id and l.account_id=p_account_id
  join public.vh_conversation_tags t on t.id=l.tag_id and t.account_id=p_account_id
  cross join q where q.query <> ''::tsquery and t.search_vector @@ q.query

  union all
  select 'notebook',c.id,null::uuid,null::text,c.title,n.name,
    ts_rank(to_tsvector('simple',coalesce(n.name,'')),q.query)::real
  from eligible c join public.vh_conversation_notebooks cn on cn.conversation_id=c.id and cn.account_id=p_account_id
  join public.vh_notebooks n on n.id=cn.notebook_id and n.account_id=p_account_id and n.trashed_at is null
  cross join q where q.query <> ''::tsquery and to_tsvector('simple',coalesce(n.name,'')) @@ q.query

  union all
  select 'project',c.id,null::uuid,null::text,c.title,p.name,
    ts_rank(to_tsvector('simple',coalesce(p.name,'')),q.query)::real
  from eligible c join public.vh_projects p on p.id=c.project_id and p.account_id=p_account_id and p.trashed_at is null
  cross join q where q.query <> ''::tsquery and to_tsvector('simple',coalesce(p.name,'')) @@ q.query

  union all
  select 'reference',c.id,null::uuid,null::text,c.title,a.display_title,
    ts_rank(to_tsvector('simple',coalesce(a.display_title,'') || ' ' || coalesce(a.original_filename,'')),q.query)::real
  from eligible c join public.vh_library_assets a on a.id=c.permanent_reference_asset_id and a.account_id=p_account_id
  cross join q where q.query <> ''::tsquery
    and to_tsvector('simple',coalesce(a.display_title,'') || ' ' || coalesce(a.original_filename,'')) @@ q.query
)
select h.hit_type,h.conversation_id,h.message_id,h.block_id,h.title,h.match_text,h.rank
from hits h
order by h.rank desc,h.conversation_id,h.message_id nulls first,h.block_id nulls first
limit greatest(1,least(coalesce(p_limit,50),100));
$$;

alter table public.vh_conversation_default_tag_catalog enable row level security;
revoke all on table public.vh_conversation_default_tag_catalog from public,anon,authenticated;
grant select,insert,update,delete on table public.vh_conversation_default_tag_catalog to service_role;

revoke all on function public.vh_ensure_conversation_default_tags(uuid) from public,anon,authenticated;
revoke all on function public.vh_set_conversation_title_user(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.vh_apply_auto_conversation_title(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.vh_create_conversation_tag(uuid,text) from public,anon,authenticated;
revoke all on function public.vh_rename_conversation_tag(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.vh_delete_conversation_tag(uuid,uuid) from public,anon,authenticated;
revoke all on function public.vh_attach_conversation_tag(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.vh_detach_conversation_tag(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.vh_set_conversation_pin(uuid,uuid,boolean,bigint) from public,anon,authenticated;
revoke all on function public.vh_set_conversation_archive(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.vh_list_conversation_history(uuid,text,uuid[],integer) from public,anon,authenticated;
revoke all on function public.vh_search_conversations(uuid,text,boolean,integer) from public,anon,authenticated;

grant execute on function public.vh_ensure_conversation_default_tags(uuid) to service_role;
grant execute on function public.vh_set_conversation_title_user(uuid,uuid,text) to service_role;
grant execute on function public.vh_apply_auto_conversation_title(uuid,uuid,text) to service_role;
grant execute on function public.vh_create_conversation_tag(uuid,text) to service_role;
grant execute on function public.vh_rename_conversation_tag(uuid,uuid,text) to service_role;
grant execute on function public.vh_delete_conversation_tag(uuid,uuid) to service_role;
grant execute on function public.vh_attach_conversation_tag(uuid,uuid,uuid) to service_role;
grant execute on function public.vh_detach_conversation_tag(uuid,uuid,uuid) to service_role;
grant execute on function public.vh_set_conversation_pin(uuid,uuid,boolean,bigint) to service_role;
grant execute on function public.vh_set_conversation_archive(uuid,uuid,boolean) to service_role;
grant execute on function public.vh_list_conversation_history(uuid,text,uuid[],integer) to service_role;
grant execute on function public.vh_search_conversations(uuid,text,boolean,integer) to service_role;
