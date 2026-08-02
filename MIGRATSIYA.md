# Bazani yangilash

SQL Editor'da **tartib bilan** ishga tushiring. Har biri idempotent —
qayta ishga tushirish xavfsiz, mavjud ma'lumot o'zgarmaydi.

1. `server/src/db/schema.sql` — asosiy jadvallar (faqat birinchi marta)
2. `server/src/db/migration-002.sql` — loyihalar, mahkamlash, qidiruv
3. `server/src/db/migration-003.sql` — Skills, manba metadata, tarjima
4. `server/src/db/migration-004.sql` — yangi sozlamalar ustunlari ← **YANGI**

Agar 2 va 3 ni oldin ishga tushirgan bo'lsangiz, faqat **004** kerak.
