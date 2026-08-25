-- Veltrix Hom Backend Part 1 canonical foundation
-- Additive only: legacy tables are intentionally preserved.

create extension if not exists pgcrypto;

create table if not exists public.vh_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_verified_at timestamptz,
  password_hash text,
  google_subject text,
  legacy_supabase_user_id uuid,
  status text not null default 'active' check (status in ('active','disabled','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists vh_accounts_email_unique on public.vh_accounts (lower(email));
create unique index if not exists vh_accounts_google_subject_unique on public.vh_accounts (google_subject) where google_subject is not null;
create unique index if not exists vh_accounts_legacy_user_unique on public.vh_accounts (legacy_supabase_user_id) where legacy_supabase_user_id is not null;
alter table public.vh_accounts enable row level security;

create table if not exists public.vh_email_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null check (purpose in ('login','create_account','create_password')),
  code_digest text not null,
  expires_at timestamptz not null,
  resend_after timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  request_ip_hash text,
  request_id text
);
create index if not exists vh_email_codes_lookup_idx on public.vh_email_codes (lower(email), purpose, created_at desc);
alter table public.vh_email_codes enable row level security;

create table if not exists public.vh_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  access_digest text not null unique,
  refresh_digest text not null unique,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  rotated_from uuid references public.vh_sessions(id),
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  user_agent_hash text,
  created_at timestamptz not null default now()
);
create index if not exists vh_sessions_account_active_idx on public.vh_sessions (account_id, refresh_expires_at desc) where revoked_at is null;
alter table public.vh_sessions enable row level security;

