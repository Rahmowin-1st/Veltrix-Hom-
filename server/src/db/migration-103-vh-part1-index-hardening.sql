-- Veltrix Hom Backend Part 1 index hardening.
-- Covers canonical foreign-key lookup paths reported by the live Supabase advisor.
-- Additive only; no legacy schema mutation.

create index if not exists vh_profiles_photo_object_idx
  on public.vh_profiles(photo_object_id)
  where photo_object_id is not null;

create index if not exists vh_quota_overrides_policy_key_idx
  on public.vh_quota_overrides(policy_key);

create index if not exists vh_quota_reservations_account_idx
  on public.vh_quota_reservations(account_id, created_at desc);

create index if not exists vh_sessions_rotated_from_idx
  on public.vh_sessions(rotated_from)
  where rotated_from is not null;
