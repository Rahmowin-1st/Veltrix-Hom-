# Bazani yangilash

Supabase SQL Editor’da tartib bilan ishga tushiring. Migratsiyalar additive va idempotent.

1. `server/src/db/schema.sql` — asosiy jadvallar, faqat yangi baza uchun
2. `server/src/db/migration-002.sql` — loyihalar, mahkamlash, qidiruv
3. `server/src/db/migration-003.sql` — Skills, manba metadata, tarjima
4. `server/src/db/migration-004.sql` — voice, contrast, haptics, cache sozlamalari
5. `server/src/db/migration-005.sql` — V5 appearance, Personal activity va mega test tizimi

Live bazada 001–004 bajarilgan bo‘lsa, hozir faqat **005**ni run qiling.
