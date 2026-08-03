# Veltrix Hom

AI uy vazifa yordamchisi — darslik PDF'idan javob beradigan, tarjima
qiladigan va loyihalar bo'yicha ishlaydigan mobil-birinchi ilova.

## Stack

- **Client** — React 18 + Vite + TypeScript (strict) + Framer Motion + Capacitor
- **Server** — Express + TypeScript + Gemini + Supabase
- **DB** — Supabase Postgres + pgvector + RLS

## Ishga tushirish

```bash
# server
cd server && npm i && npm run dev

# client
cd client && npm i && npm run dev
```

## Migratsiyalar

Supabase SQL Editor'da **tartib bilan**:

1. `server/src/db/schema.sql` — asosiy jadvallar (bir marta)
2. `server/src/db/migration-002.sql` — loyihalar, mahkamlash, qidiruv
3. `server/src/db/migration-003.sql` — Skills, manba metadata, tarjima
4. `server/src/db/migration-004.sql` — voice va device sozlamalari
5. `server/src/db/migration-005.sql` — V5 appearance, activity va test tizimi

Hammasi additive/idempotent — mavjud account ma’lumotlari o‘chirilmaydi.

## Muhit o'zgaruvchilari

**Client** (`.env`)
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=
VITE_GOOGLE_WEB_CLIENT_ID=
```

**Server** (`.env`)
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
CLIENT_ORIGIN=
PORT=8787
```

## Real limitlar

| Narsa | Limit | Sababi |
|---|---|---|
| PDF hajmi | 20 MB | Supabase Storage bepul tarif |
| Tarjima fayli | 20 MB | mobil upload va server validatsiyasi |
| So'rov tezligi | 30/daqiqa | Server rate limit |
| Kesh muddati | 7 kun | IndexedDB chat tarixi |

## Qo'llab-quvvatlanmaydigan narsalar

Ataylab qo'shilmagan, chunki haqiqiy amalga oshirish yo'q:

- **HEIC** — brauzerda xavfsiz konverter yo'q; aniq xato xabari ko'rsatiladi
- **DOCX tarjima** — parser yo'q
- **Model tanlash** — faqat Gemini sozlangan; soxta tanlov qo'shilmagan
- **Hisobni o'chirish** — backend endpoint yo'q
