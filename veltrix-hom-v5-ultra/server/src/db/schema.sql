-- =====================================================================
-- VELTRIX HOM — Supabase schema
-- Run this ONCE in Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run: everything is guarded with IF NOT EXISTS / OR REPLACE.
-- =====================================================================

create extension if not exists vector;
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. PROFILES
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id               uuid primary key references auth.users on delete cascade,
  full_name        text,
  avatar_url       text,
  grade            int check (grade between 1 and 11),
  school_language  text default 'uz',
  learning_language text default 'en',
  onboarding_done  boolean default false,
  xp               int default 0,
  streak_days      int default 0,
  last_active      date,
  created_at       timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 2. USER SETTINGS
-- ---------------------------------------------------------------------
create table if not exists user_settings (
  user_id           uuid primary key references profiles on delete cascade,
  theme             text default 'system',   -- dark | light | system
  glass_intensity   int  default 80,         -- 0..100
  reduced_motion    boolean default false,
  compact_mode      boolean default false,
  performance_mode  text default 'auto',     -- auto | on | off
  answer_length     text default 'normal',   -- short | normal | detailed
  age_adapted       boolean default true,
  source_only       boolean default true,
  citation_required boolean default true,
  show_formulas     boolean default true,
  sticker_level     text default 'normal',   -- off | low | normal | high
  teacher_mode      boolean default false,
  voice_gender      text default 'male',
  voice_age         text default 'adult',
  voice_rate        numeric default 1.0,
  voice_volume      numeric default 1.0,
  auto_read         boolean default false,
  tr_source_lang    text default 'auto',
  tr_target_lang    text default 'uz',
  tr_show_original  boolean default true,
  tr_remember_last  boolean default true,
  auto_source       boolean default true,
  updated_at        timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 3. SUBJECTS
-- ---------------------------------------------------------------------
create table if not exists subjects (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid references profiles on delete cascade,
  name      text not null,
  slug      text not null,
  emoji     text,
  color     text,
  is_system boolean default false
);
create index if not exists subjects_user_idx on subjects(user_id);

-- ---------------------------------------------------------------------
-- 4. SOURCES (books / PDFs)
-- ---------------------------------------------------------------------
create table if not exists sources (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references profiles on delete cascade,
  subject_id   uuid references subjects on delete set null,
  title        text not null,
  author       text,
  grade        int,
  storage_path text,
  external_url text,
  cover_url    text,
  page_count   int default 0,
  status       text default 'queued',  -- queued|extracting|ocr|embedding|ready|failed
  progress     int default 0,
  error_message text,
  is_active    boolean default false,
  last_used_at timestamptz,
  created_at   timestamptz default now()
);
create index if not exists sources_user_idx on sources(user_id);
create index if not exists sources_active_idx on sources(user_id, is_active) where is_active;

-- ---------------------------------------------------------------------
-- 5. SOURCE PAGES (raw text per page)
-- ---------------------------------------------------------------------
create table if not exists source_pages (
  id             uuid primary key default gen_random_uuid(),
  source_id      uuid references sources on delete cascade,
  page_number    int not null,
  text_content   text,
  has_text_layer boolean default true,
  ocr_used       boolean default false,
  unique(source_id, page_number)
);

-- ---------------------------------------------------------------------
-- 6. SOURCE CHUNKS (RAG units)  — embedding: gemini-embedding-2 @ 768d
-- ---------------------------------------------------------------------
create table if not exists source_chunks (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid references sources on delete cascade,
  user_id      uuid references profiles on delete cascade,
  page_number  int not null,
  chunk_index  int not null,
  content      text not null,
  content_hash text,
  heading      text,
  embedding    vector(768)
);

-- HNSW (not IVFFlat): usable recall from the very first row, no rebuild step.
create index if not exists source_chunks_embedding_idx
  on source_chunks using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create index if not exists source_chunks_trgm_idx
  on source_chunks using gin (content gin_trgm_ops);

create index if not exists source_chunks_source_page_idx
  on source_chunks(source_id, page_number);

create unique index if not exists source_chunks_dedup_idx
  on source_chunks(source_id, content_hash);

-- ---------------------------------------------------------------------
-- 7. CHATS & MESSAGES
-- ---------------------------------------------------------------------
create table if not exists chats (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references profiles on delete cascade,
  title            text,
  subject_id       uuid references subjects on delete set null,
  locked_source_id uuid references sources on delete set null,
  translate_enabled boolean default false,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
create index if not exists chats_user_idx on chats(user_id, updated_at desc);

create table if not exists messages (
  id               uuid primary key default gen_random_uuid(),
  chat_id          uuid references chats on delete cascade,
  user_id          uuid references profiles on delete cascade,
  role             text not null,  -- user | assistant | system
  content          text,
  blocks           jsonb,
  attachments      jsonb,
  detected_subject text,
  used_source_id   uuid,
  source_mode      text,           -- locked | auto | none | not_found
  model_used       text,
  tokens_used      int,
  latency_ms       int,
  created_at       timestamptz default now()
);
create index if not exists messages_chat_idx on messages(chat_id, created_at);

create table if not exists message_citations (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid references messages on delete cascade,
  source_id   uuid,
  page_number int,
  chunk_id    uuid,
  quote       text,
  ref         text
);

-- ---------------------------------------------------------------------
-- 8. TASKS (Personal agent)
-- ---------------------------------------------------------------------
create table if not exists tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references profiles on delete cascade,
  subject_id    uuid,
  source_id     uuid,
  title         text,
  page_from     int,
  page_to       int,
  exercise_ref  text,
  input_type    text,  -- text | image | voice | source_ref
  output_format text,  -- answer_only | short | full | notebook | voice | quiz
  answer_length text default 'normal',
  status        text default 'pending', -- pending | processing | done | failed
  result        jsonb,
  due_date      date,
  created_at    timestamptz default now()
);
create index if not exists tasks_user_idx on tasks(user_id, created_at desc);

-- ---------------------------------------------------------------------
-- 9. SUPPORTING TABLES
-- ---------------------------------------------------------------------
create table if not exists saved_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles on delete cascade,
  message_id uuid, folder text, note text,
  created_at timestamptz default now()
);

