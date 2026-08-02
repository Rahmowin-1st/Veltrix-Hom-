# Holat

## Ishlaydi

| Bo'lim | Holat |
|---|---|
| Chat + Gemini | ✅ |
| Chat tarixi (akkauntga sinxron) | ✅ |
| Mahkamlash / arxiv / qoralama | ✅ |
| Qidiruv (sarlavha + xabar matni) | ✅ |
| Loyihalar + ish maydoni + izolyatsiya | ✅ |
| Skills (CRUD, nusxa, doira) | ✅ |
| Manba yuklash (PDF → matn → embedding) | ✅ |
| Manba kutubxonasi + tahrirlash | ✅ |
| Tarjima (matn/rasm/audio/PDF) | ✅ |
| Ovoz (haqiqiy qurilma ovozlari) | ✅ |
| Personal + 8 javob rejimi | ✅ |
| Settings (10 bo'lim, mobil subpage) | ✅ |
| Offline banner | ✅ |
| IndexedDB kesh | ✅ |
| Skip link + focus trap + 44px target | ✅ |

## Keyingi bosqichda

- **Streaming** — hozir javob to'liq kelganda ko'rinadi. SSE qo'shilsa
  so'zma-so'z chiqadi. Backend `generate()` ni `stream()` ga o'tkazish kerak.
- **Xabarlar virtualizatsiyasi** — 200+ xabarli chatda foydali bo'ladi.
  Hozir oxirgi 60 ta keshlanadi, qolgani serverdan keladi.
- **OCR** — skanerlangan PDF (rasm sifatidagi matn) o'qilmaydi. Tesseract
  yoki Gemini Vision bilan sahifa-sahifa qilish mumkin.
- **Play Store** — release keystore, maxfiylik siyosati, do'kon sahifasi.
