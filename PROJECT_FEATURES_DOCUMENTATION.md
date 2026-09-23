# 📋 DOKUMENTASI LENGKAP FITUR & ARSITEKTUR SISTEM: TARA AI & OBSERVABILITY DASHBOARD

Dokumen ini menyajikan panduan komprehensif seluruh fitur, kapabilitas teknis, arsitektur microservice, mesin pengujian beban (*load & stress testing*), serta modul observabilitas pada proyek **Tara AI & Dashboard Service Monitoring**.

---

## 📑 DAFTAR ISI

1. [Ringkasan Ekosistem & Topologi Sistem](#1-ringkasan-ekosistem--topologi-sistem)
2. [Arsitektur Microservices Backend](#2-arsitektur-microservices-backend)
   - 2.1 Identity Service (Otentikasi & Akun Pasien)
   - 2.2 AI Consultation Service (Konsultasi Dokter AI & Triage)
   - 2.3 Lifestyle Service (Edukasi Medis & Gaya Hidup)
   - 2.4 Live Consult Service (Telekonsultasi Dokter Spesialis)
   - 2.5 Health Profile Service (Profil Rekam Medis & Biometrik)
   - 2.6 Medical Record Service (RME / EMR Klinis)
   - 2.7 Upstream BPJS AI / Govtech LLM Engine
3. [Fitur Monitoring & Observabilitas Real-Time](#3-fitur-monitoring--observabilitas-real-time)
   - 3.1 Live Service Health & Pulse Polling
   - 3.2 Metrik Infrastruktur Dual VM (Prometheus & Node Exporter)
   - 3.3 Grafik Analisis Metrik Interaktif
   - 3.4 Sistem Peringatan Dini (*Alerting Thresholds*)
4. [Mesin Pengujian Performa: Load Test vs Stress Test](#4-mesin-pengujian-performa-load-test-vs-stress-test)
   - 4.1 Mode 🟢 Load Test (Single-Wave Concurrent Iteration)
   - 4.2 Mode 🔴 Stress Test (Sustained Ramping & Trapezoid Stages)
   - 4.3 Dynamic User Generator (1 VU = 1 Pasien Asli)
   - 4.4 Metrik Validasi Trafik Nyata (*Anti-Mocking Telemetry*)
5. [Fitur Rancang Alur (*Custom Dynamic Flow Builder*)](#5-fitur-rancang-alur-custom-dynamic-flow-builder)
   - 5.1 Perbedaan Mendasar: Rancang Alur vs Uji Service
   - 5.2 Mekanisme Context Injection Dinamis
   - 5.3 Proteksi Eksekusi *Fail-Fast*
   - 5.4 Alur Bawaan Sistem (*Preset Flows*)
6. [Fitur Uji Service (*Isolated Service Probing*)](#6-fitur-uji-service-isolated-service-probing)
7. [Analisis Cerdas Google Gemini AI (RCA & Rekomendasi)](#7-analisis-cerdas-google-gemini-ai-rca--rekomendasi)
8. [Riwayat Pengujian & Manajemen Data (MySQL MariaDB)](#8-riwayat-pengujian--manajemen-data-mysql-mariadb)
9. [Struktur Kode & Lokasi File Proyek](#9-struktur-kode--lokasi-file-proyek)

---

## 1. RINGKASAN EKOSISTEM & TOPOLOGI SISTEM

Sistem ini dirancang sebagai platform layanan kesehatan terdistribusi berskala besar (*Healthcare Microservices Platform*) yang dilengkapi dengan panel observabilitas (*Observability & Load Testing Dashboard*) independen.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         OBSERVEPULSE MONITORING DASHBOARD                        │
│             Frontend: React + Vite (Port 5173) | Backend: Node.js (Port 5000)    │
│            Engine: Grafana k6 Binary | Database: MySQL MariaDB Hosting           │
└───────────────────────┬──────────────────────────────────┬───────────────────────┘
                        │                                  │
      Prometheus Scraping & k6 Load Tests                  │ Remote Monitoring
                        │                                  │
┌───────────────────────▼────────────────┐   ┌─────────────▼───────────────────────┐
│     GOOGLE CLOUD PLATFORM - VM 1       │   │     GOOGLE CLOUD PLATFORM - VM 2    │
│          IP: 34.101.207.115            │   │          IP: 34.101.122.171         │
├────────────────────────────────────────┤   ├─────────────────────────────────────┤
│ • Identity Service       (Port 8080)   │   │ • AI Consultation Service (Port 4006)│
│ • Lifestyle Service      (Port 4005)   │   │ • Medical Record Service  (Port 3002)│
│ • Live Consult Service   (Port 4004)   │   │ • PostgreSQL & MongoDB Engine       │
│ • Health Profile Service (Port 3001)   │   │ • Node Exporter Metrics   (Port 9100)│
│ • Audit / Kafka Broker   (Port 4005)   │   └──────────────────┬──────────────────┘
│ • PostgreSQL & Redis Containers        │                      │
└────────────────────────────────────────┘                      │ Upstream LLM
                                                                ▼
                                             ┌─────────────────────────────────────┐
                                             │    BPJS AI / GOVTECH LLM SERVER     │
                                             │          IP: 34.50.77.226:8000      │
                                             │      Python FastAPI / Multi-Agent   │
                                             └─────────────────────────────────────┘
```

---

## 2. ARSITEKTUR MICROSERVICES BACKEND

Seluruh backend dibangun dengan arsitektur microservices terisolasi dalam kontainer Docker di Google Cloud Platform (GCP).

### 2.1 Identity Service (Otentikasi & Akun Pasien)
- **Teknologi**: Golang, PostgreSQL, JWT RS256, Argon2id.
- **Lokasi Host**: VM 1 (`http://34.101.207.115:8080`).
- **Fitur Utama**:
  - Registrasi pasien baru (`POST /api/v1/auth/register`).
  - Login dan otentikasi akun (`POST /api/v1/auth/login`).
  - Verifikasi token & BPJS Bridge (`POST /api/v1/bpjs/verify`).
  - Penerbitan JWT Token dengan tanda tangan kunci asimetris RS256 untuk otorisasi seluruh microservice downstream.

### 2.2 AI Consultation Service (Konsultasi Dokter AI & Triage)
- **Teknologi**: Node.js, Fastify, PostgreSQL (metadata), MongoDB (chat transcripts), Redis (turn locks & session caching).
- **Lokasi Host**: VM 2 (`http://34.101.122.171:4006`).
- **Fitur Utama**:
  - Cek sesi konsultasi aktif pasien (`GET /api/consultations/active`).
  - Pembuatan sesi konsultasi baru (`POST /api/consultations`) dengan kategori: `GENERAL`, `NUTRITION`, `MENTAL_HEALTH`, `CHRONIC_DISEASE`, `MEDICATION`, `FITNESS`.
  - Chat streaming respons dokter AI (`POST /api/consultation/chat`) via protokol **Server-Sent Events (SSE)**.
  - Mekanisme **Redis Turn Lock**: Mencegah race condition ketika 1 akun pasien mengirim lebih dari 1 pesan secara bersamaan sebelum respons streaming selesai.
  - Integrasi berkas lampiran rekam medis (`POST /api/consultation/upload-record`).
  - Riwayat transkrip konsultasi (`GET /api/consultations/:id`).

### 2.3 Lifestyle Service (Edukasi Medis & Gaya Hidup)
- **Teknologi**: Node.js, Express, Prisma ORM, PostgreSQL.
- **Lokasi Host**: VM 1 (`http://34.101.207.115:4005`).
- **Fitur Utama**:
  - Katalog artikel kesehatan dan panduan hidup sehat (`GET /api/articles`).
  - Pembacaan konten artikel spesifik berdasarkan *slug* (`GET /api/articles/:slug`).
  - Pelacakan kebiasaan sehat harian pasien (*habit tracker*, pola tidur, hidrasi).

### 2.4 Live Consult Service (Telekonsultasi Dokter Spesialis)
- **Teknologi**: Golang, WebSockets, PostgreSQL, Redis.
- **Lokasi Host**: VM 1 (`http://34.101.207.115:4004`).
- **Fitur Utama**:
  - Katalog dokter spesialis yang sedang bertugas (`GET /api/live-consult`).
  - Pembuatan sesi panggilan telekonsultasi dokter (`POST /api/live-consult`).
  - Komunikasi dua arah *real-time* via WebSocket (`WS /api/live-consult/ws`) antara pasien dan dokter.

### 2.5 Health Profile Service (Profil Rekam Medis & Biometrik)
- **Teknologi**: Node.js, PostgreSQL.
- **Lokasi Host**: VM 1 (`http://34.101.207.115:3001`).
- **Fitur Utama**:
  - Profil data diri kesehatan pasien (golongan darah, riwayat alergi, penyakit kronis).
  - PIN Enkripsi untuk akses proteksi data sensitif pasien.
  - Verifikasi wajah biometrik terenkripsi (*face enrollment & verification*).

### 2.6 Medical Record Service (RME / EMR Klinis)
- **Teknologi**: Node.js, PostgreSQL, Elasticsearch (pencarian dokumen rekam medis).
- **Lokasi Host**: VM 2 (`http://34.101.122.171:3002`).
- **Fitur Utama**:
  - Pengelolaan rekam medis elektronik terstandarisasi FHIR.
  - Penyimpanan berkas diagnosis lab dan riwayat tindakan klinik.
  - Indeks pencarian cepat histori medis menggunakan Elasticsearch.

### 2.7 Upstream BPJS AI / Govtech LLM Engine
- **Teknologi**: Python FastAPI, Multi-Agent LangGraph/Triage, Model Generatif AI.
- **Lokasi Host**: VM Eksternal (`http://34.50.77.226:8000`).
- **Fitur Utama**:
  - Manajemen sesi inferensi LLM (`POST /sessions`).
  - Chat stream multi-agent triage (`POST /sessions/:sid/chat/stream`).
  - Memerlukan otorisasi rahasia `X-Service-Token` (`BPJS_AI_SHARED_SECRET`).

---

## 3. FITUR MONITORING & OBSERVABILITAS REAL-TIME

Dashboard `monitoring-frontend` terhubung secara dinamis dengan `monitoring-backend` untuk menyajikan visibilitas sistem secara menyeluruh.

### 3.1 Live Service Health & Pulse Polling
- **Interval Polling**: 5 detik otomatis via background cron Express.js.
- **Status Indikator**:
  - 🟢 **Healthy (Online)**: Endpoint merespons HTTP 200 dalam batas waktu yang ditentukan.
  - 🟡 **Degraded**: Respon melambat di atas ambang batas wajar (>1000ms).
  - 🔴 **Offline (Down)**: Koneksi terputus (*connection refused / timeout*).
- **Service Target Selector**: Memungkinkan pemilihan URL uji antara *Default Production GCP* atau *Localhost Development*.

### 3.2 Metrik Infrastruktur Dual VM (Prometheus & Node Exporter)
Sistem melakukan scraping langsung ke `Node Exporter` di VM GCP untuk menangkap kondisi perangkat keras:
- **Penggunaan CPU (vCPU Utilization %)**.
- **Penggunaan Memori RAM (GB Used & %)**.
- **Disk I/O & Network Throughput (KB/s In/Out)**.
- **Load Average (1m, 5m, 15m)**.

### 3.3 Grafik Analisis Metrik Interaktif
- Visualisasi berbasis pustaka **Recharts** dengan tema gelap (*dark glassmorphic UI*).
- Menampilkan grafik historis:
  - *Response Time Trend (P50, P90, P95, P99 Latency)*.
  - *Throughput (Requests Per Second / RPS)*.
  - *Error Rate (%)*.
  - *System Resources (CPU & RAM)*.
- Rentang waktu filter dinamis: 15 Menit, 1 Jam, 6 Jam, 24 Jam.

### 3.4 Sistem Peringatan Dini (*Alerting Thresholds*)
Backend secara otomatis memicu notifikasi peringatan jika sistem mendeteksi anomali:
- `ALERT_CPU_PERCENT`: Peringatan jika CPU > 80%.
- `ALERT_MEMORY_PERCENT`: Peringatan jika RAM > 85%.
- `ALERT_ERROR_RATE_PERCENT`: Peringatan jika error HTTP 5xx > 5%.
- `ALERT_LATENCY_P99_MS`: Peringatan jika latensi P99 > 1000ms.

---

## 4. MESIN PENGUJIAN PERFORMA: LOAD TEST VS STRESS TEST

Mesin pengujian beban mengintegrasikan engine performa tinggi berstandar industri: **Grafana k6 Binary (`bin/k6.exe`)**.

### 4.1 Mode 🟢 Load Test (Single-Wave Concurrent Iteration)
- **Tujuan**: Mengukur stabilitas sistem ketika menerima gelombang beban pasien dalam jumlah tertentu secara serentak.
- **Karakteristik**:
  - **1x Iterasi Tuntas**: Seluruh Virtual Users (VUs) yang dipilih (misal 25 VU) masuk secara bersamaan, mengeksekusi tahapan alur dari langkah pertama hingga selesai tepat satu kali, lalu berhenti secara anggun (*graceful stop*).
  - **Identitas Visual**: Menggunakan palet bertema **Emerald / Cyan / Indigo** pada UI tombol, chart, dan log terminal k6.
  - **Metrik Utama**: *Total Transaksi Berhasil*, *Rata-rata Waktu Tunggu Pasien*, dan *Success Rate*.

### 4.2 Mode 🔴 Stress Test (Sustained Ramping & Trapezoid Stages)
- **Tujuan**: Menemukan titik jenuh (*breaking point*), *bottleneck*, atau kebocoran memori (*memory leak*) ketika sistem dihantam lalu lintas tinggi berulang-ulang tanpa jeda.
- **Karakteristik**:
  - **Sustained Multi-Stage Execution**: Menggunakan model tahapan trapesium berjenjang:
    1. *Ramp-Up*: Penambahan bertahap dari 0 ke target VU.
    2. *Peak Sustain*: Beban puncak dipertahankan selama periode waktu tertentu.
    3. *Ramp-Down*: Penurunan beban kembali ke 0.
  - **Identitas Visual**: Menggunakan palet bertema **Amber / Orange / Crimson Red**.
  - **Metrik Utama**: *Maximum Throughput Capacity*, *Error Spike Points*, dan *Recovery Rate*.

### 4.3 Dynamic User Generator (1 VU = 1 Pasien Asli)
Sistem **tidak menggunakan data mock atau token tiruan**.
- Ketika pengguna memilih beban 25 VUs, skrip k6 secara otomatis memanggil fungsi `generateDynamicUsers(25)`:
  - Akun 1: `patient.k6.1@tara.health`
  - Akun 2: `patient.k6.2@tara.health`
  - ...
  - Akun 25: `patient.k6.25@tara.health`
- Tahap `setup()` k6 melakukan HTTP POST nyata ke Identity Service untuk mengautentikasi setiap akun unik dan memperoleh 25 token JWT RS256 asli.
- Setiap VU mengemulasikan pasien yang berbeda, mencegah konflik data sesi antar pengguna.

### 4.4 Metrik Validasi Trafik Nyata (*Anti-Mocking Telemetry*)
Untuk menjamin kejujuran pengujian tanpa manipulasi (*zero mocking*), k6 merekam metrik khusus:
1. `real_microservice_transactions`: Penghitung (*counter*) fisik transaksi yang berhasil menembus database microservice.
2. `real_data_bytes_downloaded`: Jumlah byte data aktual yang ditarik dari tabel database.
3. `real_server_latency_ms`: Waktu pemrosesan murni container server.
4. `pure_ai_chat_latency_ms`: Durasi komputasi inferensi model kecerdasan buatan.

---

## 5. FITUR RANCANG ALUR (*CUSTOM DYNAMIC FLOW BUILDER*)

Fitur ini memberikan kebebasan bagi engineer dan QA untuk merancang simulasi perjalanan pasien (*User Journey*) secara fleksibel dan menyimpannya ke database.

### 5.1 Perbedaan Mendasar: Rancang Alur vs Uji Service
| Aspek | Rancang Alur (*User Journey Flow*) | Uji Service (*Isolated Service Probing*) |
| :--- | :--- | :--- |
| **Cakupan** | Menguji rantai multi-layanan secara berurutan (End-to-End). | Menguji satu endpoint layanan secara terisolasi. |
| **Konsep** | Meniru perilaku nyata pasien (Login -> Cari Poli -> Buat Tiket -> Konsultasi). | Mengukur kapasitas puncak (*benchmark throughput*) fungsi tunggal. |
| **Dependensi Data** | Output dari Langkah 1 diteruskan ke Langkah 2. | Data bersifat statis per-permintaan. |
| **Contoh Kasus** | Simulasi alur konsultasi AI lengkap 5 tahap. | Stres tes endpoint `GET /api/articles` hingga 1000 RPS. |

### 5.2 Mekanisme Context Injection Dinamis
Pada fitur Rancang Alur, k6 memiliki kemampuan ekstraksi variabel otomatis (*dynamic state extraction*):
- **Token Injection**: Token hasil autentikasi dari langkah pertama otomatis disuntikkan ke header `Authorization: Bearer {{TOKEN}}` pada langkah-langkah berikutnya.
- **Consultation ID Injection**: ID sesi konsultasi yang dikembalikan dari `POST /api/consultations` otomatis diekstrak dan disuntikkan ke URL atau body langkah chat berikutnya:
  ```json
  {
    "category": "GENERAL",
    "mode": "HEALTH_CARE",
    "language": "id",
    "messages": [{ "role": "user", "content": "Keluhan saya..." }],
    "consultationId": "{{consultId}}"
  }
  ```
- **Session & Slug Propagation**: Mendukung variabel dinamis seperti `{{sessionId}}`, `{{slug}}`, `{{VU_ID}}`, dan `{{VU_EMAIL}}`.

### 5.3 Proteksi Eksekusi *Fail-Fast*
Jika terjadi kegagalan pada suatu langkah (misalnya Tahap 2 gagal dengan HTTP 500):
- k6 secara cerdas **langsung membatalkan langkah berikutnya** untuk VU tersebut (`break`).
- Sistem **tidak akan melompat sembarangan** ke Tahap 3 tanpa prasyarat data dari Tahap 2, mencegah data sampah (*dirty data*) dan log yang menyesatkan.

### 5.4 Alur Bawaan Sistem (*Preset Flows*)
Tersedia 3 alur skenario medis terintegrasi:
1. **Flow 1: Konsultasi Chat Dokter AI**
   - Tahap 1: `GET /api/consultations/active` (Cek sesi aktif).
   - Tahap 2: `POST /api/consultations` (Buat tiket konsultasi baru).
   - Tahap 3: `POST /api/consultation/chat` (Kirim keluhan & terima streaming AI).
   - Tahap 4: `GET /api/consultations/:id` (Baca riwayat & hasil resume medis).
   - Tahap 5: `GET /health/ready` (Verifikasi stabilitas container).
2. **Flow 2: Edukasi Medis & Aktivitas Gaya Hidup**
   - Tahap 1: `GET /api/articles` (Katalog artikel kesehatan).
   - Tahap 2: `GET /api/articles/8-efek-begadang-yang-buruk-untuk-kesehatan` (Baca detail artikel).
3. **Flow 3: Chat Dokter Spesialis (Live Consult)**
   - Tahap 1: `GET /api/live-consult` (Daftar antrean dokter spesialis).
   - Tahap 2: `POST /api/live-consult` (Pemesanan sesi dokter spesialis).
   - Tahap 3: `WS /api/live-consult/ws` (Koneksi chat interaktif real-time).

---

## 6. FITUR UJI SERVICE (*ISOLATED SERVICE PROBING*)

Modul ini ditujukan untuk analisis teknis mendalam terhadap performa per-kontainer:
- Memungkinkan pemilihan service individual: *Identity Service*, *Lifestyle Service*, *Live Consult Service*, *AI Consultation Service*, *Health Profile Service*, atau *Medical Record Service*.
- Mengukur batas latensi minimum dan *concurrency handling* murni dari satu microservice tanpa dipengaruhi oleh latensi layanan lainnya.

---

## 7. ANALISIS CERDAS GOOGLE GEMINI AI (RCA & REKOMENDASI)

Dashboard dilengkapi dengan asisten cerdas berbasis **Google Gemini 2.5 Flash API**:
- **Otomatisasi Root Cause Analysis (RCA)**: Begitu pengujian beban selesai, log ringkasan k6 otomatis dikirimkan ke model Gemini.
- **Keluaran Analisis**:
  1. **Executive Verdict**: Penilaian kualitatif performa sistem (Lolos / Perlu Perhatian / Kritis).
  2. **Identifikasi Bottleneck**: Menemukan sumber kendala spesifik (misalnya: *Upstream LLM Auth Failure 502*, *Database Connection Pool Exhaustion*, atau *High Latency on Redis Locks*).
  3. **Rekomendasi Arsitektural**: Langkah konkret mitigasi teknis (penyesuaian ukuran worker pool, autoscaling pod, optimasi query SQL, atau penyesuaian durasi cache).

---

## 8. RIWAYAT PENGUJIAN & MANAJEMEN DATA (MYSQL MARIADB)

Seluruh metadata pengujian, alur kustom, dan metrik historis dipersistensikan secara andal ke database relasional **MySQL MariaDB**:
- **Tabel `stress_test_flows`**: Menyimpan konfigurasi skenario pengujian dinamis (nama alur, konfigurasi otentikasi, langkah-langkah URL, payload JSON, dan header).
- **Tabel `stress_test_history`**: Menyimpan rekam jejak eksekusi pengujian (waktu mulai, durasi, total VUs, total request, error rate, latensi P95/P99, log stdout k6, dan laporan analisis Gemini AI).
- **Tabel `service_metrics`**: Menyimpan time-series metrik utilisasi CPU, memori, dan latensi untuk keperluan analisis tren jangka panjang.

---

## 9. STRUKTUR KODE & LOKASI FILE PROYEK

Berikut adalah peta penempatan berkas utama dalam repositori:

```text
d:/SEMESTER 7/Tara_ai/
├── Dashboard-Service-Monitoring/              # Platform Observabilitas & Load Testing
│   ├── stress-test.js                         # Engine k6 kustom (Dynamic VUs, Fail-fast, Real metrics)
│   ├── bin/k6.exe                             # Binary eksekusi Grafana k6
│   ├── monitoring-backend/                    # Server Express.js & Socket.io
│   │   ├── src/routes/stressTest.route.js     # Orchestrator k6 process & Gemini AI analysis
│   │   ├── src/services/geminiService.js      # Integrasi Google Gemini 2.5 Flash
│   │   ├── src/services/metricsCollector.js   # Prometheus poller & system health check
│   │   └── .env                               # Konfigurasi database MySQL & target endpoints
│   └── monitoring-frontend/                   # Antarmuka Pengguna React + Vite
│       ├── src/components/StressTesting/      # Modul UI Load/Stress Test, Rancang Alur, Logs
│       ├── src/components/Charts/             # Visualisasi grafik Recharts
│       └── src/pages/Dashboard.jsx            # Tampilan utama observabilitas
├── ai-consultation-service/                   # Microservice Konsultasi AI (Port 4006)
│   ├── src/routes/chat.ts                     # Definisi schema Zod chat SSE
│   ├── src/routes/chat-turn.ts                # Logika turn lock Redis & panggilan upstream AI
│   └── src/services/ai-client.ts              # HTTP client ke BPJS AI LLM
├── identity-service/                          # Microservice Otentikasi Pasien (Port 8080)
├── lifestyle-service/                         # Microservice Edukasi & Gaya Hidup (Port 4005)
├── live-consult-service/                      # Microservice Telekonsultasi Spesialis (Port 4004)
├── health-profile-service/                    # Microservice Profil Rekam Medis (Port 3001)
└── medical-record-service/                    # Microservice RME & Dokumen Klinis (Port 3002)
```

---
*Dokumentasi ini disusun secara komprehensif sebagai acuan teknis operasional, pengujian mutu perangkat lunak (*Software Quality Assurance*), dan pertanggungjawaban arsitektur sistem.*
