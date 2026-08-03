# Veltrix Hom V6 — Deploy

## 1. Supabase

Live bazada 001–005 bajarilgan bo'lsa, SQL Editor'da faqat:

```text
server/src/db/migration-006.sql
```

ni Run qiling.

## 2. GitHub

ZIP ichidagi loyiha root fayllarini repository'ga push qiling.

Push qilmang:

- `.env`, `.env.local`, `.env.*.local`
- `node_modules/`
- `dist/`
- `.git/`
- haqiqiy API kalitlari

## 3. Render backend

- Root Directory: `server`
- Build Command: `npm ci && npm run build`
- Start Command: `npm start`
- Health Check Path: `/health`

Environment:

```env
SUPABASE_URL=https://jqpeohbbbmnoujxaiutr.supabase.co
SUPABASE_ANON_KEY=sb_publishable_lEmDIyHVhrtc5pnl98mkjA_yHsYx7ry
SUPABASE_SERVICE_ROLE_KEY=<Render'da allaqachon bor>
GEMINI_API_KEY=<Render'da allaqachon bor>
CLIENT_ORIGIN=https://veltrix-hom-lac.vercel.app,http://localhost:5173
PORT=8787
```

Deploy tugagach tekshiring:

```text
https://veltrix-hom-server.onrender.com/health
```

## 4. Vercel frontend

- Framework Preset: Vite
- Root Directory: repository root
- Build Command: `npm ci && npm run build`
- Output Directory: `dist`

Environment:

```env
VITE_SUPABASE_URL=https://jqpeohbbbmnoujxaiutr.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_lEmDIyHVhrtc5pnl98mkjA_yHsYx7ry
VITE_API_URL=https://veltrix-hom-server.onrender.com
VITE_GOOGLE_WEB_CLIENT_ID=134258068461-juhu2o7uh49utuiha9kkvkc9n0g9v2ce.apps.googleusercontent.com
```

Vercel'da `VITE_SUPABASE_ANON_KEY`ga faqat public anon key kiriting. `service_role` serverda qoladi.

## 5. Deploydan keyingi majburiy test

1. Akkaunt A'da chat oching, user xabari va AI javobini kuting.
2. Akkaunt B'ga o'ting: A tarixi ko'rinmasligi kerak.
3. Boshqa qurilmada A bilan kiring: user va AI xabarlari ko'rinishi kerak.
4. General'dagi yozilmagan draft logout/login va app restartdan keyin o'sha akkauntda tiklanishi kerak.
5. Sidebarni ochib Back bosing: sidebar yopilishi kerak.
6. Personal/Settings/Mode'ga o'tib Back bosing: oldingi route qaytishi kerak.
7. General rootda Back bosing: `Chiqish uchun yana bir marta bosing` chiqishi kerak.
8. Typewriter matni kesilmasligi, layoutni siljitmasligi va bo'sh qolmasligi kerak.
9. Composer fokusida ichki qora border/outline chiqmasligi kerak.
10. 20 MB'dan katta yoki haqiqiy PDF bo'lmagan fayl aniq rad etilishi kerak.
11. Tayyor manbani chatga ulang va `256-betdagi uyga vazifani bajar` kabi so'rov yuboring.
12. Oldingi processing xatosi bo'lgan manbada `Qayta ishlash`ni bosing.
13. Default Talentni chatga ulang; custom Talent yarating va AI refine qiling.
14. Kalkulyator oddiy amallar, qavs, ildiz, foiz/modulo va memory tugmalarida ishlashi kerak.

## 6. Manba xatosini tiklash

- `Manbalar` sahifasini oching.
- Xato kartasida `Qayta ishlash`ni bosing.
- Status `Tayyor` bo'lgach General → `+` → `Manba` orqali tanlang.
- Skanerlangan PDF'da text layer topilmasa server original private PDF'ni Gemini'ga to'g'ridan-to'g'ri uzatadi.