create table if not exists mistake_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles on delete cascade,
  subject_id uuid, topic text, question text, correct text,
  reviewed_count int default 0,
  created_at timestamptz default now()
);

create table if not exists formula_bank (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles on delete cascade,
  subject_id uuid, latex text, title text, source_id uuid, page_number int,
  created_at timestamptz default now()
);

create table if not exists answer_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles on delete cascade,
  source_id uuid,
  question text,
  question_embedding vector(768),
  answer_blocks jsonb,
  hit_count int default 0,
  created_at timestamptz default now()
);
create index if not exists answer_cache_embedding_idx
  on answer_cache using hnsw (question_embedding vector_cosine_ops);

create table if not exists quota_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles on delete cascade,
  day date, model text,
  requests int default 0, tokens int default 0,
  unique(user_id, day, model)
);

-- ---------------------------------------------------------------------
-- 10. TRIGGER — auto-create profile + settings + system subjects on signup
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.subjects (user_id, name, slug, emoji, color, is_system) values
    (new.id, 'Matematika',  'matematika',  '➗', '#7C5CFF', true),
    (new.id, 'Algebra',     'algebra',     '➗', '#7C5CFF', true),
    (new.id, 'Geometriya',  'geometriya',  '📐', '#38D6FF', true),
    (new.id, 'Fizika',      'fizika',      '🧪', '#38D6FF', true),
    (new.id, 'Kimyo',       'kimyo',       '⚗️', '#34D399', true),
    (new.id, 'Biologiya',   'biologiya',   '🌱', '#34D399', true),
    (new.id, 'Tarix',       'tarix',       '🌍', '#FFB84D', true),
    (new.id, 'Geografiya',  'geografiya',  '🗺️', '#FFB84D', true),
    (new.id, 'Ona tili',    'ona-tili',    '📖', '#FF5D6C', true),
    (new.id, 'Adabiyot',    'adabiyot',    '📚', '#FF5D6C', true),
    (new.id, 'Ingliz tili', 'ingliz-tili', '🇬🇧', '#7C5CFF', true),
    (new.id, 'Rus tili',    'rus-tili',    '🇷🇺', '#7C5CFF', true),
    (new.id, 'Informatika', 'informatika', '💻', '#38D6FF', true);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 11. HYBRID SEARCH RPC (vector + trigram, fused with RRF)
