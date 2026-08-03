-- =====================================================================
-- VELTRIX HOM — migration 005
-- Canonical V5 workspace: appearance sync, activity/streak analytics,
-- persistent tests, attempts, question answers, and profile background.
-- Additive + idempotent. Existing rows are never deleted.
-- Run in Supabase Dashboard → SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. APPEARANCE / CHAT PRESENTATION — account-synced
-- ---------------------------------------------------------------------
alter table user_settings add column if not exists accent_color          text default '#0A6CFF';
alter table user_settings add column if not exists accent_secondary      text default '#4ACEFF';
alter table user_settings add column if not exists chat_gradient_from    text default '#EEF5FF';
alter table user_settings add column if not exists chat_gradient_to      text default '#FFFFFF';
alter table user_settings add column if not exists chat_background_url   text;
alter table user_settings add column if not exists chat_background_blur  int default 24;
alter table user_settings add column if not exists mirror_intensity      int default 72;
alter table user_settings add column if not exists greeting_rotation     boolean default true;
alter table user_settings add column if not exists confetti_enabled      boolean default true;
alter table user_settings add column if not exists wrong_answer_haptics  boolean default true;

update user_settings set
  accent_color         = coalesce(accent_color, '#0A6CFF'),
  accent_secondary     = coalesce(accent_secondary, '#4ACEFF'),
  chat_gradient_from   = coalesce(chat_gradient_from, '#EEF5FF'),
  chat_gradient_to     = coalesce(chat_gradient_to, '#FFFFFF'),
  chat_background_blur = coalesce(chat_background_blur, 24),
  mirror_intensity     = coalesce(mirror_intensity, 72),
  greeting_rotation    = coalesce(greeting_rotation, true),
  confetti_enabled     = coalesce(confetti_enabled, true),
  wrong_answer_haptics = coalesce(wrong_answer_haptics, true)
where accent_color is null
   or accent_secondary is null
   or chat_gradient_from is null
   or chat_gradient_to is null
   or chat_background_blur is null
   or mirror_intensity is null
   or greeting_rotation is null
   or confetti_enabled is null
   or wrong_answer_haptics is null;

-- ---------------------------------------------------------------------
-- 2. ACTIVITY — the Personal dashboard reads real account events
-- ---------------------------------------------------------------------
create table if not exists activity_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles on delete cascade,
  kind        text not null,
  subject_id  uuid references subjects on delete set null,
  chat_id     uuid references chats on delete set null,
  project_id  uuid references projects on delete set null,
  points      int not null default 1,
  metadata    jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint activity_kind_valid check (kind in (
    'chat_message','homework_done','source_used','source_added','quiz_created',
    'quiz_answered','quiz_completed','skill_used','translation','game_completed'
  ))
);
create index if not exists activity_events_user_time_idx
  on activity_events(user_id, occurred_at desc);
create index if not exists activity_events_user_kind_idx
  on activity_events(user_id, kind, occurred_at desc);

