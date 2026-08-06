# Veltrix Hom V6

Mobil-birinchi AI uy vazifa platformasi: account-synced chatlar, manba PDF'lari, Talent, tarjima, Personal faollik, test va lokal kalkulyator.

## Tuzilma

- Frontend loyiha rootida: React 18, Vite, TypeScript, Framer Motion, Capacitor.
- Backend `server/` ichida: Express, TypeScript, Gemini, Supabase.
- Ma'lumotlar: Supabase Postgres, Storage, pgvector va RLS.

## Lokal ishga tushirish

Frontend:

```bash
npm ci
npm run dev
```

Backend — alohida terminalda:

```bash
cd server
npm ci
npm run dev
```

Frontend rootida `client/` papkasi yo'q.

## Migratsiyalar

Yangi, bo'sh baza uchun avval `server/src/db/schema.sql`, keyin migration fayllari tartib bilan bajariladi.

Live bazada migration 001–005 allaqachon bajarilgan bo'lsa, faqat:

```text
server/src/db/migration-006.sql
```

Migration 006 account-safe chat–manba bog'lanishi, manba recovery holatlari va Talent tizimini qo'shadi. U additive va idempotent.

## Environment variables

Frontend/Vercel:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=
VITE_GOOGLE_WEB_CLIENT_ID=
```

Backend/Render:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
CLIENT_ORIGIN=
PORT=8787
```

Haqiqiy `.env` fayllarini GitHub'ga push qilmang. `service_role` kalitini hech qachon Vercel frontend environment'iga kiritmang.

## Muhim imkoniyatlar

- Chatlar, user va AI xabarlari account bo'yicha Supabase'da saqlanadi.
- Bir akkaunt tarixi boshqa akkauntga chiqmaydi.
- Chat draftlari account bo'yicha ajratiladi.
- Sidebar, route va modal uchun Android/browser Back boshqaruvi mavjud.
- PDF manbalar maksimal 20 MB; magic-byte va server validatsiyasi mavjud.
- Matn ajratish ishlamasa original private PDF multimodal fallback sifatida ishlatiladi.
- Skills mahsulotda `Talent` deb ataladi; DB jadvali backward compatibility uchun `skills` bo'lib qoladi.
- Kalkulyator lokal parser bilan ishlaydi va AI so'rovi yubormaydi.

## Build

Frontend:

```bash
npm ci && npm run build
```

Backend:

```bash
cd server
npm ci && npm run build
```

Deploy tartibi uchun `DEPLOYMENT.md`ni o'qing.
