-- =====================================================================
-- VELTRIX HOM — migration-013  (V16 Settings)
--
-- Additive and idempotent. Applied AFTER 011/012. No table is dropped,
-- no row is rewritten, and running it twice is a no-op.
--
-- Why this is required: the Settings screen exposes AI preferences that
-- must survive a reload and must reach the server so they can actually
-- shape the answer. `user_settings` already carries answer_length,
-- source_only, citation_required, show_formulas, voice_*, haptics,
-- performance_mode and default_skill_id — those are reused untouched.
-- The columns below are the ones with no existing home.
-- =====================================================================

-- ---- AI javoblari -----------------------------------------------------
-- How the answer is shaped (prose vs sections vs deep vs terse).
alter table public.user_settings add column if not exists answer_style text not null default 'plain'
  check (answer_style in ('plain','structured','detailed','concise'));

-- How a problem is worked through. Distinct from answer_style: a
-- step-by-step solution can still be written as plain prose.
alter table public.user_settings add column if not exists solution_style text not null default 'steps'
  check (solution_style in ('steps','final','hint_first','both'));

-- 0 = few worked examples, 1 = some, 2 = many.
alter table public.user_settings add column if not exists example_count int not null default 1
  check (example_count between 0 and 2);

-- Source adherence. Kept separate from the existing boolean `source_only`
-- so that flag keeps its current meaning for existing code paths.
alter table public.user_settings add column if not exists source_strictness text not null default 'flexible'
  check (source_strictness in ('flexible','strict','allow_general'));

alter table public.user_settings add column if not exists markdown_format boolean not null default true;
alter table public.user_settings add column if not exists include_examples boolean not null default true;

-- ---- Ta'lim -----------------------------------------------------------
-- Conceptual depth, which is NOT the same as answer length: a short answer
-- can still be conceptually deep.
alter table public.user_settings add column if not exists explanation_depth text not null default 'standard'
  check (explanation_depth in ('simple','standard','deep'));

-- ---- Personalizatsiya / O'qish uslubi ---------------------------------
alter table public.user_settings add column if not exists address_name text;
alter table public.user_settings add column if not exists custom_instructions text;
alter table public.user_settings add column if not exists learning_style text not null default 'balanced'
  check (learning_style in ('visual','example_first','theory_first','step_by_step','guided','balanced'));

-- ---- Til / Bildirishnomalar ------------------------------------------
-- Answer language is separate from interface language: a user may read the
-- interface in Uzbek but want explanations in English.
alter table public.user_settings add column if not exists ai_language text not null default 'auto';
alter table public.user_settings add column if not exists notifications_enabled boolean not null default false;

-- =====================================================================
-- migration-013 complete.
-- =====================================================================
