-- =====================================================================
-- VELTRIX HOM — migration 004
-- Settings the redesigned drawer exposes. Additive and idempotent.
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================================

alter table user_settings add column if not exists voice_name    text;
alter table user_settings add column if not exists high_contrast boolean default false;
alter table user_settings add column if not exists haptics       boolean default true;
alter table user_settings add column if not exists sound_on_done boolean default false;
alter table user_settings add column if not exists cache_enabled boolean default true;

-- Older rows get the same defaults as new ones, so the UI never sees null.
update user_settings set
  high_contrast = coalesce(high_contrast, false),
  haptics       = coalesce(haptics, true),
  sound_on_done = coalesce(sound_on_done, false),
  cache_enabled = coalesce(cache_enabled, true)
where high_contrast is null
   or haptics is null
   or sound_on_done is null
   or cache_enabled is null;
