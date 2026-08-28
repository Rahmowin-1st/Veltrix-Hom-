-- Veltrix Hom Backend Part 5: function search_path hardening.
-- Pin all known helper functions when present. Some are legacy-only and therefore
-- intentionally absent on a fresh 100+ schema.

do $$
declare
  r record;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'match_source_chunks',
        'match_answer_cache',
        'search_chats',
        'touch_updated_at',
        'vh_memory_canonical_key',
        'vh_part4_jsonb_index_text'
      )
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.oid::regprocedure);
  end loop;
end
$$;
