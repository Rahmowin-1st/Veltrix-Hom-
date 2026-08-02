# Sizga qolgan ishlar

Men qila olmagan **faqat 2 ta** narsa bor. Ikkalasi ham Supabase/Google
panelida bosish talab qiladi — API orqali imkoni yo'q.

---

## 1️⃣ Schema'ni Supabase'ga qo'yish  ⏱ 1 daqiqa · MAJBURIY

Hozir bazada jadval yo'q. Tekshirdim:
`Could not find the table 'public.profiles'`

**Qadamlar:**
1. https://supabase.com/dashboard/project/jqpeohbbbmnoujxaiutr/sql/new
2. `schema.sql` faylini butunlay nusxalang
3. Editor'ga tashlang → **Run** bosing
4. "Success. No rows returned" chiqsa — tayyor ✅

Bu yaratadi: 15 ta jadval, RLS himoyasi, 13 ta fan, RAG qidiruv funksiyalari,
kitoblar uchun yopiq storage bucket.

---

## 2️⃣ Google Sign-In'ni yoqish  ⏱ 5 daqiqa

Tekshirdim — hozir **o'chiq**: `"google": false`

### a) Google Cloud Console'da OAuth client
1. https://console.cloud.google.com/apis/credentials
2. **Create Credentials → OAuth client ID → Web application**
3. Authorized redirect URIs ga qo'shing:
   ```
   https://jqpeohbbbmnoujxaiutr.supabase.co/auth/v1/callback
   http://localhost:5173/auth/callback
   ```
4. **Client ID** va **Client Secret** ni oling

### b) Supabase'da yoqish
1. https://supabase.com/dashboard/project/jqpeohbbbmnoujxaiutr/auth/providers
2. **Google** → Enable → Client ID + Secret ni joylang → Save

### c) Client ID ni ilovaga qo'shing
`client/.env` faylida:
```
VITE_GOOGLE_WEB_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
```

> Bu bo'lmasa ham ilova ishlaydi — **email + parol** bilan kirish tayyor.
> Google faqat qo'shimcha variant.

---

## Ishga tushirish

```bash
cd server && npm install && npm run dev    # → localhost:8787
cd client && npm install && npm run dev    # → localhost:5173
```

Telefonda:
```bash
cd client && npm run android:dev
```

---

## Keyinroq (Play Store uchun)

Bular hozir shart emas, e'lon qilishdan oldin kerak bo'ladi:

- Android OAuth client (package `uz.veltrix.hom` + release SHA-1)
- Release keystore: `keytool -genkey -v -keystore veltrix-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias veltrix`
- Play Console akkaunt ($25)
- Maxfiylik siyosati sahifasi (majburiy — o'quvchi ma'lumoti bilan ishlaydi)
- Serverni Render/Railway'ga joylash, `VITE_API_URL` ni yangilash

---

## ⚠️ Xavfsizlik

Kalitlar chatga yozilgani uchun ular endi maxfiy emas. Ilova ishlagach
almashtiring: Supabase → Settings → API Keys → Rotate, Google AI Studio →
yangi kalit. Yangilarini faqat `.env` fayllarga yozing.
