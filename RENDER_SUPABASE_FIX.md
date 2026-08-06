# Render / Supabase fix

This build fixes the repeating worker log:

```text
[worker] claim failed Unregistered API key
```

## Code fixes included

- added an opaque-key compatibility transport for modern `sb_secret_*` keys,
  while preserving real user JWT authorization;
- accepts `SUPABASE_SECRET_KEY` (preferred) or legacy
  `SUPABASE_SERVICE_ROLE_KEY`;
- trims accidental spaces and wrapping quotes in Render variables;
- rejects publishable/anon keys when used as the backend admin key;
- checks legacy JWT project ref against `SUPABASE_URL`;
- adds `GET /health/dependencies` with safe diagnostics;
- backs off configuration failures for five minutes instead of flooding logs;
- includes corrected migration-010 and migration-011 in both project root and
  `server/src/db`.

## Required Render variables

```env
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
GEMINI_API_KEY=...
CLIENT_ORIGIN=https://YOUR-VERCEL-APP.vercel.app
```

A secret cannot be embedded in a public GitHub ZIP. Add the real value in
Render → Service → Environment, then redeploy.

## Verification

Open:

```text
https://YOUR-RENDER-SERVICE.onrender.com/health/dependencies
```

Expected:

```json
{
  "ok": true,
  "supabase": {
    "ok": true,
    "project_ref": "...",
    "key_kind": "secret"
  }
}
```
