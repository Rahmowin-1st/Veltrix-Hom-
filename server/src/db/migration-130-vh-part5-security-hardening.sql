-- Veltrix Hom Backend Part 5: provider security hardening.
-- Additive only. Preserve the accepted 100-129 schema and service-only API model.

-- The Studio registry is backend-owned metadata. Keep it inaccessible to direct
-- anon/authenticated PostgREST clients while allowing the server service role to read it.
alter table public.vh_studio_artifact_registry enable row level security;
revoke all on table public.vh_studio_artifact_registry from anon, authenticated;
grant select on table public.vh_studio_artifact_registry to service_role;

-- Hashing is an internal helper used by SECURITY DEFINER Studio functions.
-- Pin search_path and remove broad RPC execution from untrusted client roles.
alter function public.vh_part4_sha256(text) set search_path = public, pg_temp;
revoke all on function public.vh_part4_sha256(text) from public, anon, authenticated;
grant execute on function public.vh_part4_sha256(text) to service_role;
