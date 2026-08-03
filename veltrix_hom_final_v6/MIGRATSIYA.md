# Supabase migratsiya

Live bazada migration 001–005 bajarilgan bo'lsa:

1. Supabase Dashboard → SQL Editor → New query.
2. `server/src/db/migration-006.sql` faylini oching.
3. To'liq SQL'ni joylashtirib **Run** bosing.
4. Xato bo'lmasa keyin GitHub/Render/Vercel deploy qiling.

Migration 006:

- manba processing health maydonlarini qo'shadi;
- chat va bir nechta manba orasidagi account-safe bog'lanishni yaratadi;
- `skills` jadvalini buzmasdan Talent maydonlarini qo'shadi;
- mavjud va yangi akkauntlarga default fan Talentlarini seed qiladi.

`schema.sql`ni live bazada qayta ishlatmang. U faqat yangi, bo'sh baza uchun.