create table if not exists public.vh_storage_objects (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  bucket text not null,
  object_path text not null,
  kind text not null check (kind in ('library','profile_photo','studio','other')),
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  state text not null default 'pending' check (state in ('pending','ready','failed','trashed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  trashed_at timestamptz,
  purge_after timestamptz,
  unique(bucket, object_path)
);
create index if not exists vh_storage_objects_owner_idx on public.vh_storage_objects (account_id, state, created_at desc);
create index if not exists vh_storage_objects_purge_idx on public.vh_storage_objects (purge_after) where state = 'trashed';
alter table public.vh_storage_objects enable row level security;

create table if not exists public.vh_profiles (
  account_id uuid primary key references public.vh_accounts(id) on delete cascade,
  display_name text,
  class_level text,
  identity_type text not null default 'VELTRIX_AVATAR' check (identity_type in ('VELTRIX_AVATAR','CUSTOM_PHOTO')),
  avatar_id text check (avatar_id is null or avatar_id in ('crocodile','wolf','fox','elephant','shark','tiger','lion')),
  avatar_headwear text not null default 'default',
  avatar_background text not null default 'default',
  photo_object_id uuid references public.vh_storage_objects(id),
  crop_center_x numeric(6,5),
  crop_center_y numeric(6,5),
  crop_scale numeric(8,4),
  onboarding_completed_at timestamptz,
  language text not null default 'en' check (language = 'en'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (class_level is null or class_level in ('1','2','3','4','5','6','7','8','9','10','11','University','Other')),
  check (crop_center_x is null or (crop_center_x >= 0 and crop_center_x <= 1)),
  check (crop_center_y is null or (crop_center_y >= 0 and crop_center_y <= 1)),
  check (crop_scale is null or crop_scale > 0)
);
alter table public.vh_profiles enable row level security;

create table if not exists public.vh_quota_usage (
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  scope text not null,
  bytes_used bigint not null default 0 check (bytes_used >= 0),
  bytes_reserved bigint not null default 0 check (bytes_reserved >= 0),
  updated_at timestamptz not null default now(),
  primary key (account_id, scope)
);
alter table public.vh_quota_usage enable row level security;

create table if not exists public.vh_quota_reservations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  scope text not null,
  bytes bigint not null check (bytes > 0),
  status text not null default 'pending' check (status in ('pending','committed','released','expired')),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);
create index if not exists vh_quota_reservations_pending_idx on public.vh_quota_reservations (expires_at) where status = 'pending';
alter table public.vh_quota_reservations enable row level security;

create table if not exists public.vh_idempotency (
  account_id uuid not null references public.vh_accounts(id) on delete cascade,
  route text not null,
  idempotency_key text not null,
  request_hash text not null,
  response_status integer,
  response_body jsonb,
  state text not null default 'started' check (state in ('started','completed','failed')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, route, idempotency_key)
);
alter table public.vh_idempotency enable row level security;

create table if not exists public.vh_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now()
);
alter table public.vh_rate_limits enable row level security;

create table if not exists public.vh_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.vh_accounts(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  state text not null default 'queued' check (state in ('queued','running','retry','succeeded','failed','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 25),
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  checkpoint jsonb,
  result jsonb,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists vh_jobs_claim_idx on public.vh_jobs (state, available_at, created_at) where state in ('queued','retry');
create index if not exists vh_jobs_owner_idx on public.vh_jobs (account_id, created_at desc);
alter table public.vh_jobs enable row level security;

create table if not exists public.vh_ai_circuits (
  provider_id text primary key,
  failure_count integer not null default 0,
  opened_until timestamptz,
  last_error_code text,
  updated_at timestamptz not null default now()
);
alter table public.vh_ai_circuits enable row level security;

-- No direct client policies are created for canonical tables in Part 1.
-- Canonical sessions are opaque server sessions, therefore service-role access
-- is intentionally the only database path. Server code always applies explicit
-- account ownership predicates despite the service role bypassing RLS.

create or replace function public.vh_reserve_quota(
  p_account_id uuid,
  p_scope text,
  p_bytes bigint,
  p_hard_limit bigint
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_used bigint;
  v_reserved bigint;
begin
  if p_bytes <= 0 or p_hard_limit <= 0 then
    raise exception 'invalid_quota_request' using errcode = '22023';
  end if;

  insert into public.vh_quota_usage(account_id, scope)
  values (p_account_id, p_scope)
  on conflict (account_id, scope) do nothing;

  select bytes_used, bytes_reserved into v_used, v_reserved
  from public.vh_quota_usage
  where account_id = p_account_id and scope = p_scope
  for update;

  if v_used + v_reserved + p_bytes > p_hard_limit then
    raise exception 'quota_exceeded' using errcode = 'P0001';
  end if;

  update public.vh_quota_usage
  set bytes_reserved = bytes_reserved + p_bytes, updated_at = now()
  where account_id = p_account_id and scope = p_scope;

  insert into public.vh_quota_reservations(account_id, scope, bytes)
  values (p_account_id, p_scope, p_bytes)
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.vh_reserve_quota(uuid,text,bigint,bigint) from public, anon, authenticated;
grant execute on function public.vh_reserve_quota(uuid,text,bigint,bigint) to service_role;

create or replace function public.vh_finalize_quota_reservation(
  p_reservation_id uuid,
  p_commit boolean
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.vh_quota_reservations%rowtype;
begin
  select * into v_row from public.vh_quota_reservations where id = p_reservation_id for update;
  if not found or v_row.status <> 'pending' then return false; end if;

  update public.vh_quota_usage
  set bytes_reserved = greatest(0, bytes_reserved - v_row.bytes),
      bytes_used = bytes_used + case when p_commit then v_row.bytes else 0 end,
      updated_at = now()
  where account_id = v_row.account_id and scope = v_row.scope;

  update public.vh_quota_reservations
  set status = case when p_commit then 'committed' else 'released' end,
      finalized_at = now()
  where id = p_reservation_id;
  return true;
end;
$$;
revoke all on function public.vh_finalize_quota_reservation(uuid,boolean) from public, anon, authenticated;
grant execute on function public.vh_finalize_quota_reservation(uuid,boolean) to service_role;

create or replace function public.vh_consume_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
) returns table(allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_count integer;
  v_start timestamptz;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'invalid_rate_limit' using errcode = '22023';
  end if;

  insert into public.vh_rate_limits(bucket_key, window_started_at, count)
  values (p_bucket_key, v_now, 0)
  on conflict (bucket_key) do nothing;

  select count, window_started_at into v_count, v_start
  from public.vh_rate_limits where bucket_key = p_bucket_key for update;

  if v_start + make_interval(secs => p_window_seconds) <= v_now then
    v_start := v_now;
    v_count := 0;
  end if;

  if v_count >= p_limit then
    allowed := false;
    remaining := 0;
    retry_after_seconds := greatest(1, ceil(extract(epoch from ((v_start + make_interval(secs => p_window_seconds)) - v_now)))::integer);
  else
    v_count := v_count + 1;
    update public.vh_rate_limits
      set count = v_count, window_started_at = v_start, updated_at = v_now
      where bucket_key = p_bucket_key;
    allowed := true;
    remaining := greatest(0, p_limit - v_count);
    retry_after_seconds := 0;
  end if;
  return next;
end;
$$;
revoke all on function public.vh_consume_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.vh_consume_rate_limit(text,integer,integer) to service_role;

create or replace function public.vh_claim_job(
  p_worker_id text,
  p_lease_seconds integer default 60
) returns setof public.vh_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  select id into v_id
  from public.vh_jobs
  where state in ('queued','retry')
    and available_at <= now()
    and (lease_expires_at is null or lease_expires_at <= now())
  order by available_at, created_at
  for update skip locked
  limit 1;

  if v_id is null then return; end if;

  update public.vh_jobs
    set state = 'running',
        attempts = attempts + 1,
        lease_owner = p_worker_id,
        lease_expires_at = now() + make_interval(secs => greatest(10,p_lease_seconds)),
        updated_at = now()
  where id = v_id;

  return query select * from public.vh_jobs where id = v_id;
end;
$$;
revoke all on function public.vh_claim_job(text,integer) from public, anon, authenticated;
grant execute on function public.vh_claim_job(text,integer) to service_role;

insert into storage.buckets(id, name, public, file_size_limit)
values
  ('vh-library','vh-library',false,null),
  ('vh-profile','vh-profile',false,20971520),
  ('vh-studio','vh-studio',false,20971520)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;
