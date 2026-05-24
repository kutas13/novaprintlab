# NovaPrintLab — Etsy POD İç Mekanizma

3 ortaklı bir Etsy Print-on-Demand ekibinin iç iş akışını yöneten, yapay zekâ destekli SaaS panel.

- **Yusuf**: Ham tasarımları yükler ve SKU atar.
- **Kerim**: AI (görsel analizli) ile SEO başlık/açıklama/etiketleri üretir.
- **Taha**: Mockup hazırlar, kâr hesaplar, Etsy'de yayınlar (veya taslağa kaydeder).
- **Siparişler**: Etsy'den gelen tüm siparişler tek tabloda; SKU eşleşen tasarımlar tek tıkla yüksek çözünürlüklü PNG olarak iner.

## Tech Stack

- Next.js 14 (App Router)
- TypeScript + Tailwind CSS + Shadcn/ui (Slate/Zinc dark mode)
- Supabase (Postgres + Storage + Realtime)
- Zustand (UI state + realtime store)
- OpenAI API (GPT-4o-mini Vision) — SEO üretimi
- Etsy API v3 — Sipariş senkronizasyonu

## Login

Sabit (hardcoded) kimlik bilgileri — `lib/auth.ts`. Session HttpOnly cookie ile tutulur, `/dashboard/*` rotaları middleware ile korunur.

## Kurulum

```bash
npm install
cp .env.example .env.local      # değerleri doldurun
# Supabase Dashboard → SQL Editor → supabase/schema.sql çalıştırın
# (mevcut bir kurulum için: supabase/migrations/20260524_orders.sql çalıştırın)
npm run dev
```

`http://localhost:3000` — login → dashboard.

## Environment Variables

| Key                              | Açıklama                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`       | Supabase proje URL'i                                                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Supabase anon public key                                                       |
| `SUPABASE_SERVICE_ROLE_KEY`      | (Ops) Server route'larının RLS'i bypass etmesi için. Yoksa anon key fallback.  |
| `OPENAI_API_KEY`                 | Kerim'in AI SEO çağrısı için                                                   |
| `ETSY_API_KEY`                   | Etsy Developer app → keystring                                                 |
| `ETSY_SHOP_ID`                   | Mağazanın numeric ID'si                                                        |
| `ETSY_ACCESS_TOKEN`              | OAuth 2.0 bearer token (1 saatte sonra süresi dolar — yeniden üretmek gerekir) |
| `ETSY_WEBHOOK_SECRET`            | (Ops) `/api/etsy/webhook`'a gelen POST'lar için zorunlu `x-webhook-secret`     |

## Siparişler — Etsy API v3 Entegrasyonu

### Adım 1: Etsy Developer App oluştur

1. <https://www.etsy.com/developers/your-apps> — yeni app aç, **keystring**'i kopyala → `ETSY_API_KEY`.
2. Etsy OAuth 2.0 (PKCE) ile bir access token üret. Pratik bir yol: [`@etsyhttps/etsy-api-v3-client`](https://www.npmjs.com/package/@etsyhttps/etsy-api-v3-client) veya Etsy'nin kendi [OAuth dokümanı](https://developers.etsy.com/documentation/essentials/authentication). Üretilen access token'ı `ETSY_ACCESS_TOKEN`'a yaz.
3. Mağaza ID'sini al: `GET https://openapi.etsy.com/v3/application/users/{user_id}/shops` → `ETSY_SHOP_ID`.

### Adım 2: Senkronla

Dashboard'da **Siparişler → Etsy ile Senkronla** butonu son 50 receipt'i çeker, her transaction'ı (ürün satırı) ayrı sipariş satırı olarak yazar. SKU eşleşmesi otomatiktir: Yusuf'un `designs.sku` değeri Etsy listing'inin SKU'suyla aynı yazılırsa "Tasarımı İndir" butonu o satırda aktifleşir.

Otomatik senkron istersen Vercel Cron veya GitHub Actions ile dakikalık `POST /api/etsy/sync` çağrısı kur.

### Adım 3 (opsiyonel): Webhook ile push

Etsy'nin yerli "her sipariş için webhook" özelliği yok. Bunun yerine:

- Bir middleware (Zapier, Make, kendi serverless'in) Etsy'den polling yapar
- Yeni siparişi `POST /api/etsy/webhook` adresimize iletir

Payload iki şekilde kabul edilir:

```jsonc
// 1) Doğrudan Etsy receipt objesi (veya { receipts: [...] } zarfı)
{ "receipt_id": 123, "name": "Jane Doe", "country_iso": "US", ... }

// 2) Sadeleştirilmiş manuel format (test için kullanışlı)
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

`ETSY_WEBHOOK_SECRET` ayarlıysa her POST `x-webhook-secret: <secret>` header'ı taşımalıdır, aksi takdirde 401 döner.

## Mimari Notlar

- Veri katmanı: Supabase Postgres (`public.designs`, `public.orders`). Tüm state Zustand store'larıyla cache'lenir, Realtime kanalları (`designs-realtime`, `orders-realtime`) ile 3 ortağın ekranı eş zamanlı senkronizedir.
- Görsel storage: `designs` public bucket. SKU eşleşmesi anında public URL'den fetch → blob → otomatik indirme.
- Status akışı (tasarım): `SEO Bekliyor` → `Mockup ve Yayınlama Bekliyor` → (`Taslak` ↔ `Aktif Mağaza`).
- Status akışı (sipariş): `paid` → `processing` → `shipped` → `completed` (`canceled` / `refunded` kollarıyla).
- Tasarım eşleştirme `lib/orders-store.ts` + `components/orders-table.tsx` içinde, **case-insensitive SKU** ile yapılır. Senkron sırasında DB'de `orders.design_id` foreign key'i de doldurulur (rapor ve gelecek özellikler için).
