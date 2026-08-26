-- Veltrix Hom Backend Part 3 Stage 60 hygiene.
-- Preserve the accepted exact-search contract while avoiding empty-tsquery NOTICE spam.

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
  from eligible c cross join q where numnode(q.query) > 0 and c.title_search_vector @@ q.query

  union all
  select 'user_message',c.id,m.id,null::text,c.title,left(m.plain_text,500),ts_rank(m.search_vector,q.query)::real
  from eligible c join public.vh_conversation_messages m on m.conversation_id=c.id and m.account_id=p_account_id
  cross join q where m.role='USER' and numnode(q.query) > 0 and m.search_vector @@ q.query

  union all
  select 'ai_block',c.id,m.id,b.value->>'id',c.title,left(b.value::text,500),
    ts_rank(jsonb_to_tsvector('simple',b.value,'["string"]'::jsonb),q.query)::real
  from eligible c join public.vh_conversation_messages m on m.conversation_id=c.id and m.account_id=p_account_id
  cross join q cross join lateral jsonb_array_elements(m.content_blocks) b(value)
  where m.role='ASSISTANT' and numnode(q.query) > 0 and m.block_search_vector @@ q.query
    and jsonb_to_tsvector('simple',b.value,'["string"]'::jsonb) @@ q.query

  union all
  select 'tag',c.id,null::uuid,null::text,c.title,t.name,ts_rank(t.search_vector,q.query)::real
  from eligible c join public.vh_conversation_tag_links l on l.conversation_id=c.id and l.account_id=p_account_id
  join public.vh_conversation_tags t on t.id=l.tag_id and t.account_id=p_account_id
  cross join q where numnode(q.query) > 0 and t.search_vector @@ q.query

  union all
  select 'notebook',c.id,null::uuid,null::text,c.title,n.name,
    ts_rank(to_tsvector('simple',coalesce(n.name,'')),q.query)::real
  from eligible c join public.vh_conversation_notebooks cn on cn.conversation_id=c.id and cn.account_id=p_account_id
  join public.vh_notebooks n on n.id=cn.notebook_id and n.account_id=p_account_id and n.trashed_at is null
  cross join q where numnode(q.query) > 0 and to_tsvector('simple',coalesce(n.name,'')) @@ q.query

  union all
  select 'project',c.id,null::uuid,null::text,c.title,p.name,
    ts_rank(to_tsvector('simple',coalesce(p.name,'')),q.query)::real
  from eligible c join public.vh_projects p on p.id=c.project_id and p.account_id=p_account_id and p.trashed_at is null
  cross join q where numnode(q.query) > 0 and to_tsvector('simple',coalesce(p.name,'')) @@ q.query

  union all
  select 'reference',c.id,null::uuid,null::text,c.title,a.display_title,
    ts_rank(to_tsvector('simple',coalesce(a.display_title,'') || ' ' || coalesce(a.original_filename,'')),q.query)::real
  from eligible c join public.vh_library_assets a on a.id=c.permanent_reference_asset_id and a.account_id=p_account_id
  cross join q where numnode(q.query) > 0
    and to_tsvector('simple',coalesce(a.display_title,'') || ' ' || coalesce(a.original_filename,'')) @@ q.query
)
select h.hit_type,h.conversation_id,h.message_id,h.block_id,h.title,h.match_text,h.rank
from hits h
order by h.rank desc,h.conversation_id,h.message_id nulls first,h.block_id nulls first
limit greatest(1,least(coalesce(p_limit,50),100));
$$;

revoke all on function public.vh_search_conversations(uuid,text,boolean,integer) from public,anon,authenticated;
grant execute on function public.vh_search_conversations(uuid,text,boolean,integer) to service_role;
