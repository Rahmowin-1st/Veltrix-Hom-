-- =====================================================================
-- VELTRIX HOM — migration-014  (V17 Accent-tinted background)
--
-- Additive and idempotent. Applied AFTER 013. No table is dropped and no
-- existing row is rewritten, so running it twice is a no-op.
--
-- Why it is required: until now the page background came from
-- chat_gradient_from / chat_gradient_to, which are stored per account and
-- default to a near-white pair. Changing the accent colour therefore left
-- the background white. These two columns let the background be DERIVED
-- from the accent instead, with the user controlling how strong that tint
-- is — and still allow a fully custom gradient or an image for anyone who
-- wants one.
-- =====================================================================

-- How the page background is produced.
--   accent : derived from accent_color (default, and what V17 introduces)
--   custom : the existing chat_gradient_from / chat_gradient_to pair
--   image  : chat_background_url
alter table public.user_settings add column if not exists bg_style text not null default 'accent'
  check (bg_style in ('accent', 'custom', 'image'));

-- Strength of the accent wash, 0..100. 0 is a neutral near-white page;
-- 100 is a strongly tinted one. The default is deliberately non-zero so the
-- background visibly follows the accent out of the box, which is the whole
-- point of this migration.
alter table public.user_settings add column if not exists bg_tint int not null default 55
  check (bg_tint between 0 and 100);

-- Existing accounts still carry the old near-white gradient pair. Leaving
-- them on 'custom' would mean nobody ever sees the new behaviour, so accounts
-- that never customised their gradient are moved to the derived mode. Anyone
-- who DID pick their own colours keeps them.
update public.user_settings
   set bg_style = 'custom'
 where bg_style = 'accent'
   and chat_gradient_from is not null
   and chat_gradient_to is not null
   and upper(chat_gradient_from) not in ('#EEF5FF', '#EDF5FF')
   and upper(chat_gradient_to) not in ('#FFFFFF', '#FFF');

-- =====================================================================
-- migration-014 complete.
-- =====================================================================
