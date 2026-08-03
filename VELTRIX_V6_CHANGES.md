# Veltrix Hom V6 — asosiy o'zgarishlar

## UI va navigatsiya

- Mobil va desktop uchun alohida breakpoint/stable composer qoidalari.
- Ichki textarea/input default border, outline va shadow reset qilindi.
- Grapheme-safe, font-ready typewriter: matn kesilmaydi va bo'sh frame qoldirmaydi.
- Sidebar, bottom sheet, modal va route uchun Back boshqaruvi.
- General rootda ikki marta Back bosib chiqish ogohlantirishi.
- Account-local transient UI holatlari boshqa accountga o'tmaydi.

## Chat va account saqlash

- User va AI xabarlari serverda saqlanadi.
- History account ID bo'yicha Supabase'dan olinadi.
- Akkaunt almashtirilganda eski store/cache holatlari tozalanadi.
- Draftlar chat va account bo'yicha ajratiladi.
- Bir chatga bir nechta manba bog'lash uchun `chat_sources` qo'shildi.

## Manbalar

- Maksimal PDF hajmi: 20 MB.
- Client va serverda PDF magic-byte validatsiyasi.
- Parolli PDF uchun aniq xato.
- Page-aware chunking va query retrieval.
- Sahifa raqami so'ralganda printed-page/yaqin homework page tekshiruvi.
- PDF parser ishlamasa original private PDF multimodal fallback.
- Processing warning, embedding health va qayta ishlash endpointi.
- Source-aware answer cache: boshqa manba javobi qaytib kelmaydi.

## Talent

- UI'da `Skills` nomi `Talent`ga almashtirildi.
- DB jadvali backward compatibility uchun `skills` bo'lib qoladi.
- Subject-bound default Talentlar.
- Custom nom, icon/photo, rang, description, scope va instructions.
- AI refine orqali description'ni aniq system instructionga aylantirish.
- Talent CRUD xatolari endi UI'da yashirilmaydi.

## Personal va asboblar

- Activity darajasi, zebra progress va ko'rsatkichlar.
- Test yaratish/saqlash/yechish, timer, shuffle, confetti va haptics.
- Fan o'yini.
- Lokal, eval ishlatmaydigan kalkulyator.

## Ishonchlilik

- Project CRUD optimistic rollback va aniq error ko'rsatadi.
- Source processing polling cheksiz qolmaydi; uzoq jarayon uchun actionable status beradi.
- `chat_sources` RLS chat, source va user ownership'ini birgalikda tekshiradi.
- Gemini 3.x bilan mos bo'lmagan legacy sampling config olib tashlandi.
