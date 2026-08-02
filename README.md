# Veltrix Hom

**Homework. Aniq. Source bilan.**

AI homework workspace for Uzbek students. Mobile-first PWA + Play Store app.
Every answer names the subject, opens the source, and cites the page — or
says it doesn't know. Zero hallucination policy.

---

## What is built (Phase 1)

| Area | Status |
|---|---|
| Repo scaffold, TypeScript strict, no `any` | ✅ |
| Design tokens — exact spec colors, glass rules, perf mode | ✅ |
| Veltrix Ignition entry animation (6 phases, 4 variants, tap-to-skip) | ✅ |
| App shell — glass header, 3-tab nav, route code-splitting | ✅ |
| Google Sign-In + email/password (real Supabase Auth, no mocks) | ✅ |
| Full Postgres schema — pgvector, RLS on every table, signup trigger | ✅ |
| Hybrid RAG search RPC (vector + trigram, RRF fusion) | ✅ |
| Semantic answer cache RPC | ✅ |
| Server core — queue, exponential backoff, model fallback, quota tracking | ✅ |
| PWA manifest + service worker | ✅ |
| Chat / Personal / Settings / Sources / Onboarding screens | ⏳ Phase 2 |
| PDF → OCR → embedding pipeline | ⏳ Phase 2 |
| AI answer blocks, streaming, citations | ⏳ Phase 2 |

---

## Model registry — read this before changing anything

Verified against `ai.google.dev` on **2026-08-02**. The original spec's
models are dead or dying:

| Spec | Reality | Now used |
|---|---|---|
| `gemini-embedding-001` | shut down 2026-07-14 | `gemini-embedding-2` |
| `gemini-2.5-flash` | 2.5 family shuts down Oct 2026 | `gemini-3.6-flash` |
| `gemini-2.5-flash-lite` | same | `gemini-3.5-flash-lite` |

All model IDs live in **one place**: `server/src/config.ts` → `MODELS`.

Two behaviour changes came with `gemini-embedding-2`:
- No `task_type` parameter — the task is now a **text prefix** (`embedQuery` / `embedDocument`).
- Multiple strings in one call return **one aggregated vector**; each input must be its own `Content` object.
- Truncated dimensions are auto-normalized, so `vector(768)` needs no manual normalization.

---

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. **SQL Editor → New query** → paste all of `server/src/db/schema.sql` → **Run**.
   Creates every table, index, RLS policy, the signup trigger, the search RPCs
   and the private `sources` storage bucket.
3. **Authentication → Providers → Google** → enable.
4. Copy the callback URL it shows you:
   `https://<PROJECT_REF>.supabase.co/auth/v1/callback`

### 2. Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services → Credentials**
2. **Create Credentials → OAuth client ID → Web application**
3. Authorized redirect URIs:
   - `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
   - `http://localhost:5173/auth/callback`
   - `https://<your-domain>/auth/callback`
4. Paste the Client ID + Secret back into Supabase's Google provider.

### 3. Gemini key

[aistudio.google.com/apikey](https://aistudio.google.com/apikey) → create key.

### 4. Environment

```bash
cp client/.env.example client/.env    # public values only
cp server/.env.example server/.env    # secrets — never commit
```

`SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. It belongs on the server and
nowhere else. If it ever reaches the browser, every user's data is exposed.

### 5. Run

```bash
cd server && npm install && npm run dev   # → :8787
cd client && npm install && npm run dev   # → :5173
```

---

## Deploy

**Client → Netlify or Vercel.** Build `npm run build`, publish `client/dist`.
Add the three `VITE_*` variables in the dashboard.

**Server → Render or Railway (free tier).** Build `npm run build`,
start `npm start`. Add all five secrets.

> Not serverless, deliberately. A 300-page PDF takes minutes to extract, OCR
> and embed, and SSE streaming needs a long-lived connection. Vercel/Netlify
> functions time out at 10–60s and would break both.

Set `CLIENT_ORIGIN` on the server to your deployed client URL.

---

---

## Native Android app (Capacitor — not a TWA)

The app ships as a **real native Android package**, not a browser wrapper.
The React build runs in a native WebView with direct access to the OS.

Why this matters over a TWA:

| | TWA | Capacitor (this build) |
|---|---|---|
| Google Sign-In | browser redirect, URL bar flashes | native Play Services account picker |
| Camera (Snap & Solve) | web `getUserMedia` only | native camera, edit + crop, orientation fix |
| Back button | browser history | app-controlled, exits only at root |
| Keyboard | composer can be covered | `adjustResize` + measured keyboard height |
| Haptics / status bar / share | none | native |
| Offline files | Cache API only | native filesystem |

### Package identity

- App ID: `uz.veltrix.hom`
- minSdk 24 · targetSdk 36 · portrait only
- Permissions: internet, network state, camera, media images, microphone, vibrate
- Camera declared `required="false"` so the app still installs on devices without one
- Deep link: `uz.veltrix.hom://auth/callback` for email confirmation

### Google Sign-In on native

Native sign-in does **not** use a redirect. The Play Services dialog returns an
**ID token**, which is exchanged via `supabase.auth.signInWithIdToken()`.

In Google Cloud Console you need **two** OAuth client IDs:

1. **Web application** — its client ID goes into `VITE_GOOGLE_WEB_CLIENT_ID`
   *and* into Supabase's Google provider. This is the audience of the ID token.
2. **Android** — package name `uz.veltrix.hom` plus the SHA-1 of your signing
   key. This one is never referenced in code; Google uses it to trust the app.

Get the SHA-1 of your release key:

```bash
keytool -list -v -keystore veltrix-release.jks -alias veltrix
```

### Build commands

```bash
npm run android:dev       # build + sync + run on a connected device
npm run cap:open          # open the project in Android Studio
npm run android:release   # produces android/app/build/outputs/bundle/release/*.aab
```

`android:release` needs a signing key configured in `android/app/build.gradle`.
Create one once:

```bash
keytool -genkey -v -keystore veltrix-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias veltrix
```

Keep that `.jks` file and its password safe and out of git. Lose it and you can
never update the app on Play Store under the same listing.

### Play Store checklist

- [ ] Play Console developer account ($25, one-time)
- [ ] Release keystore created and backed up
- [ ] Android OAuth client registered with the release SHA-1
- [ ] Privacy policy URL (required — the app handles student data)
- [ ] Data safety form: declare camera, photos, email
- [ ] Content rating questionnaire
- [ ] AI-generated content declaration
- [ ] Icon 512×512, feature graphic 1024×500, 2+ phone screenshots
- [ ] `versionCode` incremented for every upload

The web build stays live too — same codebase, same Supabase project, same
account. `Capacitor.isNativePlatform()` picks the right path at runtime.

---

## Non-negotiables

1. No mock data anywhere. Real auth, real DB, real AI.
2. Design tokens are fixed. Colors, sizes and timings stay exactly as specified.
3. Gradient appears in **4 places only**: primary CTA, logo, active source
   banner, AI answer left glow line. Never a full-screen gradient.
4. TypeScript strict. No `any`.
5. Secrets never touch the client bundle.
6. Interface text is 100% Uzbek (Latin).
7. No white screens — skeleton or empty state, always.
8. Every error is understandable Uzbek, and says what to do next.
