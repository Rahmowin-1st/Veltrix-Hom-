# Veltrix Hom — bazani yangilash

Ikkita SQL fayl bor. **Tartib bilan** ishga tushiring:

1. `server/src/db/migration-002.sql` — loyihalar, mahkamlash, qidiruv
   *(agar oldin ishga tushirgan bo'lsangiz, qayta ishga tushirish xavfsiz)*
2. `server/src/db/migration-003.sql` — Skills, manba metadata, tarjima

Har biri **idempotent** — bir necha marta ishga tushirsangiz ham
mavjud ma'lumot o'zgarmaydi.

## Qanday
Supabase Dashboard → SQL Editor → New query → faylni yopishtiring → Run.
