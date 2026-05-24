# NovaPrintLab — Etsy POD İç Mekanizma

3 ortaklı bir Etsy Print-on-Demand ekibinin iç iş akışını yöneten, yapay zekâ destekli SaaS panel.

- **Yusuf**: Ham tasarımları yükler.
- **Kerim**: AI ile SEO başlık/açıklama/etiketleri üretir.
- **Taha**: Mockup hazırlar, kâr hesaplar ve Etsy'de yayınlar.

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS + Shadcn/ui (Slate/Zinc dark mode)
- Zustand (localStorage persist) — DB kullanılmıyor, tüm state tarayıcıda
- OpenAI API (GPT-4o-mini) — SEO üretimi

## Login

Sabit (hardcoded) kimlik bilgileri:

- E-posta: `esatis1313@gmail.com`
- Şifre: `475013`

Session HttpOnly cookie ile tutulur, Next.js middleware ile `/dashboard/*` rotaları korunur.

## Kurulum

```bash
npm install
cp .env.example .env.local   # OPENAI_API_KEY ekleyin
npm run dev
```

`http://localhost:3000` — login → dashboard.

## Vercel Deploy

`OPENAI_API_KEY` environment değişkenini Vercel paneline ekleyin. Başka bir konfigürasyon gerekmez.

## Mimari Notlar

- Tüm tasarım/SEO/mockup verisi **client-side**'da (Zustand + `persist` middleware) saklanır. Görseller base64 olarak localStorage'a yazılır — POC için yeterli, üretimde Supabase Storage / S3 önerilir.
- `/api/generate-seo` rotası OpenAI'a istek atar ve `{title, description, tags[13]}` JSON döner.
- Status akışı: `SEO Bekliyor` → `Mockup ve Yayınlama Bekliyor` → `Aktif Mağaza`.
