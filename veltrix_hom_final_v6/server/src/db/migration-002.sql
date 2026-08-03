-- =====================================================================
-- VELTRIX HOM — migration 002
-- Moves pins, archive, drafts and projects from device-local storage
-- into the account, so a different phone shows the same workspace.
--
-- Safe to re-run. Existing rows and data are never touched.
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROJECTS — focused homework workspaces
-- ---------------------------------------------------------------------
create table if not exists projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references profiles on delete cascade,
  name          text not null,
  emoji         text default '📘',
  color         text default '#0176D4',
  subject_id    uuid references subjects on delete set null,
  grade         int,
  instructions  text,
  answer_length text default 'normal',
  archived      boolean default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists projects_user_idx on projects(user_id, updated_at desc);

-- Which sources belong to a project (many-to-many).
create table if not exists project_sources (
  project_id uuid references projects on delete cascade,
  source_id  uuid references sources  on delete cascade,
  user_id    uuid references profiles on delete cascade,
  primary key (project_id, source_id)
);

-- ---------------------------------------------------------------------
-- 2. CHATS — pin, archive, draft, project link (all additive)
-- ---------------------------------------------------------------------
alter table chats add column if not exists pinned     boolean default false;
alter table chats add column if not exists archived   boolean default false;
alter table chats add column if not exists draft      text;
alter table chats add column if not exists project_id uuid references projects on delete set null;

create index if not exists chats_pinned_idx  on chats(user_id, pinned)  where pinned;
create index if not exists chats_project_idx on chats(project_id);

-- ---------------------------------------------------------------------
-- 3. PROFILES / SETTINGS — preferences that must follow the account
-- ---------------------------------------------------------------------
alter table profiles add column if not exists preferred_name text;

alter table user_settings add column if not exists font_scale        numeric default 1;
alter table user_settings add column if not exists default_answer_mode text default 'full';
alter table user_settings add column if not exists sidebar_collapsed boolean default false;
alter table user_settings add column if not exists enabled_subjects  text[] default '{}';

-- ---------------------------------------------------------------------
-- 4. FULL-TEXT SEARCH over chat titles and message bodies
-- ---------------------------------------------------------------------
create index if not exists chats_title_trgm_idx
  on chats using gin (title gin_trgm_ops);

create index if not exists messages_content_trgm_idx
  on messages using gin (content gin_trgm_ops);

create or replace function public.search_chats(
  p_user_id uuid,
  p_query   text,
  p_limit   int default 30
)
returns table (
  id uuid, title text, updated_at timestamptz,
  pinned boolean, project_id uuid, snippet text
)
language sql stable
as $$
  with title_hits as (
    select c.id, c.title, c.updated_at, c.pinned, c.project_id,
           null::text as snippet, 1.0 as rank
    from chats c
    where c.user_id = p_user_id
      and c.archived = false
      and c.title ilike '%' || p_query || '%'
  ),
  body_hits as (
    select distinct on (c.id)
           c.id, c.title, c.updated_at, c.pinned, c.project_id,
           left(m.content, 140) as snippet, 0.5 as rank
    from messages m
    join chats c on c.id = m.chat_id
    where m.user_id = p_user_id
      and c.archived = false
      and m.content ilike '%' || p_query || '%'
    order by c.id, m.created_at desc
  )
  select distinct on (h.id) h.id, h.title, h.updated_at, h.pinned, h.project_id, h.snippet
  from (select * from title_hits union all select * from body_hits) h
  order by h.id, h.rank desc
  limit p_limit;
$$;

-- ---------------------------------------------------------------------
-- 5. RLS on the new tables — owner-only, same rule as everywhere else
-- ---------------------------------------------------------------------
alter table projects        enable row level security;
alter table project_sources enable row level security;

drop policy if exists owner_all on projects;
create policy owner_all on projects for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists owner_all on project_sources;
create policy owner_all on project_sources for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 6. Keep chats.updated_at honest when only metadata changes
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists projects_touch on projects;
create trigger projects_touch before update on projects
  for each row execute function public.touch_updated_at();
