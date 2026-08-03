# Veltrix Hom V6 — o'zgarishlar

## 1. Ortga qaytish (Back navigation) — to'liq qayta yozildi
- Yangi markazlashgan `src/hooks/useBackNavigation.ts` — butun ilova uchun bitta mantiq.
- Eski, ishlamaydigan `history.pushState` chalkashligi AppShell'dan olib tashlandi.
- Tartib (ChatGPT uslubi):
  1. Ochiq overlay (sidebar/qidiruv/sheet) bo'lsa — avval o'sha yopiladi.
  2. Asosiy sahifada emas — oldingi ekranga qaytadi (`navigate(-1)`).
  3. General (asosiy) sahifada — "Chiqish uchun yana bir marta bosing", 2 soniya ichida qayta bossangiz chiqadi.
- Faqat NAVIGATSIYA. Send-message / ask / AI-chaqiruvni HECH QACHON qaytarmaydi.
- Android hardware back tugmasi + brauzer back bir xil mantiqda ishlaydi.
- Chat ekraniga ham aniq `←` (orqaga) tugmasi qo'shildi.

## 2. uiStore — overlay stack + exit hint
- `overlays: string[]` — ochiq overlaylar steki, back topdagisini yopadi.
- `exitHint` — "chiqish uchun qayta bosing" toast holati.
- Faqat `sidebarCollapsed` localStorage'ga saqlanadi — akkaunt ma'lumoti emas, xavfsiz.

## 3. Ma'lumot saqlash (account sync)
- Chat tarixi VA AI javoblari serverda `persist()` orqali akkauntga (`user_id`) saqlanadi.
- Client cache akkaunt-keyli: `readChat(userId, chatId)` / `writeChat(userId, chatId)`.
- General draft ham akkaunt-keyli: `veltrix:general-draft:v6:${userId}`.
- Akkaunt almashganda AppShell store'larni tozalab, yangi akkauntnikini yuklaydi.
- **SHART**: migration-006 ishga tushirilishi kerak (`chat_sources` jadvali).

## 4. Manba (Source) — real RAG
- Server: bet bo'yicha (`getPageContext`) → vektor (`getVectorContext`) → kalit so'z (`getKeywordContext`) fallback.
- Skanerlangan / matnsiz PDF — original PDF to'g'ridan-to'g'ri Gemini'ga uzatiladi (20MB gacha).
- "256-betdagi uyga vazifa" — bet topilmasa yaqin betlardan real vazifa topib, aniq betni aytadi.
- Xato bo'lgan manbani "Qayta ishlash" tugmasi bilan tiklash.
- **SHART**: migration-006 (`embedding_ready`, `processing_warning` ustunlari).

## 5. Talent (avvalgi Skills)
- Nomi "Talent" ga o'zgartirildi (route `/talent`, `/skills` → redirect).
- Domain-lock: AI faqat bitta fanda fikrlaydi, chalg'imaydi.
- Default Talentlar: Hisob-kitobchi, Arifmetik, Algebra, Geometr, Fizik, Kimyogar, Biolog, Zoolog, Anatomist, Grammatik, Tarixchi, Geograf, Dasturchi.
- AI-refine: tavsifni yozgach, AI uni maksimal domain-lock ko'rsatmaga aylantiradi.
- Talent va manba uchun bg-rang + icon (emoji yoki rasm) tanlanadi.
- **SHART**: migration-006 (`seed_veltrix_talents`, `subject_slug`, `background_color`, `icon_url`).

## 6. Kalkulyator (yangi mode)
- Personal → Rejimlar → Kalkulyator (`/kalkulyator`). AI kerak emas.
- Qavs, ildiz (√), foiz (%), modulo, daraja (^), memory (M+/MR/MC), nusxa.

## 7. Typewriter barqarorligi
- General greeting (`useRotatingPrompt`) grapheme-asosida — matn kesilmaydi, bo'sh qolmaydi.
- CSS: `min-height` rezervlangan, `contain: layout style` — layout siljimaydi.

## 8. Desktop / mobil breakpoint — alohida
- `useIsMobile()` = `(max-width: 899px)`.
- CSS: 360px / 768px+ / 900px+ / 1280px+ alohida layoutlar.

## 9. Composer fokus
- Ichki qora border / outline butunlay olib tashlandi (V6 STABILITY PATCH).

## Texnik
- `tsconfig.json`: `baseUrl` olib tashlandi (TS7 deprecation warning yo'q).
- Ikkala tomon `tsc --noEmit` toza + `npm run build` muvaffaqiyatli.
