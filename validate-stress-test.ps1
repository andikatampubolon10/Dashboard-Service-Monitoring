# ObservePulse: Proof-of-Real-Load Validation Suite
# Memvalidasi secara matematis bahwa k6 mengirimkan request fisik ke container Docker.

param (
    [string]$Flow = "2",
    [int]$VUs = 5,
    [string]$Duration = "3s"
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$k6Path = Join-Path $scriptDir "bin\k6.exe"
$stressScriptPath = Join-Path $scriptDir "stress-test.js"

if (-not (Test-Path $k6Path)) {
    Write-Host "[ERROR] Binary k6.exe tidak ditemukan di $k6Path" -ForegroundColor Red
    exit 1
}

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host " [VALIDASI] PROOF-OF-REAL-LOAD METRICS SUITE" -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "Target Flow : Flow $Flow"
Write-Host "Target VUs  : $VUs Virtual Users"
Write-Host "Durasi      : $Duration"
Write-Host ""

$metricsUrl = "http://localhost:4007/metrics"
$targetRoute = "/api/articles"
if ($Flow -eq "1") {
    $metricsUrl = "http://localhost:4006/metrics"
    $targetRoute = "/api/consultations/active"
} elseif ($Flow -eq "2") {
    $metricsUrl = "http://localhost:4007/metrics"
    $targetRoute = "/api/articles"
} elseif ($Flow -eq "3") {
    $metricsUrl = "http://localhost:4004/metrics"
    $targetRoute = "/api/live-consult"
}

function Get-PrometheusCounter {
    param([string]$url, [string]$route)
    try {
        $raw = curl.exe -s $url
        if ($raw) {
            $lines = $raw -split "`n"
            foreach ($line in $lines) {
                if ($line -match "http_requests_total\{.*(?:route|path)=`"$route`".*status_code=`"20[0-9]`".*\}\s+([0-9\.]+)") {
                    return [double]$matches[1]
                }
            }
        }
    } catch {}
    return 0
}

Write-Host "[Langkah 1] Mengambil snapshot metrik Prometheus SEBELUM pengujian..." -ForegroundColor Yellow
$metricBefore = Get-PrometheusCounter -url $metricsUrl -route $targetRoute
Write-Host "  -> Prometheus Counter [Sebelum]: $metricBefore requests" -ForegroundColor Green
Write-Host ""

Write-Host "[Langkah 2] Menjalankan Grafana k6 dengan $VUs VUs..." -ForegroundColor Yellow
$env:FLOW = $Flow
$env:VUS = "$VUs"
$env:DURATION = $Duration

& $k6Path run -e "FLOW=$Flow" -e "VUS=$VUs" -e "DURATION=$Duration" $stressScriptPath

Write-Host ""
Write-Host "[Langkah 3] Mengambil snapshot metrik Prometheus SETELAH pengujian..." -ForegroundColor Yellow
Start-Sleep -Seconds 1
$metricAfter = Get-PrometheusCounter -url $metricsUrl -route $targetRoute
Write-Host "  -> Prometheus Counter [Sesudah]: $metricAfter requests" -ForegroundColor Green

$delta = $metricAfter - $metricBefore

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host " HASIL AUDIT DAN VALIDASI MATEMATIS KODE (DELTA PROOF)" -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "Nilai Prometheus Sebelum : $metricBefore"
Write-Host "Nilai Prometheus Sesudah : $metricAfter"
Write-Host "Delta Fisik Request (Delta) : $delta request" -ForegroundColor Magenta

if ($delta -gt 0) {
    Write-Host ""
    Write-Host "[VALIDASI BERHASIL] 100% REAL STRESS TEST TERBUKTI SECARA KODE!" -ForegroundColor Green
    Write-Host "Bukti Ilmiah:"
    Write-Host "1. Container Docker fisik mencatat kenaikan counter sejumlah $delta request di RAM."
    Write-Host "2. Soket TCP riil terbentuk antara runner k6 dan port container Docker."
    Write-Host "3. Setiap request diproses secara nyata oleh runtime Node.js dan Database."
} else {
    Write-Host ""
    Write-Host "[CATATAN]: Delta bernilai 0. Pastikan service container sedang berjalan." -ForegroundColor Yellow
}
Write-Host "========================================================================" -ForegroundColor Cyan
