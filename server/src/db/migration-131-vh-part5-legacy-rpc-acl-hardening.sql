-- Veltrix Hom Backend Part 5: legacy SECURITY DEFINER RPC ACL hardening.
-- Preserve trigger/backend execution while removing direct untrusted PostgREST execution.

revoke all on function public.get_activity_summary(uuid) from public, anon, authenticated;
grant execute on function public.get_activity_summary(uuid) to service_role;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

revoke all on function public.seed_veltrix_talents_after_profile() from public, anon, authenticated;
grant execute on function public.seed_veltrix_talents_after_profile() to service_role;
