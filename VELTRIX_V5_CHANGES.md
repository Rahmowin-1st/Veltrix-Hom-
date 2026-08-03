# Veltrix Hom V5 — bajarilgan yangilanishlar

## Yagona dizayn

- Royal blue + cyan gradient, shaffof oq aralashma va account-synced custom chat background.
- Light / dark / system theme.
- Bitta canonical radius, shadow, glass va motion tizimi.
- Mobil safe-area va keyboard-safe layout.

## Asosiy navigatsiya

- Bottom nav: **Manbalar · General · Personal**.
- Spring transition, active scale va ko‘k selected state.
- Xabar yuborilishi bilan bottom nav yashirinib, full-screen Chat ochiladi.
- ChatGPT-style sidebar: chat tarixi, pinned, projects, search, profile.

## General va Chat

- 40 ta 5 soniyalik typewriter greeting.
- Text + voice input.
- `+` ichida file / source / skill; bir nechta source va bitta skill bir so‘rovda.
- Draft saqlanishi.
- Yuborishda composer cheti bo‘ylab bir martalik ko‘k svet animatsiyasi.
- Gradient/mirror user bubble, profil rasmi, structured AI card, citation va TTS.
- Bir nechta locked source backendga yuboriladi.

## Personal

- Reels uslubidagi 2 ta scroll-snap ekran.
- Activity mood sticker, 0–100 zebra indikator, rangli podsvetka.
- Haftalik, oylik, best day va so‘nggi 3/30 kun real statistikasi.
- Alohida mode sahifalari, Skills, testlar va fan o‘yini.

## Test tizimi

- AI yoki qo‘lda test yaratish.
- Nom 15, description 50 belgi.
- Emoji yoki photo cover, background color.
- Savol soni, har savol timeri, umumiy timer.
- Savol va variantlarni random qilish.
- To‘g‘ri javobda confetti, xatoda vibration + qizil edge glow.
- Timeout va xatoda to‘g‘ri variant grey zebra bilan ko‘rsatiladi.
- Testlar, urinishlar va javoblar Supabase’da saqlanadi.

## Manba va fayllar

- PDF maksimum 20 MB.
- Tarjima attachment maksimum 20 MB.
- Rangli fan motiflari bilan source kartalari.
- Multiple source selection va real source activity.

## Sozlamalar

- ChatGPT-style root va full-screen subpages.
- Theme, accent, secondary light, chat gradient, custom photo, blur, mirror intensity.
- Voice, Translation, AI, Sources, Skills, Notifications, Performance va Privacy.

## Backend

- Activity API + summary RPC.
- Quiz CRUD, AI generation, attempts, answers va results.
- Multiple source IDs chat requestida.
- Chat, source, translation, quiz va game activity logging.
