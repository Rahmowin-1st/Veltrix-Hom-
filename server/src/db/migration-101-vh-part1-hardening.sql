-- Veltrix Hom Backend Part 1 hardening migration.
-- Additive and safe for the already-applied migration-100 foundation.

alter table public.vh_profiles
  add column if not exists onboarding_state text not null default 'NEW',
  add column if not exists class_step_skipped boolean not null default false,
  add column if not exists avatar_step_skipped boolean not null default false,
  add column if not exists identity_revision bigint not null default 1,
  add column if not exists crop_rotation_degrees numeric(8,3);

do $$ begin
  alter table public.vh_profiles add constraint vh_profiles_onboarding_state_check
    check (onboarding_state in ('NEW','PROFILE_STARTED','COMPLETED'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.vh_profiles add constraint vh_profiles_crop_rotation_check
    check (crop_rotation_degrees is null or (crop_rotation_degrees >= -360 and crop_rotation_degrees <= 360));
exception when duplicate_object then null; end $$;

create table if not exists public.vh_quota_policies (
  policy_key text primary key,
  hard_bytes bigint,
  warning_bytes bigint,
  max_items integer,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  check (hard_bytes is null or hard_bytes >= 0),
  check (warning_bytes is null or warning_bytes >= 0),
  check (max_items is null or max_items >= 0)
);
alter table public.vh_quota_policies enable row level security;

insert into public.vh_quota_policies(policy_key, hard_bytes, warning_bytes, max_items, config)
values
  ('library.storage',1073741824,943718400,null,'{}'::jsonb),
  ('project.references',52428800,null,20,'{}'::jsonb),
  ('conversation.reference',20971520,null,1,'{}'::jsonb),
  ('conversation.message_attachments',10485760,null,5,'{}'::jsonb),
  ('fast_ask.attachments',10485760,null,5,'{}'::jsonb),
  ('studio.custom_attachments',20971520,null,5,'{}'::jsonb),
  ('notebook.plan',null,null,null,'{"planConfigurable":true}'::jsonb)
on conflict (policy_key) do update set
  hard_bytes = excluded.hard_bytes,
  warning_bytes = excluded.warning_bytes,
  max_items = excluded.max_items,
  config = excluded.config,
  updated_at = now();

create table if not exists public.vh_quota_overrides (
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  policy_key text not null references public.vh_quota_policies(policy_key) on delete cascade,
  hard_bytes bigint,
  warning_bytes bigint,
  max_items integer,
  config jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (account_id, policy_key),
  check (hard_bytes is null or hard_bytes >= 0),
  check (warning_bytes is null or warning_bytes >= 0),
  check (max_items is null or max_items >= 0)
);
alter table public.vh_quota_overrides enable row level security;

alter table public.vh_jobs
  add column if not exists input_ref text,
  add column if not exists progress numeric(6,5),
  add column if not exists idempotency_key text,
  add column if not exists started_at timestamptz,
  add column if not exists safe_error_message text,
  add column if not exists result_ref text,
  add column if not exists provenance jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.vh_jobs add constraint vh_jobs_progress_check
    check (progress is null or (progress >= 0 and progress <= 1));
exception when duplicate_object then null; end $$;
create unique index if not exists vh_jobs_idempotency_unique
  on public.vh_jobs(account_id, kind, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.vh_audit_events (
  id bigint generated always as identity primary key,
  account_id uuid references public.vh_accounts(id) on delete set null,
  event_type text not null,
  outcome text not null check (outcome in ('success','failure','denied','info')),
  request_id text,
  object_type text,
  object_id text,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists vh_audit_events_account_created_idx on public.vh_audit_events(account_id, created_at desc);
create index if not exists vh_audit_events_type_created_idx on public.vh_audit_events(event_type, created_at desc);
alter table public.vh_audit_events enable row level security;

create table if not exists public.vh_notification_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  dismissed_at timestamptz
);
create unique index if not exists vh_notification_events_dedupe_unique
  on public.vh_notification_events(account_id, dedupe_key)
  where dedupe_key is not null;
create index if not exists vh_notification_events_account_created_idx on public.vh_notification_events(account_id, created_at desc);
alter table public.vh_notification_events enable row level security;

-- Canonical tables remain service-only. No anon/authenticated policies are added.