--     Called from the server with the service role key.
-- ---------------------------------------------------------------------
create or replace function public.match_source_chunks(
  p_user_id      uuid,
  p_embedding    vector(768),
  p_query_text   text,
  p_source_ids   uuid[] default null,
  p_page_from    int  default null,
  p_page_to      int  default null,
  p_match_count  int  default 6
)
returns table (
  id uuid, source_id uuid, page_number int, chunk_index int,
  content text, heading text, similarity float, score float
)
language sql stable
as $$
with filtered as (
  select c.* from source_chunks c
  where c.user_id = p_user_id
    and (p_source_ids is null or c.source_id = any(p_source_ids))
    and (p_page_from is null or c.page_number between p_page_from and p_page_to)
),
vec as (
  select f.id, row_number() over (order by f.embedding <=> p_embedding) as rnk,
         1 - (f.embedding <=> p_embedding) as sim
  from filtered f
  where f.embedding is not null
  order by f.embedding <=> p_embedding
  limit 12
),
kw as (
  select f.id, row_number() over (order by similarity(f.content, p_query_text) desc) as rnk
  from filtered f
  where p_query_text is not null and f.content % p_query_text
  order by similarity(f.content, p_query_text) desc
  limit 8
),
fused as (
  select coalesce(v.id, k.id) as id,
         coalesce(1.0 / (60 + v.rnk), 0) + coalesce(1.0 / (60 + k.rnk), 0) as rrf,
         coalesce(v.sim, 0) as sim
  from vec v full outer join kw k on v.id = k.id
)
select f.id, f.source_id, f.page_number, f.chunk_index,
       f.content, f.heading, fu.sim::float, fu.rrf::float
from fused fu join source_chunks f on f.id = fu.id
order by fu.rrf desc
limit p_match_count;
$$;

-- Semantic cache lookup (cosine > 0.94, same source)
create or replace function public.match_answer_cache(
  p_user_id   uuid,
  p_embedding vector(768),
  p_source_id uuid default null,
  p_threshold float default 0.94
)
returns table (id uuid, answer_blocks jsonb, similarity float)
language sql stable
as $$
  select a.id, a.answer_blocks, (1 - (a.question_embedding <=> p_embedding))::float as similarity
  from answer_cache a
  where a.user_id = p_user_id
    and (p_source_id is null and a.source_id is null or a.source_id = p_source_id)
    and a.question_embedding is not null
    and (1 - (a.question_embedding <=> p_embedding)) > p_threshold
  order by a.question_embedding <=> p_embedding
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- 12. ROW LEVEL SECURITY — every table, owner-only
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_settings','subjects','sources','chats','messages',
    'tasks','saved_answers','mistake_log','formula_bank','answer_cache',
    'quota_usage','source_chunks'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists owner_all on %I', t);
  end loop;
end $$;

create policy owner_all on profiles      for all using (auth.uid() = id)      with check (auth.uid() = id);
create policy owner_all on user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_all on subjects      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_all on sources       for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_all on chats         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_all on messages      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_all on tasks         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_all on saved_answers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_all on mistake_log   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_all on formula_bank  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_all on answer_cache  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_all on quota_usage   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_all on source_chunks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- source_pages & message_citations inherit ownership via their parent
alter table source_pages enable row level security;
drop policy if exists owner_via_source on source_pages;
create policy owner_via_source on source_pages for all
  using (exists (select 1 from sources s where s.id = source_pages.source_id and s.user_id = auth.uid()));

alter table message_citations enable row level security;
drop policy if exists owner_via_message on message_citations;
create policy owner_via_message on message_citations for all
  using (exists (select 1 from messages m where m.id = message_citations.message_id and m.user_id = auth.uid()));

-- ---------------------------------------------------------------------
-- 13. STORAGE — private bucket for uploaded books
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sources', 'sources', false, 52428800,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "own folder read"   on storage.objects;
drop policy if exists "own folder write"  on storage.objects;
drop policy if exists "own folder delete" on storage.objects;

create policy "own folder read" on storage.objects for select
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own folder write" on storage.objects for insert
  with check (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own folder delete" on storage.objects for delete
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);
