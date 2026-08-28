#!/usr/bin/env bash
set -euo pipefail

psql -X -v ON_ERROR_STOP=1 <<'SQL'
\pset tuples_only on
\pset format unaligned

-- Registry must expose the full frozen 14-type initial set.
do $$
declare c integer;
begin
  select count(*) into c from public.vh_studio_artifact_registry where active;
  if c < 14 then raise exception 'P4_STAGE10_REGISTRY_COUNT expected>=14 actual=%', c; end if;
end $$;

-- Required durable Part4 tables must exist.
do $$
declare missing text;
begin
  select string_agg(name, ',') into missing
  from (values
    ('vh_studio_artifact_registry'),('vh_studio_sessions'),('vh_studio_generations'),
    ('vh_studio_input_bindings'),('vh_studio_generation_attachments'),('vh_studio_artifacts'),
    ('vh_studio_artifact_versions'),('vh_goals'),('vh_goal_milestones'),('vh_todos'),
    ('vh_todo_check_items'),('vh_goal_todo_links'),('vh_productivity_links'),('vh_notes'),
    ('vh_note_versions'),('vh_ai_change_proposals'),('vh_memories'),('vh_notification_preferences'),
    ('vh_device_tokens'),('vh_notifications'),('vh_attention_states'),('vh_search_documents'),
    ('vh_part4_tag_links')
  ) x(name)
  where to_regclass('public.' || name) is null;
  if missing is not null then raise exception 'P4_STAGE10_MISSING_TABLES=%', missing; end if;
end $$;

-- Every owner-bearing Part4 table must have RLS enabled.
do $$
declare bad text;
begin
  select string_agg(c.relname, ',') into bad
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname in (
      'vh_studio_sessions','vh_studio_generations','vh_studio_input_bindings','vh_studio_generation_attachments',
      'vh_studio_artifacts','vh_studio_artifact_versions','vh_goals','vh_goal_milestones','vh_todos',
      'vh_todo_check_items','vh_goal_todo_links','vh_productivity_links','vh_notes','vh_note_versions',
      'vh_ai_change_proposals','vh_memories','vh_notification_preferences','vh_device_tokens','vh_notifications',
      'vh_attention_states','vh_search_documents','vh_part4_tag_links'
    ) and not c.relrowsecurity;
  if bad is not null then raise exception 'P4_STAGE10_RLS_DISABLED=%', bad; end if;
end $$;

-- Notes must remain structured blocks, Studio outputs must be typed, and memory must be global.
do $$
declare bad integer;
begin
  select count(*) into bad from public.vh_studio_artifact_registry
   where jsonb_typeof(input_schema) <> 'object' or jsonb_typeof(output_schema) <> 'object'
      or output_kind not in ('structured','binary','hybrid','audio');
  if bad <> 0 then raise exception 'P4_STAGE10_BAD_REGISTRY_ROWS=%', bad; end if;

  if to_regclass('public.vh_project_memories') is not null or to_regclass('public.vh_notebook_memories') is not null then
    raise exception 'P4_STAGE10_ISOLATED_MEMORY_STORE_FORBIDDEN';
  end if;
end $$;

select 'P4_STAGE10_REGISTRY=' || count(*) from public.vh_studio_artifact_registry where active;
select 'P4_STAGE10_TABLES=' || count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'vh_%';
select 'P4_STAGE10=PASS';
SQL