alter table activity_events enable row level security;
drop policy if exists owner_all on activity_events;
create policy owner_all on activity_events for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Compact RPC used by Personal. It returns deterministic account data only.
create or replace function public.get_activity_summary(p_user_id uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with daily as (
    select date(occurred_at at time zone 'UTC') as day,
           sum(points)::int as points,
           count(*)::int as actions
      from activity_events
     where user_id = p_user_id
       and occurred_at >= now() - interval '35 days'
     group by 1
  ), totals as (
    select
      coalesce(sum(points) filter (where day >= current_date - 6), 0)::int as week_points,
      coalesce(sum(points) filter (where day >= date_trunc('month', current_date)), 0)::int as month_points,
      coalesce(max(points), 0)::int as best_day_points,
      coalesce(count(*) filter (where day >= current_date - 2 and actions > 0), 0)::int as active_last_3,
      coalesce(count(*) filter (where day >= current_date - 29 and actions > 0), 0)::int as active_last_30
    from daily
  )
  select jsonb_build_object(
    'weekPoints', week_points,
    'monthPoints', month_points,
    'bestDayPoints', best_day_points,
    'activeLast3', active_last_3,
    'activeLast30', active_last_30,
    'days', coalesce((select jsonb_agg(jsonb_build_object(
      'day', day, 'points', points, 'actions', actions
    ) order by day) from daily), '[]'::jsonb)
  ) from totals;
$$;

revoke all on function public.get_activity_summary(uuid) from public, authenticated;
grant execute on function public.get_activity_summary(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 3. TESTS — manually authored or AI generated, account-synced
-- ---------------------------------------------------------------------
create table if not exists quizzes (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references profiles on delete cascade,
  title                 text not null,
  description           text,
  icon                   text default '🧠',
  cover_url              text,
  background_color      text default '#0A6CFF',
  background_logo       text,
  source_id              uuid references sources on delete set null,
  subject_id             uuid references subjects on delete set null,
  generation_mode       text not null default 'manual', -- manual | ai
  prompt                 text,
  question_count         int not null default 0,
  per_question_seconds  int,
  total_seconds          int,
  shuffle_questions     boolean not null default true,
  shuffle_options       boolean not null default true,
  published              boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint quiz_title_length check (char_length(title) between 1 and 15),
  constraint quiz_description_length check (description is null or char_length(description) <= 50),
  constraint quiz_generation_mode check (generation_mode in ('manual','ai')),
  constraint quiz_question_seconds check (per_question_seconds is null or per_question_seconds between 5 and 3600),
  constraint quiz_total_seconds check (total_seconds is null or total_seconds between 10 and 86400)
);
create index if not exists quizzes_user_updated_idx on quizzes(user_id, updated_at desc);

create table if not exists quiz_questions (
  id             uuid primary key default gen_random_uuid(),
  quiz_id        uuid not null references quizzes on delete cascade,
  user_id        uuid not null references profiles on delete cascade,
  position       int not null,
  question       text not null,
  explanation    text,
  media_url      text,
  options        jsonb not null default '[]'::jsonb,
  correct_index  int not null,
  points         int not null default 1,
  created_at     timestamptz not null default now(),
  unique(quiz_id, position),
  constraint quiz_options_array check (jsonb_typeof(options) = 'array'),
  constraint quiz_correct_index check (correct_index >= 0)
);
create index if not exists quiz_questions_quiz_idx on quiz_questions(quiz_id, position);

create table if not exists quiz_attempts (
  id                uuid primary key default gen_random_uuid(),
  quiz_id           uuid not null references quizzes on delete cascade,
  user_id           uuid not null references profiles on delete cascade,
  started_at        timestamptz not null default now(),
  completed_at      timestamptz,
  score             int not null default 0,
  max_score         int not null default 0,
  correct_count     int not null default 0,
  wrong_count       int not null default 0,
  unanswered_count  int not null default 0,
  duration_seconds  int,
  question_order    jsonb not null default '[]'::jsonb
);
create index if not exists quiz_attempts_user_idx on quiz_attempts(user_id, started_at desc);
create index if not exists quiz_attempts_quiz_idx on quiz_attempts(quiz_id, started_at desc);

create table if not exists quiz_answers (
  id               uuid primary key default gen_random_uuid(),
  attempt_id       uuid not null references quiz_attempts on delete cascade,
  question_id      uuid not null references quiz_questions on delete cascade,
  user_id          uuid not null references profiles on delete cascade,
  selected_index   int,
  is_correct       boolean not null default false,
  timed_out        boolean not null default false,
  elapsed_seconds  int,
  created_at       timestamptz not null default now(),
  unique(attempt_id, question_id)
);
create index if not exists quiz_answers_attempt_idx on quiz_answers(attempt_id);

alter table quizzes        enable row level security;
alter table quiz_questions enable row level security;
alter table quiz_attempts  enable row level security;
alter table quiz_answers   enable row level security;

drop policy if exists owner_all on quizzes;
create policy owner_all on quizzes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists owner_all on quiz_questions;
create policy owner_all on quiz_questions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists owner_all on quiz_attempts;
create policy owner_all on quiz_attempts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists owner_all on quiz_answers;
create policy owner_all on quiz_answers for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Keep the migration standalone if an older environment missed the helper.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists quizzes_touch on quizzes;
create trigger quizzes_touch before update on quizzes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 4. PRIVATE BACKGROUND/COVER STORAGE
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'veltrix-media', 'veltrix-media', false, 20971520,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path convention: {user_id}/backgrounds/... or {user_id}/quiz-covers/...
drop policy if exists veltrix_media_owner_read on storage.objects;
create policy veltrix_media_owner_read on storage.objects for select
  using (bucket_id = 'veltrix-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists veltrix_media_owner_write on storage.objects;
create policy veltrix_media_owner_write on storage.objects for insert
  with check (bucket_id = 'veltrix-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists veltrix_media_owner_update on storage.objects;
create policy veltrix_media_owner_update on storage.objects for update
  using (bucket_id = 'veltrix-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'veltrix-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists veltrix_media_owner_delete on storage.objects;
create policy veltrix_media_owner_delete on storage.objects for delete
  using (bucket_id = 'veltrix-media' and (storage.foldername(name))[1] = auth.uid()::text);
