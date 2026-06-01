# ─────────────────────────────────────────────────────────────────────────
# NOVAPRINTLAB · PRINTFUL FIX & TEST · ONE-SHOT SCRIPT
# Kullanım: PowerShell'i bu klasörde aç, sadece şunu yaz:
#   .\printful-fix-and-test.ps1
# ─────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "═══ NovaPrintLab · Printful Test ════════════════════════" -ForegroundColor Cyan
Write-Host ""

# 1) Mevcut node süreçlerini kapat (dev server fresh restart için)
Write-Host "[1/5] Eski dev server süreçlerini kapatıyorum..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 2) Yeni dev server'ı arka planda başlat
Write-Host "[2/5] Dev server'ı yeni .env.local ile başlatıyorum..." -ForegroundColor Yellow
Start-Process -FilePath "powershell.exe" `
  -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npm run dev" `
  -WindowStyle Normal
Write-Host "       → Yeni bir terminal penceresi açıldı (dev server)." -ForegroundColor DarkGray
Write-Host "       → Hazır olması için 12 saniye bekliyorum..." -ForegroundColor DarkGray
Start-Sleep -Seconds 12

# 3) Token testi
Write-Host ""
Write-Host "[3/5] Printful tokenini test ediyorum (/api/printful-catalog)..." -ForegroundColor Yellow
try {
    $catalog = Invoke-RestMethod -Uri "http://localhost:3000/api/printful-catalog" -TimeoutSec 30
    if ($catalog.ok) {
        Write-Host "       ✓ Token ÇALIŞIYOR · $($catalog.count) ürün listelendi." -ForegroundColor Green
    } else {
        Write-Host "       ✗ Token PROBLEMİ: $($catalog.error)" -ForegroundColor Red
    }
    $catalog | ConvertTo-Json -Depth 6 | Out-File "$PSScriptRoot\.printful-debug-catalog.json"
    Write-Host "       → Tam yanıt: .printful-debug-catalog.json" -ForegroundColor DarkGray
} catch {
    Write-Host "       ✗ İSTEK PATLADI: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "         (Dev server hala başlatılmıyor olabilir, 5 sn bekleyip tekrar dene)" -ForegroundColor DarkGray
}

# 4) Bella+Canvas 3001 varyantları
Write-Host ""
Write-Host "[4/5] Bella+Canvas 3001 (product=71) renklerini çekiyorum..." -ForegroundColor Yellow
try {
    $variants = Invoke-RestMethod -Uri "http://localhost:3000/api/printful-catalog?product=71" -TimeoutSec 30
    if ($variants.ok) {
        Write-Host "       ✓ $($variants.variantCount) varyant · $($variants.colors.Count) farklı renk" -ForegroundColor Green
        Write-Host "       İlk 16 renk:" -ForegroundColor DarkGray
        $variants.colors | Select-Object -First 16 | ForEach-Object {
            Write-Host ("         · {0,-32} #{1}" -f $_.color, $_.color_code) -ForegroundColor DarkGray
        }
    } else {
        Write-Host "       ✗ $($variants.error)" -ForegroundColor Red
    }
    $variants | ConvertTo-Json -Depth 4 | Out-File "$PSScriptRoot\.printful-debug-variants.json"
} catch {
    Write-Host "       ✗ Varyant çağrısı patladı: $($_.Exception.Message)" -ForegroundColor Red
}

# 5) Git push (Vercel'e gönder)
Write-Host ""
Write-Host "[5/5] Git commit + push (Vercel'e deploy başlatır)..." -ForegroundColor Yellow

$gitStatus = git status --short
if ([string]::IsNullOrWhiteSpace($gitStatus)) {
    Write-Host "       ℹ Yeni değişiklik yok, push atlandı." -ForegroundColor DarkGray
} else {
    git add -A
    git commit -m "fix(printful): single batched task + signed URLs + wider color aliases + better errors"
    git push
    Write-Host "       ✓ Vercel deploy tetiklendi (Deployments sekmesinden izleyebilirsin)." -ForegroundColor Green
}

Write-Host ""
Write-Host "═══ TEST BİTTİ ═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Şimdi yap:" -ForegroundColor White
Write-Host "  1. Tarayıcıdan: http://localhost:3000/dashboard/mockup" -ForegroundColor White
Write-Host "  2. Printful Studio (default) · tasarım + renk seç · 'Printful Mockup Oluştur' bas" -ForegroundColor White
Write-Host "  3. Hata gelirse F12 → Console'daki [printful] response satırını kopyala bana at." -ForegroundColor White
Write-Host ""
Write-Host "Hata mesajı artık çok detaylı geliyor — token / bucket / renk hangisi yanlışsa" -ForegroundColor DarkGray
Write-Host "açıkça yazacak." -ForegroundColor DarkGray
Write-Host ""
