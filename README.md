# NovaPrintLab — Etsy POD İç Mekanizma

3 ortaklı bir Etsy Print-on-Demand ekibinin iç iş akışını yöneten, yapay zekâ destekli SaaS panel.

- **Yusuf** — Ham tasarımları yükler, SKU atar.
- **Kerim** — AI (görsel analizli) ile SEO başlık/açıklama/etiket üretir.
- **Taha** — Mockup hazırlar, kâr hesaplar, Etsy'de yayınlar (veya taslağa kaydeder).
- **Siparişler** — Etsy'den gelen siparişler tek tabloda; SKU eşleşen tasarımlar tek tıkla yüksek çözünürlüklü PNG iner.

## Tech

Next.js 14 · TypeScript · Tailwind + Shadcn/ui · Supabase (Postgres + Storage + Realtime) · Zustand · OpenAI GPT-4o-mini Vision · Etsy API v3

---

## Hızlı Kurulum (Vercel'e deploy ettikten sonra)

### 1. Supabase'de tabloları oluştur

Supabase Dashboard → SQL Editor → New Query → aşağıdaki dosyaları sırayla çalıştır:

- İlk kurulumsa: `supabase/schema.sql` (tüm tablolar)
- Mevcut bir kurulum için: önce `supabase/migrations/20260524_orders.sql`, sonra `supabase/migrations/20260524_etsy_credentials.sql`

### 2. Vercel'e env değişkenlerini ekle

**Vercel Dashboard → Project → Settings → Environment Variables**. Production + Preview olarak ikisine de ekle:

| Değişken | Nereden alınır |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API → "Project URL" |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → "anon public" |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → "service_role" (👁 reveal) |
| `OPENAI_API_KEY` | platform.openai.com → API Keys |
| `ETSY_API_KEY` | Aşağıda anlatılıyor 👇 |

> `SUPABASE_SERVICE_ROLE_KEY` Etsy OAuth token storage'ı için gereklidir — bu **gizli anahtar**, kimseyle paylaşma, sadece server-side route'larda kullanılır.

Env eklediğinde Vercel'in **Redeploy** etmesi gerekir (Project → Deployments → en üstteki deploy → "Redeploy").

### 3. Etsy Developer App oluştur

1. <https://www.etsy.com/developers/your-apps> sayfasına Etsy hesabınla giriş yap.
2. **Create a New App** → kısa form (app adı, açıklama).
3. Onay genelde anında, bazen birkaç saat sürebilir. Onay sonrası app sayfası açılır.
4. Sayfada **Keystring** alanı görünür — bu senin `ETSY_API_KEY` değerin. Vercel'e ekle.
5. Aynı sayfada **Callback URL** alanı var. Buraya iki URL ekle (Etsy birden fazla destekler):
   ```
   https://novaprintlab.vercel.app/api/etsy/oauth/callback
   http://localhost:3000/api/etsy/oauth/callback
   ```
   (İlkini kendi prod domain'inle değiştir — Vercel'in dashboard'unda gözüküyor.)
6. Save.

### 4. Uygulamada bağlan

Vercel deploy bittikten sonra:

1. `https://<senin-domain>/dashboard/siparisler` aç.
2. Üstteki **"Etsy ile Bağlan"** kartında butona tıkla.
3. Etsy seni izin sayfasına götürür → **Allow Access** de.
4. Geri panelimize dönersin. Kart artık **yeşil "Bağlı"** olur, mağaza adın görünür.
5. Sağ üstteki **"Etsy ile Senkronla"** butonuna bas → siparişler düşmeye başlar.

Token süresi 1 saatte dolar ama uygulama **otomatik yeniler** — bir daha bağlanman gerekmez (kullanıcı Etsy şifresini değiştirmediği sürece).

### 5. (Ops) Webhook ile push

Etsy'nin native webhook sistemi siparişler için yok. Eğer Zapier/Make/kendi serverless'inle her yeni siparişi anında bize push'lamak istersen `POST /api/etsy/webhook` endpoint'ini kullan.

`ETSY_WEBHOOK_SECRET` env var'ı set edersen her POST'a `x-webhook-secret: <value>` header'ı eklemen gerekir. Aksi takdirde endpoint açık olur (URL'in gizli olduğu varsayımıyla).

Payload formatı:

```jsonc
// Sade manuel format (test ve Zapier için)
{
  "receipt_id": "1234",
  "order_number": "#1234",
  "customer_name": "Jane Doe",
  "customer_country": "US",
  "status": "paid",
  "currency": "USD",
  "transactions": [
    {
      "title": "Boho Sun Wall Art Print",
      "sku": "NPL-001",
      "quantity": 1,
      "price": 19.95,
      "image_url": "https://i.etsystatic.com/..."
    }
  ]
}
```

Veya doğrudan native Etsy receipt object'ini POST'la (uygulama ayırt eder).

---

## Login

Sabit (hardcoded) kimlik bilgileri `lib/auth.ts` içinde. Session HttpOnly cookie, `/dashboard/*` rotaları middleware ile korunur.

## Lokal geliştirme

```bash
npm install
cp .env.example .env.local      # değerleri doldur
# Supabase Dashboard'da schema/migration'ı çalıştır (yukarıdaki Adım 1)
npm run dev
```

`http://localhost:3000` → login → dashboard.

Lokal'de Etsy bağlantısı için Etsy Developer App'inde `http://localhost:3000/api/etsy/oauth/callback` URL'inin de kayıtlı olması yeterlidir.

## Mimari Notlar

- Veri: Supabase Postgres (`public.designs`, `public.orders`, `public.etsy_credentials`). Her tablo Zustand store'da cache'lenir, Realtime kanallarıyla 3 ortağın ekranı eş zamanlı senkronizedir.
- Görsel storage: `designs` public bucket. SKU eşleşmesi anında public URL → blob → otomatik indirme.
- Status akışı (tasarım): `SEO Bekliyor` → `Mockup ve Yayınlama Bekliyor` → (`Taslak` ↔ `Aktif Mağaza`).
- Status akışı (sipariş): `paid` → `processing` → `shipped` → `completed` (`canceled` / `refunded` kollarıyla).
- SKU eşleştirme `lib/orders-store.ts` + `components/orders-table.tsx` içinde, **case-insensitive** ve trim'li. Senkron sırasında DB'de `orders.design_id` foreign key'i de doldurulur.
- Etsy OAuth: PKCE flow, refresh token rotasyonlu, server-side `etsy_credentials` tablosunda saklanır (RLS sıkı, sadece service_role erişebilir).
