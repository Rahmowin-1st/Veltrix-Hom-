-- =====================================================================
-- VELTRIX HOM — migration 003
-- Adds Skills, richer source metadata (icon/colour/hash/state) and the
-- translation preferences the Tarjima workspace needs.
--
-- Additive and idempotent: no existing row is modified or removed.
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. SKILLS — reusable AI instruction profiles
-- ---------------------------------------------------------------------
create table if not exists skills (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references profiles on delete cascade,
  name         text not null,
  emoji        text default '✨',
  color        text default '#0878F5',
  description  text,
  instructions text,
  scope        text default 'global',        -- global | project | subject
  project_id   uuid references projects  on delete cascade,
  subject_id   uuid references subjects  on delete set null,
  is_default   boolean default false,
  use_count    int default 0,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  constraint skills_scope_valid check (scope in ('global', 'project', 'subject'))
);
create index if not exists skills_user_idx    on skills(user_id, updated_at desc);
create index if not exists skills_project_idx on skills(project_id) where project_id is not null;

alter table skills enable row level security;
drop policy if exists owner_all on skills;
create policy owner_all on skills for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A chat remembers which Skill was active, so reopening it restores context.
alter table chats add column if not exists skill_id uuid references skills on delete set null;

-- ---------------------------------------------------------------------
-- 2. SOURCES — presentation metadata + de-duplication + real byte size
-- ---------------------------------------------------------------------
alter table sources add column if not exists emoji      text default '📘';
alter table sources add column if not exists color      text default '#0878F5';
alter table sources add column if not exists file_hash  text;
alter table sources add column if not exists file_size  bigint;
alter table sources add column if not exists mime_type  text;
alter table sources add column if not exists last_used_at timestamptz;

-- Same file uploaded twice by the same user is caught before any AI cost.
create unique index if not exists sources_user_hash_uniq
  on sources(user_id, file_hash) where file_hash is not null;

-- ---------------------------------------------------------------------
-- 3. TRANSLATION preferences — remembered per account, not per device
-- ---------------------------------------------------------------------
alter table user_settings add column if not exists tr_last_target text;
alter table user_settings add column if not exists tr_auto_read   boolean default false;
alter table user_settings add column if not exists default_skill_id uuid;

-- ---------------------------------------------------------------------
-- 4. PROJECTS — default Skill and translation carry-over
-- ---------------------------------------------------------------------
alter table projects add column if not exists skill_id  uuid references skills on delete set null;
alter table projects add column if not exists pinned    boolean default false;

create index if not exists projects_pinned_idx on projects(user_id, pinned) where pinned;

-- ---------------------------------------------------------------------
-- 5. Storage policies for the private `sources` bucket
--    (bucket itself is created by schema.sql; these are the owner rules)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from storage.buckets where id = 'sources') then
    -- Path convention: {user_id}/{source_id}.pdf → first folder is the owner.
    drop policy if exists sources_owner_read   on storage.objects;
    drop policy if exists sources_owner_write  on storage.objects;
    drop policy if exists sources_owner_delete on storage.objects;

    create policy sources_owner_read on storage.objects for select
      using (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);

    create policy sources_owner_write on storage.objects for insert
      with check (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);

    create policy sources_owner_delete on storage.objects for delete
      using (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
