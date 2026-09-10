# 📚 Panduan Lengkap Arsitektur & Pelaksanaan Stress Testing Tara AI

Dokumen ini menjelaskan secara menyeluruh arsitektur, tahapan teknis, alur eksekusi setiap skenario (*flow*), serta analisis dampak autentikasi pengguna dalam pengujian beban (*stress testing*) pada ekosistem **Tara AI Microservices**.

---

## 📑 Daftar Isi
1. [Tujuan & Gambaran Arsitektur](#1-tujuan--gambaran-arsitektur)
2. [Alur Komunikasi Data (End-to-End Workflow)](#2-alur-komunikasi-data-end-to-end-workflow)
3. [Rincian Langkah-Langkah Teknis Setiap Flow](#3-rincian-langkah-langkah-teknis-setiap-flow)
   - [Flow 1: Konsultasi Chat Dokter AI](#flow-1-konsultasi-chat-dokter-ai-port-4006)
   - [Flow 2: PIN & Membaca Artikel Kesehatan](#flow-2-pin--membaca-artikel-kesehatan-port-4007)
   - [Flow 3: Pencarian Jadwal & Dokter Spesialis](#flow-3-pencarian-jadwal--dokter-spesialis-port-4004)
4. [Dampak Jika Tidak Ada User Login (Autentikasi & Validasi Data)](#4-dampak-jika-tidak-ada-user-login-autentikasi--validasi-data)
5. [Kamus Metrik & Standar Kelulusan SLA](#5-kamus-metrik--standar-kelulusan-sla)

---

## 1. Tujuan & Gambaran Arsitektur

### Mengapa Stress Testing Diperlukan?
Aplikasi kesehatan Tara AI melayani data medis sensitif, jadwal konsultasi langsung dengan dokter, serta percakapan konsultasi kesehatan. Jika puluhan atau ratusan pengguna mengakses aplikasi secara bersamaan di jam sibuk, sistem **tidak boleh macet, lambat, ataupun kehilangan data transaksi**.

### Diagram Topologi Sistem

```text
  [ React Dashboard (Vite) ]  :5173
             │  (REST API & WebSocket / Socket.IO)
             ▼
  [ Monitoring Backend Controller ]  :5000
             │  (Child Process: k6.exe runner)
             ▼
  [ Grafana k6 Engine (stress-test.js) ]
             │
   ┌─────────┴─────────────────────────────────────────┐
   │                                                   │
   ▼                                                   ▼
[ Identity Service ] :8081                 [ Target Microservices ]
(Autentikasi JWT & Pengguna)                ├─ AI Consultation Service (:4006)
                                            │  └─ Postgres + Redis + MongoDB
                                            ├─ Lifestyle Service (:4007)
                                            │  └─ PostgreSQL
                                            └─ Live Consult Service (:4004 - Golang)
                                               └─ PostgreSQL + Redis
```

---

## 2. Alur Komunikasi Data (End-to-End Workflow)

1. **User Mengklik "Mulai Pengujian" di Dashboard Frontend (`:5173`)**:
   - Memilih skenario Flow (1, 2, atau 3), jumlah pengguna simulasi (VU: 25, 50, 100, 200, 500), dan durasi (misal: 30 detik).
2. **Backend Controller Menerima Instruksi (`:5000`)**:
   - File `stressTest.route.js` memanggil binary `k6.exe` melalui modul Node.js `child_process.spawn()`.
   - Parameter disuntikkan via *Environment Variables*: `TARGET_FLOW`, `TARGET_VUS`, `TARGET_DURATION`.
3. **Streaming Log Real-time**:
   - Setiap baris keluaran dari `k6.exe` (stdout/stderr) dibaca seketika dan dipancarkan ke browser via **Socket.IO**.
   - Pengguna dapat melihat *Live Terminal Output* secara langsung di layar.
4. **Parsing Telemetri & Perhitungan Status SLA**:
   - Setelah pengujian selesai, output akhir k6 diparsing untuk mengambil:
     - **RPS (Requests per Second)**: Jumlah transaksi yang diselesaikan server tiap detik.
     - **P95 Latency**: Batas waktu tunggu maksimal yang dirasakan oleh 95% pengguna.
     - **Error Rate**: Persentase kegagalan transaksi.
     - **Health Grade**: Menentukan status kelulusan (`HEALTHY`, `DEGRADED`, atau `CRITICAL`).

---

## 3. Rincian Langkah-Langkah Teknis Setiap Flow

### Flow 1: Konsultasi Chat Dokter AI (Port :4006)
*Layanan ini menangani percakapan konsultasi kesehatan pintar antara pasien dan sistem AI.*

#### Langkah-Langkah Eksekusi:
1. **Fase Persiapan (`setup`)**:
   - k6 mengirimkan HTTP POST ke `http://localhost:8081/api/v1/auth/login` menggunakan kredensial terdaftar.
   - Identity Service memverifikasi akun dan mengembalikan token akses JWT yang sah.
2. **Fase Pengujian Beban Virtual User (VU)**:
   - Setiap pengguna virtual menyertakan header `Authorization: Bearer <token>`.
   - Mengakses endpoint pengecekan kesiapan klaster konsultasi: `GET /api/v1/consultations/active` dan `GET /health/ready`.
   - Server memproses validasi sesi token, mengecek koneksi ke basis data PostgreSQL, Redis (manajemen antrean sesi), dan MongoDB (penyimpanan dokumen riwayat chat).
3. **Standar Keberhasilan (Checks)**:
   - Status respon harus HTTP 200 OK.
   - Waktu respon P95 < 1.500 ms (1.5 detik).
   - Error Rate < 5%.

---

### Flow 2: PIN & Membaca Artikel Kesehatan (Port :4007)
*Layanan ini menangani edukasi gaya hidup sehat, verifikasi keamanan PIN, dan pembacaan artikel medis.*

#### Langkah-Langkah Eksekusi:
1. **Fase Persiapan (`setup`)**:
   - Melakukan autentikasi kredensial ke Identity Service untuk mendapatkan token JWT.
2. **Fase Pengujian Beban Virtual User (VU)**:
   - **Langkah A - Verifikasi Keamanan**: Simulasi verifikasi token akses pengguna.
   - **Langkah B - Pengambilan Katalog Artikel**: Mengirimkan `GET /api/v1/articles?page=1&limit=10`. Basis data PostgreSQL melakukan query filter, indexing, dan pagination.
   - **Langkah C - Membaca Detail Artikel**: Mengirimkan `GET /api/v1/articles/:slug` untuk memuat konten isi artikel lengkap beserta metadata penulis dan kategori medis.
3. **Standar Keberhasilan (Checks)**:
   - Data artikel wajib ditemukan (tidak boleh 404 Not Found).
   - Seluruh payload respon berbentuk JSON valid dengan status 200 OK.

---

### Flow 3: Pencarian Jadwal & Dokter Spesialis (Port :4004)
*Layanan performa tinggi berbasis bahasa **Golang** yang melayani pencarian direktori dokter spesialis dan jadwal konsultasi langsung.*

#### Langkah-Langkah Eksekusi:
1. **Fase Persiapan (`setup`)**:
   - Mendapatkan token autentikasi pasien dari Identity Service.
2. **Fase Pengujian Beban Virtual User (VU)**:
   - **Langkah A - Pencarian Dokter**: Mengirimkan `GET /api/v1/doctors` dengan parameter pencarian dan filter spesialisasi.
   - **Langkah B - Pengecekan Sesi Aktif**: Mengirimkan `GET /api/v1/consultations/active` ke database PostgreSQL & Redis untuk memastikan ketersediaan dokter secara *real-time*.
3. **Karakteristik Khusus Layanan Golang**:
   - Karena ditulis dalam bahasa Go (kompilasi biner dengan *goroutines*), Flow 3 mampu menampung kapasitas sangat tinggi (hingga 568+ transaksi per detik) dengan waktu tunggu rata-rata di bawah 30 milidetik.

---

## 4. Dampak Jika Tidak Ada User Login (Autentikasi & Validasi Data)

Pertanyaan krusial: *Apa dampaknya jika tidak ada user yang login, atau token tidak valid dalam stress testing?*

### 1. Munculnya Hasil Uji "Palsu" (*False Positive / Ilusi Kecepatan*)
* **Jika Tanpa Login (Tanpa Token JWT)**:
  - Setiap kali virtual user mengirim request, gerbang keamanan (*middleware*) microservice akan langsung menolak di baris pertama:
    ```json
    HTTP/1.1 401 Unauthorized
    {"status": "error", "message": "Access token required"}
    ```
  - **Dampak Fatal**: Server menolak dalam waktu **1-2 milidetik** tanpa pernah menyentuh logika bisnis, tanpa membaca basis data PostgreSQL, dan tanpa query ke MongoDB.
  - Akibatnya, pengujian terlihat *"sangat cepat (2 ms)"*, padahal **sistem sama sekali tidak teruji**. Begitu ada pengguna asli yang login, sistem bisa langsung roboh.
* **Dengan Login Asli (Token JWT Sah)**:
  - Server membuka enkripsi JWT, memverifikasi tanda tangan kriptografi, membaca ID pengguna, memeriksa saldo/sesi di database, dan merender data lengkap. Inilah beban kerja sesungguhnya (*real workload*).

### 2. Lonjakan Tingkat Error (100% Gagal)
* Jika kredensial login salah atau akun tidak ditemukan di database:
  - Fase `setup()` k6 akan gagal mengambil token (`Token acquired: NO`).
  - Seluruh ribuan request dari virtual user akan menghasilkan status HTTP 401/403.
  - Metrik *Error Rate* seketika menyentuh **100.0%**.
  - Dashboard akan otomatis menyatakan sistem **CRITICAL (Gagal Uji)**.

### 3. Dampak Data Kosong di Database (Kasus 404)
* Jika user login berhasil, tetapi data referensi (seperti artikel atau daftar dokter) belum di-input ke database:
  - Server akan merespon dengan `404 Not Found`.
  - Transaksi bisnis dianggap tidak tuntas karena pengguna tidak mendapatkan data yang dicari.
  - Oleh karena itu, pada tahap setup, database di-seed dengan data riil (misal: 29 artikel kesehatan aktif).

### 4. Dampak Pembatasan Kecepatan (*Rate Limiter Throttling - Kasus 429*)
* Di lingkungan produksi, microservice sering dipasangi pembatas (misal: maksimal 120 klik per menit).
* Jika 100 pengguna virtual menembak server secara bersamaan, rate limiter akan menganggapnya sebagai serangan DDoS dan mengembalikan `429 Too Many Requests`.
* Untuk keperluan stress testing internal, batas `RATE_LIMIT_RPM` pada lingkungan dev disesuaikan agar pengujian dapat mengukur batas fisik maksimal perangkat keras server (CPU/RAM).

---

## 5. Kamus Metrik & Standar Kelulusan SLA

| Nama Metrik | Bahasa Sederhana | Nilai Ideal / Batas Aman | Penjelasan |
|---|---|---|---|
| **VUs (Virtual Users)** | Pengunjung Serentak | Sesuai skenario uji (25 - 500 orang) | Jumlah orang yang membuka dan bertransaksi di aplikasi pada detik yang sama. |
| **P95 Latency** | Waktu Tunggu Pengguna | **< 1.500 ms (1.5 detik)** | Waktu yang dirasakan oleh 95% pengguna dari saat mengklik hingga layar menampilkan hasil. |
| **RPS (Throughput)** | Kecepatan Menyelesaikan Transaksi | Semakin tinggi semakin baik | Jumlah permintaan yang berhasil diselesaikan tuntas oleh server dalam 1 detik. |
| **Error Rate** | Persentase Kegagalan | **< 5.0%** (Idealnya 0.0%) | Persentase transaksi yang terputus, macet, atau gagal disimpan ke database. |

### Klasifikasi Kesehatan Sistem:
* 🟢 **HEALTHY (Lulus Penuh)**: Waktu tunggu P95 < 1.000 ms dan tingkat kegagalan < 1.0%. Aplikasi terasa instan dan sangat nyaman.
* 🟡 **DEGRADED (Perlu Perhatian)**: Waktu tunggu antara 1.000 ms – 1.500 ms atau kegagalan 1.0% – 5.0%. Aplikasi mulai terasa ada jeda.
* 🔴 **CRITICAL (Kewalahan / Gagal)**: Waktu tunggu > 1.500 ms atau kegagalan > 5.0%. Kapasitas server terlampaui dan aplikasi berisiko macet.

---
*Dokumentasi ini disusun sebagai panduan teknis resmi pengujian beban performa Tara AI Microservices.*
