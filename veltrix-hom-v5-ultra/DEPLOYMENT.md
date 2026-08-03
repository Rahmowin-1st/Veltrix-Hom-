# Veltrix Hom V5 — Deploy

## 1. Supabase

Supabase Dashboard → **SQL Editor** da quyidagini ishga tushiring:

```text
server/src/db/migration-005.sql
```

`migration-004.sql` live bazada allaqachon bajarilgan bo‘lsa, uni qayta bajarish shart emas. `005` additive va idempotent: mavjud chat, loyiha, manba va profil ma’lumotlarini o‘chirmaydi.

Migration 005 quyidagilarni qo‘shadi:

- account-synced gradient, fon va animatsiya sozlamalari;
- Personal faollik eventlari va statistik RPC;
- saqlanadigan testlar, savollar, urinishlar va javoblar;
- quiz cover / chat background uchun private `veltrix-media` bucket.

## 2. GitHub

ZIP’ni oching va loyiha rootidagi fayllarni repository’ga push qiling. Quyidagilarni push qilmang:

- `.env`, `.env.local`
- `node_modules/`
- `dist/`

## 3. Render backend

Root directory: `server`

Build command:

```bash
npm ci && npm run build
```

Start command:

```bash
npm start
```

Environment:

```text
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
CLIENT_ORIGIN=https://YOUR-VERCEL-DOMAIN.vercel.app
PORT=8787
```

Bir nechta frontend domen bo‘lsa `CLIENT_ORIGIN`ni vergul bilan ajrating.

Deploydan keyin tekshiring:

```text
https://YOUR-RENDER-DOMAIN/health
```

Javobda `{"ok":true,...}` bo‘lishi kerak.

## 4. Vercel frontend

Framework preset: **Vite**

Build command:

```bash
npm ci && npm run build
```

Output directory:

```text
dist
```

Environment:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=https://YOUR-RENDER-DOMAIN
VITE_GOOGLE_WEB_CLIENT_ID=
```

`VITE_SUPABASE_ANON_KEY`ga hech qachon `service_role` yoki secret key yozmang.

## 5. Tekshiruv tartibi

1. Google/email login.
2. General’da matn va ovoz drafti.
3. `+` orqali fayl + bir nechta manba + skill.
4. Xabar yuborilganda full-screen Chat.
5. Sidebar: history, pin, rename, projectga ko‘chirish.
6. PDF manba: faqat PDF, maksimum 20 MB.
7. Tarjima attachment: maksimum 20 MB.
8. Personal faollik statistikasi.
9. AI va qo‘lda test yaratish, timer, shuffle, saqlash.
10. Appearance: gradient ranglari va custom fon.

## Eslatma

Birinchi backend ishga tushishidan oldin migration 005 bajarilmagan bo‘lsa, Activity va Test endpointlari jadval topilmagani sabab xato beradi.
