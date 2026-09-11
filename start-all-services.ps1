# ========================================================
# Script Memulai Seluruh Microservices & Container Tara AI
# ========================================================

Write-Host "=== Memeriksa Koneksi Docker Engine ===" -ForegroundColor Cyan
try {
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "PERINGATAN: Docker Desktop belum aktif!" -ForegroundColor Yellow
        Write-Host "Silakan buka aplikasi 'Docker Desktop' di Windows terlebih dahulu, lalu jalankan script ini kembali." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Gagal menghubungi Docker. Pastikan Docker Desktop berjalan." -ForegroundColor Red
    exit 1
}

Write-Host "Docker Engine aktif. Memulai container microservices..." -ForegroundColor Green

# Daftar container utama Tara AI
$containers = @(
    "identity-service-identity-1",
    "identity-service-postgres-1",
    "identity-service-redis-1",
    "ai-consultation-service",
    "ai-consultation-postgres",
    "ai-consultation-redis",
    "ai-consultation-mongo-dev",
    "bpjs-ai",
    "lifestyle-service",
    "lifestyle-postgres",
    "inaai-liveconsult-app-dev",
    "inaai-liveconsult-pg",
    "inaai-liveconsult-redis",
    "health-profile-service-app-1",
    "inaai-healthprofile-pg",
    "audit-service-audit-1",
    "audit-service-postgres-1"
)

foreach ($c in $containers) {
    Write-Host "Menyalakan container: $c" -NoNewline
    docker start $c | Out-Null
    Write-Host " [OK]" -ForegroundColor Green
}

Write-Host "`n=== Semua Container Microservices Telah Dijalankan! ===" -ForegroundColor Cyan
Write-Host "Port Aktif:" -ForegroundColor Yellow
Write-Host " - Identity Service       : http://localhost:8081"
Write-Host " - AI Consultation Service : http://localhost:4006"
Write-Host " - BPJS AI Mock Upstream   : http://localhost:8000"
Write-Host " - Lifestyle Service       : http://localhost:4007"
Write-Host " - Live Consult Service    : http://localhost:4004"
Write-Host " - Health Profile Service  : http://localhost:3001"
Write-Host "`nLangkah berikutnya:" -ForegroundColor White
Write-Host "1. Buka Terminal 1: cd Dashboard-Service-Monitoring/monitoring-backend && npm run dev"
Write-Host "2. Buka Terminal 2: cd Dashboard-Service-Monitoring/monitoring-frontend && npm run dev"
Write-Host "3. Buka Browser: http://localhost:5173 untuk menjalankan Stress Test!"
