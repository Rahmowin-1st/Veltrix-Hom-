# Veltrix Hom Backend Part 1 — Canonical Foundation Architecture

Authority: `VELTRIX_HOM_BACKEND_PRODUCT_FREEZE_MASTER_2026-08-25.md` + `01_VELTRIX_HOM_BACKEND_PART1_FOUNDATION_AUTH_CORE.md`.

Base: `Rahmowin-1st/Veltrix-Hom-` `main@0c24752d39290dc4278c197bd557d02fb1e2f36c`.

## Boundary

Part 1 owns foundation/auth/profile/storage quota/AI-router/stream/job/idempotency/rate-limit/trash primitives only. It does not implement Part 2–5 product domains and does not implement frontend/UI.

## Migration strategy

- Preserve existing data and legacy tables in place; no destructive drops in Part 1.
- New canonical foundation objects use the `vh_` prefix so old schemas cannot silently redefine the frozen product.
- New migrations are additive, idempotent where practical, RLS-enabled, owner-scoped, and committed verbatim in the repository.
- Old `subjects`, `skills`, quizzes/game-era semantics are legacy compatibility data only and are not dependencies of `/api/v1`.

## HTTP contract

- Canonical backend prefix: `/api/v1`.
- Machine-readable error envelope: `{ error: { code, message, requestId, details? } }`.
- Legacy `/api/*` routes are not canonical authority. New Part 1 code does not depend on them.

## Identity and sessions

- Canonical `vh_accounts` is independent of old product semantics and may link a prior Supabase Auth user through `legacy_supabase_user_id`.
- Google sign-in verifies a Google ID token server-side, validates audience/issuer/email verification, then finds/creates a canonical account.
- Email/password sign-in first verifies a canonical scrypt credential; if absent, the server may authenticate a legacy Supabase account and migrate/link it without reading its password hash.
- Unknown email + Password never creates an unverified account. It returns a verification-required result; ownership is established through the frozen four-digit Code flow.
- Four-digit codes are generated with a CSPRNG, stored only as keyed digests, short-lived, single-use, cooldown/rate/attempt limited, and never logged.
- Canonical sessions use opaque random access/refresh tokens; only keyed digests are stored. Refresh rotates. Logout revokes.

## Onboarding/profile

- Required name; optional class; avatar/photo identity.
- Exactly seven canonical avatar IDs: crocodile, wolf, fox, elephant, shark, tiger, lion.
- Avatar skip chooses a server-side random canonical avatar.
- Custom photo keeps original private asset reference plus non-destructive crop metadata.
- V1 backend language contract is English only.

## Storage and quotas

- New private storage buckets are isolated from legacy `sources`/`veltrix-media` buckets.
- Every object has an owner-scoped database record and owner-prefixed object path.
- Canonical Library quota is server-authoritative: 1 GiB hard limit, 900 MiB warning threshold.
- Additional frozen surface limits are represented as configurable quota policies; Part 1 does not implement their future domain flows.
- Reservation/finalization is atomic in Postgres to prevent concurrent over-allocation.

## AI router

- Provider registry is interface-based and configured by environment. Provider keys never leave the server.
- A provider/model is enabled only when its required server-side config exists.
- Router supports bounded retry, circuit state, deterministic fallback order, cancellation/timeout, and normalized errors. It never evades provider limits.
- Part 1 proves the router foundation with deterministic adapters; later Parts bind product prompts/tools.

## Streaming

- SSE is the canonical Part 1 streaming transport.
- Events are typed (`start`, `delta`, `meta`, `done`, `error`, `heartbeat`) and include request IDs.
- Disconnect aborts downstream work; heartbeat and no-buffer headers are used.

## Reliability

- Durable job table with lease/checkpoint/retry primitives.
- Idempotency keys are scoped by account + route + key and persist response status/body.
- DB-backed rate-limit primitive is atomic and survives process restart.
- Trash primitives use `trashed_at` + `purge_after`, default 30 days; physical deletion is a later explicit lifecycle action.

## Security invariants

- Service-role credentials remain server-only.
- RLS on every new user-owned table.
- Service-role queries still include explicit account ownership predicates.
- No auth codes, raw session tokens, provider keys, or passwords are logged or persisted plaintext.
- No legacy SECURITY DEFINER function is reused by the canonical foundation.
