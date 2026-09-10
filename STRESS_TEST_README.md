# 📚 Dokumentasi Lengkap Stress Testing Tara AI Microservices

Panduan komprehensif arsitektur, proses pembuatan, alur kerja setiap skenario (*flow*), analisis dampak autentikasi pengguna (*login vs non-login*), dan panduan interpretasi metrik performa.

---

## 📑 Daftar Isi
1. [Latar Belakang & Tujuan Pengujian](#1-latar-belakang--tujuan-pengujian)
2. [Arsitektur Sistem Pengujian Beban](#2-arsitektur-sistem-pengujian-beban)
3. [Alur Kerja Komunikasi Data (End-to-End Workflow)](#3-alur-kerja-komunikasi-data-end-to-end-workflow)
4. [Langkah-Langkah Teknis Rinci Setiap Flow](#4-langkah-langkah-teknis-rinci-setiap-flow)
   - [Flow 1: Konsultasi Chat Dokter AI (:4006)](#flow-1-konsultasi-chat-dokter-ai-port-4006)
   - [Flow 2: Autentikasi PIN & Membaca Artikel Kesehatan (:4007)](#flow-2-autentikasi-pin--membaca-artikel-kesehatan-port-4007)
   - [Flow 3: Pencarian Jadwal & Dokter Spesialis (:4004)](#flow-3-pencarian-jadwal--dokter-spesialis-port-4004)
5. [Dampak Kritis: Pengujian dengan Login vs Tanpa Login](#5-dampak-kritis-pengujian-dengan-login-vs-tanpa-login)
   - [Dampak 1: Hasil Uji Palsu (False Positive / Ilusi Kecepatan)](#dampak-1-hasil-uji-palsu-false-positive--ilusi-kecepatan)
   - [Dampak 2: Lonjakan Error Rate Menjadi 100%](#dampak-2-lonjakan-error-rate-menjadi-100)
   - [Dampak 3: Kegagalan Query Akibat Data Kosong (Kasus 404)](#dampak-3-kegagalan-query-akibat-data-kosong-kasus-404)
   - [Dampak 4: Terkena Proteksi Keamanan Rate Limiter (Kasus 429)](#dampak-4-terkena-proteksi-keamanan-rate-limiter-kasus-429)
6. [Kamus Metrik & Standar Kelulusan SLA](#6-kamus-metrik--standar-kelulusan-sla)
7. [Panduan Menjalankan & Memecahkan Masalah (Troubleshooting)](#7-panduan-menjalankan--memecahkan-masalah-troubleshooting)

---

## 1. Latar Belakang & Tujuan Pengujian

Aplikasi **Tara AI** adalah platform layanan kesehatan terintegrasi yang menangani data medis sensitif, interaksi kecerdasan buatan (*AI Consultation*), serta penjadwalan temu dokter spesialis.

### Mengapa Stress Testing Wajib Dilakukan?
1. **Mencegah Aplikasi Macet di Jam Sibuk**: Memastikan sistem tidak mengalami *crash* saat ratusan pasien mengakses dokter secara bersamaan.
2. **Menjamin Keutuhan Data Medis**: Memastikan tidak ada catatan riwayat konsultasi atau resep yang hilang di tengah jalan akibat antrean database penuh.
3. **Mengukur Batas Maksimal Fisik (*Breaking Point*)**: Mengetahui pada jumlah pengguna ke berapa server mulai melambat, sehingga tim teknis dapat melakukan penambahan kapasitas (*scaling*) sebelum aplikasi dirilis ke publik.

---

## 2. Arsitektur Sistem Pengujian Beban

Pengujian beban ini dirancang terdistribusi secara *non-mocking* (menembak langsung container Docker microservices asli):

```text
  ┌─────────────────────────────────────────────────────────┐
  │         React Frontend Dashboard (Vite) :5173           │
  │    - Form Kontrol Skenario (Flow 1, 2, 3) & Target VUs   │
  │    - Real-Time Live Log Terminal (Socket.IO)            │
  │    - Pop-up Modal Evaluasi Kelayakan & SLA              │
  └────────────────────────────┬────────────────────────────┘
                               │ HTTP REST & WebSocket
                               ▼
  ┌─────────────────────────────────────────────────────────┐
  │       Monitoring Backend Controller (Express) :5000     │
  │    - Route: /api/v1/stress-test/start, /stop, /status   │
  │    - Spawner: child_process.spawn("k6.exe", [...])      │
  │    - Real-Time Stdout/Stderr Streamer via Socket.IO     │
  │    - Parser Output Telemetri & Evaluator Kelulusan SLA  │
  └────────────────────────────┬────────────────────────────┘
                               │ Eksekusi CLI & Passing Env
                               ▼
  ┌─────────────────────────────────────────────────────────┐
  │         Grafana k6 Engine (stress-test.js)              │
  │    - Multi-scenario virtual users (25 - 500 VUs)        │
  │    - Tahap setup() login & ekstraksi token JWT          │
  │    - Pengujian HTTP concurrent ke socket Docker         │
  └─────────────┬─────────────────────────────┬─────────────┘
                │                             │
       (Fase Autentikasi)              (Fase Beban Nyata)
                ▼                             ▼
  ┌───────────────────────────┐ ┌───────────────────────────┐
  │  Identity Service :8081   │ │ Target Microservices:     │
  │  - PostgreSQL Auth DB     │ │ 1. AI Service (:4006)     │
  │  - Penerbit Token JWT     │ │    └─ PG + Mongo + Redis  │
  │                           │ │ 2. Lifestyle (:4007)      │
  │                           │ │    └─ PostgreSQL          │
  │                           │ │ 3. Live Consult (:4004)   │
  │                           │ │    └─ PG + Redis (Golang) │
  └───────────────────────────┘ └───────────────────────────┘
```

---

## 3. Alur Kerja Komunikasi Data (End-to-End Workflow)

1. **Inisiasi dari Dashboard UI (`:5173`)**:
   Pengguna memilih skenario (misal: Flow 1, 100 VUs, durasi 30 detik) dan menekan tombol **"Mulai Pengujian"**.
2. **Backend Controller Memulai Proses (`:5000`)**:
   `stressTest.route.js` memanggil binary eksternal `k6.exe` menggunakan script `stress-test.js` dengan parameter yang disuntikkan:
   ```bash
   TARGET_FLOW=1 TARGET_VUS=100 TARGET_DURATION=30s k6 run stress-test.js
   ```
3. **Streaming Log Real-time ke Browser**:
   Setiap baris keluaran k6 (*stdout*) ditangkap oleh event listener dan dipancarkan ke antarmuka web melalui WebSocket. Pengguna dapat melihat langsung aktivitas per detik tanpa me-refresh halaman.
4. **Parsing Hasil & Evaluasi SLA**:
   Begitu pengujian selesai:
   * Regex backend membaca metrik akhir: `http_req_duration` (P95 latency), `http_req_failed` (error rate), dan total transaksi.
   * Nilai latensi dinormalisasi (otomatis mengubah detik `s` ke milidetik `ms`).
   * Sistem menghitung status kesehatan: `HEALTHY`, `DEGRADED`, atau `CRITICAL`.
   * Hasil disimpan ke penyimpanan riwayat lokal (*localStorage*) dan ditampilkan dalam modal ringkasan eksekutif.

---

## 4. Langkah-Langkah Teknis Rinci Setiap Flow

---

### Flow 1: Konsultasi Chat Dokter AI (Port :4006)
*Tujuan: Menguji kesiapan infrastruktur chat medis pintar end-to-end, mulai dari validasi sesi aktif, pengiriman prompt keluhan pasien ke AI via Server-Sent Events (SSE), persistensi MongoDB & PostgreSQL, hingga verifikasi riwayat transcript.*

#### Alur Langkah:
1. **Tahap Setup (Multi-User Pool 11 Akun)**:
   * Script k6 mengotentikasi pool 11 akun pasien ke **Identity Service (:8081)** dan mendapatkan token JWT unik per akun.
   * Melakukan *pre-warm* sesi konsultasi aktif di **AI Consultation Service (:4006)** untuk mengisolasi sesi tiap pengguna.
2. **Tahap Pengujian Beban Virtual Users (VUs)**:
   * Setiap virtual user didistribusikan secara *round-robin* ke 11 akun pengguna.
   * **Step 1 (`GET /api/consultations/active`)**: Cek sesi konsultasi aktif pasien di PostgreSQL.
   * **Step 2 (`POST /api/consultations`)**: Membuat sesi konsultasi baru otomatis jika belum ada sesi terbuka.
   * **Step 3 (`POST /api/consultation/chat`)**: Mengirimkan keluhan pasien via SSE (*Server-Sent Events*), memicu verifikasi token RS256, rate limiting Redis, penguncian *turn lock*, penyimpanan pesan pasien di MongoDB (`consultation_messages`), dan penerimaan respons dokter AI.
   * **Step 4 (`GET /api/consultations/:id`)**: Membaca detail konsultasi lengkap beserta transkrip percakapan yang tersimpan.
   * **Step 5 (`GET /health/ready`)**: Probe kesiapan klaster simultan (PostgreSQL, MongoDB, dan Redis).
3. **Karakteristik & Toleransi Siklus AI**:
   * Ambang batas latensi P95 disesuaikan secara otomatis (`p(95)<8000ms`) karena interaksi chat AI melibatkan siklus transmisi streaming, berbeda dengan REST CRUD biasa (`p(95)<1500ms`).
   * Menangani kode status `200` (respons AI streaming selesai), `409` (proteksi konkurensi turn lock Redis), dan `502` (graceful gateway fallback jika LLM eksternal offline di lingkungan lokal).

---

### Flow 2: Autentikasi PIN & Membaca Artikel Kesehatan (Port :4007)
*Tujuan: Menguji performa sistem pembacaan artikel massal, paginasi, dan indeks pencarian database relasional.*

#### Alur Langkah:
1. **Tahap Setup**:
   * Melakukan login ke Identity Service untuk mengantongi token otorisasi.
2. **Tahap Pengujian Beban Virtual Users (VUs)**:
   * **Langkah A (Paginasi Katalog)**: Mengirimkan `GET /api/v1/articles?page=1&limit=10`.
     * Database PostgreSQL mengeksekusi klausa `LIMIT` dan `OFFSET` serta mengurutkan artikel berdasarkan tanggal rilis terbaru.
   * **Langkah B (Pengambilan Detail Artikel)**: Mengirimkan `GET /api/v1/articles/:slug` (membaca artikel spesifik seperti artikel nutrisi atau olahraga).
     * Server memuat teks lengkap artikel beserta relasi kategori dan identitas dokter penulis.
3. **Karakteristik Performa**:
   * Karena artikel bersifat *read-heavy* (banyak dibaca, jarang diubah), endpoint ini menjadi kandidat utama untuk dipasangi *Cache Memory* di masa mendatang.

---

### Flow 3: Pencarian Jadwal & Dokter Spesialis (Port :4004)
*Tujuan: Menguji layanan performa tinggi berbasis bahasa **Golang** yang melayani pencarian direktori dokter spesialis dan ketersediaan jadwal.*

#### Alur Langkah:
1. **Tahap Setup**:
   * Login pasien untuk mendapatkan token akses.
2. **Tahap Pengujian Beban Virtual Users (VUs)**:
   * **Langkah A (Pencarian Dokter)**: Mengirimkan `GET /api/v1/doctors` dengan filter kueri spesialisasi (seperti dokter anak, spesialis jantung).
   * **Langkah B (Pengecekan Ketersediaan)**: Mengirimkan `GET /api/v1/consultations/active` untuk memeriksa slot dokter yang sedang kosong.
3. **Keunggulan Golang di Flow 3**:
   * Ditulis menggunakan bahasa Go yang dikompilasi langsung ke biner mesin (*machine code*).
   * Menggunakan *goroutines* dengan alokasi memori sangat kecil (hanya ~2 KB per thread).
   * Hasil nyata: Sanggup menuntaskan **568+ transaksi per detik** dengan latensi rata-rata hanya **28 ms** pada beban 200 pengguna serentak.

---

## 5. Dampak Kritis: Pengujian dengan Login vs Tanpa Login

Mengapa k6 harus login terlebih dahulu dan menyertakan token JWT yang valid? Apa dampaknya jika tidak ada user yang login?

---

### Dampak 1: Hasil Uji Palsu (*False Positive / Ilusi Kecepatan*)
* **Kondisi Tanpa Login (Tanpa Token):**
  * Ketika virtual user menembak endpoint tanpa header `Authorization`, gerbang middleware otentikasi microservice akan langsung menolak di baris pertama kode:
    ```json
    HTTP/1.1 401 Unauthorized
    {"status": "error", "message": "Access token required"}
    ```
  * **Bahaya Tersembunyi**: Server menolak request ini dalam waktu **hanya 1 - 2 milidetik** karena server **TIDAK PERNAH**:
    1. Membaca database PostgreSQL.
    2. Menghubungi MongoDB atau Redis.
    3. Menjalankan logika bisnis atau enkripsi apapun.
  * Hasil pengujian akan terlihat *"Sangat Sukses & Super Cepat (latensi 2 ms)"*, padahal **sistem sama sekali tidak teruji**. Saat aplikasi diluncurkan ke pengguna nyata yang sudah login, server bisa langsung ambruk karena beban aslinya belum pernah dicoba.
* **Kondisi Dengan Login Asli (Token JWT Sah):**
  * Server membuka dekripsi JWT, memverifikasi tanda tangan kriptografi, membaca ID pengguna, memeriksa saldo/sesi di database, dan merender data lengkap. Inilah beban kerja sesungguhnya (*real workload*).

---

### Dampak 2: Lonjakan Error Rate Menjadi 100%
* Jika kredensial akun salah atau database identity mati sehingga k6 tidak mendapatkan token di fase `setup`:
  * Seluruh ribuan request yang dikirim virtual users akan menghasilkan status `401 Unauthorized` atau `403 Forbidden`.
  * Angka **Error Rate akan langsung melonjak ke 100.0%**.
  * Dashboard otomatis menetapkan status **CRITICAL (Gagal Uji)** karena sistem menolak seluruh aktivitas pengguna.

---

### Dampak 3: Kegagalan Query Akibat Data Kosong (Kasus 404)
* Jika user berhasil login, namun tabel data di database kosong (misal: belum ada artikel yang diinput):
  * Virtual user akan menerima respon `404 Not Found`.
  * Walaupun server tidak crash (tidak 500), transaksi bisnis dianggap gagal karena pasien tidak dapat melihat konten yang dicari.
  * *Tindakan Solusi yang Telah Diterapkan*: Kita telah melakukan proses *seeding* 29 artikel ke dalam basis data `lifestyle-service` agar pengujian membaca baris data fisik riil.

---

### Dampak 4: Terkena Proteksi Keamanan Rate Limiter (Kasus 429)
* Di lingkungan produksi, microservice sering dipasangi pembatas (misal: maksimal 120 klik per menit per IP).
* Jika 100 pengguna virtual menembak server secara bersamaan dari 1 komputer penguji, rate limiter akan menganggapnya sebagai serangan DDoS dan mengembalikan `429 Too Many Requests`.
* *Tindakan Solusi yang Telah Diterapkan*: Pada lingkungan development/pengujian, kita menyesuaikan konfigurasi `RATE_LIMIT_RPM=0` pada file `.env` service terkait agar dapat menguji batas ketahanan fisik perangkat keras server (CPU/RAM).

---

## 6. Kamus Metrik & Standar Kelulusan SLA

| Nama Metrik | Bahasa Sederhana | Nilai Ideal / Batas Aman | Penjelasan |
|---|---|---|---|
| **VUs (Virtual Users)** | Pengguna Serentak | 25 s/d 500 pengguna | Jumlah orang yang membuka dan beraktivitas di aplikasi pada detik yang sama. |
| **P95 Latency** | Waktu Tunggu Pengguna | **< 1.500 ms (1.5 detik)** | Waktu respon yang dirasakan oleh 95% pengguna. Jika di bawah 300 ms, aplikasi terasa sangat instan. |
| **RPS (Throughput)** | Kecepatan Transaksi | Semakin tinggi semakin baik | Jumlah permintaan yang berhasil diselesaikan server dalam tempo 1 detik. |
| **Error Rate** | Tingkat Kegagalan | **< 5.0%** (Target: 0.0%) | Persentase data yang gagal terproses, terputus, atau ditolak server. |

### Klasifikasi Kelulusan Sistem:
* 🟢 **HEALTHY (Sangat Tangguh / Lulus Penuh)**: Latensi P95 < 1.000 ms, Error Rate < 1.0%. Pengguna merasakan kenyamanan maksimal.
* 🟡 **DEGRADED (Mulai Tertekan / Perlu Perhatian)**: Latensi P95 antara 1.000 ms – 1.500 ms, atau Error Rate 1.0% – 5.0%. Pengguna mulai merasakan jeda *loading*.
* 🔴 **CRITICAL (Kapasitas Terlampaui / Gagal Uji)**: Latensi P95 > 1.500 ms atau Error Rate > 5.0%. Terjadi antrean panjang dan risiko transaksi medis terputus.

---

## 7. Panduan Menjalankan & Memecahkan Masalah (Troubleshooting)

### Menjalankan Pengujian dari Dashboard:
1. Buka browser di `http://localhost:5173`.
2. Klik tombol **"Uji Daya Tahan Sistem ↗"** di pojok kanan atas.
3. Pilih Flow yang ingin diuji, tentukan jumlah pengguna (VUs), lalu klik **"Mulai Pengujian Stress Test"**.
4. Pantau terminal log k6 secara langsung hingga pop-up hasil evaluasi muncul.

### Menjalankan Pengujian Manual via Terminal:
```bash
# Pindah ke direktori pengujian
cd "d:\SEMESTER 7\Tara_ai\Dashboard-Service-Monitoring"

# Jalankan Flow 1 dengan 50 pengguna selama 30 detik
$env:TARGET_FLOW="1"; $env:TARGET_VUS="50"; $env:TARGET_DURATION="30s"; .\bin\k6.exe run stress-test.js
```

### Checklist Pemecahan Masalah (Troubleshooting):
* **Error `connect ECONNREFUSED`**: Pastikan container Docker target sedang menyala dengan perintah `docker ps`.
* **Error `401 Unauthorized` pada Flow 1/2/3**: Pastikan `identity-service` di port 8081 dapat menerima login dengan user default pengujian.
* **Flow 1 Timeout / Hang**: Pastikan container `ai-consultation-mongo-dev` menyala agar endpoint pengecekan kesiapan klaster chat dapat tersambung.
