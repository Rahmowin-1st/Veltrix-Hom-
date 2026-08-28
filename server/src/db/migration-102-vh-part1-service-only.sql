-- Canonical /api/v1 uses opaque server sessions, not direct Supabase client DB access.
-- RLS already denies direct rows, but revoke broad default schema grants as defense in depth.

revoke all on table
  public.vh_accounts,
  public.vh_email_codes,
  public.vh_sessions,
  public.vh_storage_objects,
  public.vh_profiles,
  public.vh_quota_usage,
  public.vh_quota_reservations,
  public.vh_idempotency,
  public.vh_rate_limits,
  public.vh_jobs,
  public.vh_ai_circuits,
  public.vh_quota_policies,
  public.vh_quota_overrides,
  public.vh_audit_events,
  public.vh_notification_events
from anon, authenticated;

grant select, insert, update, delete on table
  public.vh_accounts,
  public.vh_email_codes,
  public.vh_sessions,
  public.vh_storage_objects,
  public.vh_profiles,
  public.vh_quota_usage,
  public.vh_quota_reservations,
  public.vh_idempotency,
  public.vh_rate_limits,
  public.vh_jobs,
  public.vh_ai_circuits,
  public.vh_quota_policies,
  public.vh_quota_overrides,
  public.vh_audit_events,
  public.vh_notification_events
to service_role;

grant usage, select on sequence public.vh_audit_events_id_seq to service_role;
