# 📊 DOKUMENTASI LENGKAP FITUR SISTEM: OBSERVEPULSE MONITORING & STRESS TESTING PLATFORM

Dokumen ini menyajikan panduan komprehensif seluruh fitur, kapabilitas teknis, modul observabilitas, mesin pengujian performa (*load & stress testing*), serta integrasi kecerdasan buatan (Google Gemini SRE Engine) yang tersedia di dalam ekosistem **ObservePulse - Dashboard Service Monitoring**.

---

## 📑 DAFTAR ISI

1. [Ringkasan Platform & Nilai Tambah](#1-ringkasan-platform--nilai-tambah)
2. [Diagram Arsitektur & Alur Data Sistem](#2-diagram-arsitektur--alur-data-sistem)
3. [Fitur Dashboard Utama (Fleet Overview)](#3-fitur-dashboard-utama-fleet-overview)
   - 3.1 Ringkasan KPI Armada (*Fleet Glanceable Cards*)
   - 3.2 Filter Hirarki Dinamis Per-Projek (*Database-Backed Filter*)
   - 3.3 Modal Aksi Cepat (*Quick Action Modals*)
   - 3.4 Tabel Pemantauan Node Server & Microservices
4. [Pusat Perhatian & Deteksi Anomali Kritis (Attention Center)](#4-pusat-perhatian--deteksi-anomali-kritis-attention-center)
   - 4.1 Logika Deteksi Masalah Otomatis
   - 4.2 Tindakan Pemulihan Cepat
5. [Tips Penanganan AI (Gemini SRE) & Live Diagnostics](#5-tips-penanganan-ai-gemini-sre--live-diagnostics)
   - 5.1 Analisis Akar Masalah Otomatis (*Root Cause Analysis*)
   - 5.2 Perintah CLI Bertahap Siap Salin (*Ready-to-Run Bash Scripts*)
   - 5.3 Saran Tindakan Pencegahan Jangka Panjang
6. [Fitur Generator Prompt AI untuk External Agent](#6-fitur-generator-prompt-ai-untuk-external-agent)
   - 6.1 Tujuan & Alur Pendelegasian Tugas ke Agent Eksternal
   - 6.2 Tiga Profil / Target AI Agent (Universal, Terminal, Deep Analysis)
   - 6.3 Input Catatan Tambahan Operator
   - 6.4 Fitur Salin 1-Klik & Ekspor File Markdown (`.md`)
7. [Modul Manajemen Projek (Multi-Tenant Hierarchy)](#7-modul-manajemen-projek-multi-tenant-hierarchy)
   - 7.1 Struktur Hirarki: Projek ➔ Server Node ➔ Microservice
   - 7.2 Klasifikasi Environment (Production, Staging, Development)
   - 7.3 Agregasi Metrik & SLA Kesehatan Projek
   - 7.4 Analisis Kesehatan Projek Berbasis AI (*AI Project Health Insight*)
8. [Modul Pemantauan Server Node (Infrastructure Monitoring)](#8-modul-pemantauan-server-node-infrastructure-monitoring)
   - 8.1 Telemetri Host Linux & VM Terperinci
   - 8.2 Pemantauan Multi-Database (PostgreSQL, MySQL, MongoDB, Redis)
   - 8.3 Pemantauan Status Kontainer Docker & Node Exporter
9. [Modul Observabilitas Microservices (APM & 7 Tab Analisis Mendalam)](#9-modul-observabilitas-microservices-apm--7-tab-analisis-mendalam)
   - 9.1 Tab Overview (SLA Uptime, Throughput RPS, Error Rate, Latency P95/P99)
   - 9.2 Tab Requests (Volume & Distribusi Kode Status HTTP)
   - 9.3 Tab Errors (Top Error Endpoints & Stack Traces)
   - 9.4 Tab Latency (Persentil P50-P99 & Deteksi Slow Queries)
   - 9.5 Tab Logs (Streaming Log Kontainer Real-Time)
   - 9.6 Tab Dependencies (Peta Topologi Ketergantungan Layanan)
   - 9.7 Tab Alerts (Aturan Ambang Batas & Riwayat Peringatan)
10. [Mesin Pengujian Beban & Simulasi (Stress & Load Testing Simulator)](#10-mesin-pengujian-beban--simulasi-stress--load-testing-simulator)
    - 10.1 Dual Mode Testing: Load Test vs Stress Test
    - 10.2 Dynamic User Generator (1 VU = 1 Pasien/User Riil)
    - 10.3 Metrik Anti-Mocking (Pengukuran Transaksi Database Fisik)
    - 10.4 Rancang Alur Kustom (*Custom Dynamic Flow Builder*) & Context Injection
    - 10.5 Uji Service Terisolasi (*Isolated Service Probing*)
    - 10.6 Telemetri Streaming WebSocket Real-Time
    - 10.7 Analisis Otomatis Google Gemini AI (RCA & Rekomendasi SRE)
    - 10.8 Riwayat & Arsip Pengujian (Database MySQL MariaDB)
11. [Arsitektur Teknis Backend, Kolektor & Keamanan](#11-arsitektur-teknis-backend-kolektor--keamanan)
    - 11.1 Prometheus Collector & Fast TCP Prober
    - 11.2 SSH Tunneling untuk Node Server Privat
    - 11.3 Sinkronisasi Real-Time Socket.IO
    - 11.4 Dual-Persistence: MySQL Hosting & Resilient JSON Cache
12. [Panduan Menjalankan Sistem (*Quick Start*)](#12-panduan-menjalankan-sistem-quick-start)

---

## 1. RINGKASAN PLATFORM & NILAI TAMBAH

**ObservePulse** adalah platform observabilitas dan simulasi performa tingkat enterprise yang dirancang khusus untuk memantau, mendiagnosis, dan menguji ketahanan infrastruktur komputasi awan (*cloud infrastructure*), node server Linux, database relasional/NoSQL, dan ekosistem microservices.

### Keunggulan Utama Sistem:
* **Observabilitas Terpadu (Unified Observability):** Menggabungkan metrik infrastruktur host (CPU, Memory, Disk IOPS, Network), status database, dan Application Performance Monitoring (APM) microservices ke dalam satu antarmuka modern.
* **Diagnostik Cerdas Berbasis AI (Gemini SRE Engine):** Mengidentifikasi akar masalah (*root cause*) dan merumuskan panduan pemecahan insiden secara otomatis beserta perintah terminal Linux/Docker yang siap dieksekusi.
* **Ekspor Prompt AI untuk Agen Eksternal:** Menjembatani sistem monitoring dengan AI coding agent modern (Cursor, Antigravity IDE, Claude Code, ChatGPT, Claude) melalui generator prompt terstruktur sekali klik.
* **Mesin Pengujian Beban Terintegrasi (k6 Engine):** Simulator beban interaktif berbasis Grafana k6 dengan pengujian multi-tahap, token autentikasi dinamis (1 VU = 1 user riil), dan metrik anti-manipulasi (*anti-mocking*).
* **Multi-Tenant Project Hierarchy:** Mengelompokkan infrastruktur ke dalam domain proyek dan lingkungan terpisah (*Production, Staging, Development*).

---

## 2. DIAGRAM ARSITEKTUR & ALUR DATA SISTEM

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         OBSERVEPULSE MONITORING DASHBOARD                        │
│               Frontend: React 18 + Vite + TailwindCSS + Recharts                 │
│                   Port: 5173 | UI Glassmorphism Dark Theme                       │
└───────────────────────▲──────────────────────────────────▲───────────────────────┘
                        │ HTTP REST API                    │ WebSocket Real-Time
                        ▼                                  ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         MONITORING BACKEND (Node.js/Express)                     │
│               Port: 5000 | WebSocket Server (Socket.IO) | Node-Cron             │
├──────────────────────────────────────────────────────────────────────────────────┤
│ • Background Scraper: Prometheus Exporters & Fast TCP Probes                     │
│ • System Telemetry: Systeminformation & SSH Tunnel Manager                       │
│ • SRE AI Engine: Google Gemini 2.5 Flash API + Fallback Heuristik                │
│ • Testing Orchestrator: Grafana k6 Child Process Runner                          │
└──────────────┬───────────────────────────┬───────────────────────────┬───────────┘
               │                           │                           │
               ▼                           ▼                           ▼
┌──────────────────────────────┐ ┌───────────────────────────┐ ┌───────────────────┐
│     MYSQL / MARIADB HOST     │ │   GOOGLE CLOUD PLATFORM   │ │  UPSTREAM LLM /   │
│  (sotardoc_server_monitoring)│ │     VM 1 (34.101.207.115) │ │    AI SERVICES    │
├──────────────────────────────┤ │     VM 2 (34.101.122.171) │ ├───────────────────┤
│ • projects                   │ ├───────────────────────────┤ │ • Gemini 2.5 Flash│
│ • servers & services         │ │ • Docker Microservices    │ │ • BPJS AI LLM     │
│ • stress_test_flows          │ │ • PostgreSQL, Redis, Mongo│ │ • Multi-Agent API │
│ • stress_test_history        │ │ • Node Exporter (Port 9100│ └───────────────────┘
│ • service_metrics            │ └───────────────────────────┘
└──────────────────────────────┘
```

---

## 3. FITUR DASHBOARD UTAMA (FLEET OVERVIEW)

Halaman utama dashboard (`/`) menyediakan ringkasan kesehatan seluruh infrastruktur yang mudah dipahami (*glanceable*):

### 3.1 Ringkasan KPI Armada (*Fleet Glanceable Cards*)
* **Status Node Server:** Total server aktif vs offline beserta indikator persentase SLA cluster.
* **Status Microservices:** Total service yang berjalan (*HEALTHY*) vs service yang mengalami kegagalan respons.
* **Database Cluster Status:** Pemantauan instan ketersediaan database (PostgreSQL, MySQL, Redis, MongoDB).
* **Rata-Rata Utilisasi CPU & Storage:** Indikator beban agregat seluruh armada node server.

### 3.2 Filter Hirarki Dinamis Per-Projek (*Database-Backed Filter*)
* **Dropdown Filter Projek:** Memungkinkan operator menyaring tampilan dashboard untuk melihat:
  * `🌐 Seluruh Fleet (Semua Projek)`: Menampilkan seluruh node dan service dari semua domain.
  * `📁 [Nama Projek] ([ENV])`: Menyaring server, service, dan metrik yang terdaftar pada projek tertentu (contoh: *Tara AI (PRODUCTION)*).
* **Sinkronisasi Otomatis Database:** Data proyek diambil langsung dari database MySQL secara *real-time* dengan mekanisme *auto-polling* interval (setiap 15 detik), memastikan perubahan daftar proyek langsung terbarui tanpa perlu me-refresh halaman manual.

### 3.3 Modal Aksi Cepat (*Quick Action Modals*)
* **`+ Server ke Projek`:** Menghubungkan node server yang ada ke domain proyek tertentu beserta konfigurasi tag dan perannya.
* **`+ Projek Baru`:** Form ringkas untuk mendaftarkan proyek baru beserta target environment (*Production / Staging / Development*).
* **Tombol Refresh Manual:** Memicu penyegaran instan metrik telemetri, ketersediaan port, dan status database.

### 3.4 Tabel Pemantauan Node Server & Microservices
* **Daftar Server Node:** Menampilkan host IP, utilisasi CPU %, pemakaian Memory, penggunaan Disk %, status Load Average (1m/5m/15m), dan tautan detail.
* **Daftar Microservices:** Menampilkan nama layanan, host server, port, stack teknologi, throughput RPS (permintaan per detik), latensi P99, serta status kesehatan real-time.

---

## 4. PUSAT PERHATIAN & DETEKSI ANOMALI KRITIS (ATTENTION CENTER)

Komponen **Attention Center** berfungsi sebagai sistem deteksi dini (*Early Warning System*) yang secara proaktif mendeteksi titik kegagalan (*single point of failure*) pada infrastruktur sebelum menyebabkan *downtime* fatal.

### 4.1 Logika Deteksi Masalah Otomatis
Sistem secara otomatis mengevaluasi telemetri berikut:
1. **Kejenuhan Storage/Disk Server (Kapasitas $\ge 85\%$):**
   * Peringatan **WARNING** jika terpakai $\ge 85\%$.
   * Peringatan **CRITICAL** jika terpakai $\ge 90\%$.
   * Menampilkan kapasitas terpakai dalam GB dan sisa ruang kosong.
2. **Lonjakan Beban CPU & Load Average:**
   * Terpicu jika utilisasi CPU server $\ge 85\%$ atau Load Average 1-menit melebihi 2x jumlah core CPU fisik.
3. **Microservice Offline / Health Probe Gagal:**
   * Terpicu secara instan berstatus **CRITICAL** jika probe TCP/HTTP gagal merespon ketersediaan port.
4. **Infrastruktur Projek Mengalami Degradasi (*Project Degraded*):**
   * Terpicu jika salah satu server di dalam domain projek mengalami kehabisan resource atau berstatus kritis.

### 4.2 Tindakan Pemulihan Cepat
Setiap kartu anomali pada Attention Center dilengkapi dengan 3 tombol tindakan:
* **Tangani Masalah:** Langsung menuju halaman detail server/service terkait.
* **Tips AI:** Membuka modal diagnostik cerdas Gemini SRE dengan panduan CLI terperinci.
* **Prompt AI:** Membuka modal dan langsung menampilkan prompt terstruktur siap salin untuk agen AI eksternal.

---

## 5. TIPS PENANGANAN AI (GEMINI SRE) & LIVE DIAGNOSTICS

Modal **Tips Penanganan AI** bertindak sebagai asisten insinyur SRE (*Site Reliability Engineer*) virtual yang diintegrasikan langsung dengan **Google Gemini 2.5 Flash**:

### 5.1 Analisis Akar Masalah Otomatis (*Root Cause Analysis*)
Model AI menganalisis gejala insiden secara mendalam berdasarkan telemetri real-time:
* Mendiagnosis penyebab kontainer crash loop (*OOMKilled, port collision EADDRINUSE, syntax error, database disconnect*).
* Menilai kejenuhan inode, penumpukan log kontainer (`json-file`), atau cache image Docker yang menggantung.

### 5.2 Perintah CLI Bertahap Siap Salin (*Ready-to-Run Bash Scripts*)
Menghasilkan langkah pemulihan taktis beserta baris perintah terminal yang aman dijalankan:
* Tombol **Salin** individual pada setiap blok perintah CLI bash/docker.
* Tombol **Salin Semua Perintah** untuk menyalin seluruh rangkaian perintah CLI sekaligus.

### 5.3 Saran Tindakan Pencegahan Jangka Panjang
Memberikan rekomendasi pencegahan arsitektural (misalnya: penyesuaian logging driver Docker `max-size: 50m`, penambahan kuota memory limit pada `docker-compose.yml`, serta pemasangan cron job pembersihan).

---

## 6. FITUR GENERATOR PROMPT AI UNTUK EXTERNAL AGENT

Fitur inovatif ini dirancang untuk memudahkan operator mendelegasikan penyelesaian insiden secara instan ke agen AI eksternal (seperti **Cursor IDE, Antigravity IDE, Claude Code, Devin, ChatGPT, Claude, atau GitHub Copilot**).

```text
┌─────────────────────────────────┐
│     INSIDEN TERDETEKSI          │
│   (ObservePulse Dashboard)      │
└────────────────┬────────────────┘
                 │
                 ▼ 1-Klik Generate
┌────────────────────────────────────────────────────────┐
│             GENERATOR PROMPT AI OBSERVABILITY          │
│  • Pilihan Profil: Universal / Terminal / Deep Analysis│
│  • Konteks Lengkap: Host, Port, Telemetri, Akar Masalah│
│  • Perintah CLI & Kriteria Pengujian HTTP 200 OK       │
└────────────────┬───────────────────────────────────────┘
                 │
                 ▼ Salin ke Clipboard / Download .md
┌────────────────────────────────────────────────────────┐
│                 EXTERNAL AI AGENTS                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  CURSOR IDE  │  │ ANTIGRAVITY  │  │ CLAUDE / GPT │  │
│  │(Eksekusi CLI)│  │ (Agentic AI) │  │(Analisis Kode│  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────────────────────────────────────────┘
```

### 6.1 Tiga Profil / Target AI Agent

| Profil Agent | Target Penggunaan | Karakteristik Prompt yang Dihasilkan |
| :--- | :--- | :--- |
| **🌟 Universal SRE (Default)** | Claude, ChatGPT, Gemini, DeepSeek, Copilot | Format Markdown terstruktur komprehensif memuat ringkasan insiden, metadata, akar masalah, tabel CLI commands, dan instruksi penanganan umum. |
| **💻 Terminal / Cursor / Antigravity** | Cursor, Antigravity IDE, Claude Code, Terminal Bots | Format instruksi berbasis tugas (*actionable task brief*). Mengarahkan agent mengeksekusi perintah CLI satu per satu di terminal, membaca log, dan menguji healthcheck. |
| **🧠 Deep Analysis (ChatGPT / Claude)** | ChatGPT Pro, Claude 3.5 Sonnet, Konsultasi Arsitek | Format investigasi mendalam berfokus pada analisis skenario kegagalan, evaluasi keamanan perintah CLI di production, dan rekomendasi perbaikan konfigurasi kode. |

### 6.2 Fitur Pendukung:
* **Catatan Tambahan Operator (Opsional):** Kolom input untuk menyisipkan catatan khusus (contoh: versi sistem operasi, informasi port forwarding, atau kredensial relevan) yang otomatis digabungkan ke dalam prompt.
* **Pratinjau Kode Real-Time (*Syntax-Highlighted Box*):** Tampilan monospace elegan dengan indikator jumlah karakter dan format Markdown.
* **Salin 1-Klik (`Salin Seluruh Prompt` / `Salin Prompt AI`):** Tersedia di bilah atas pratinjau, banner panduan langkah, dan footer modal.
* **Unduh File (`.md`):** Mengunduh berkas markdown dengan nama file terstruktur `prompt-agent-[target]-[preset].md` untuk disimpan di repositori lokal atau dilampirkan ke tiket insiden (Jira/GitHub Issues).

---

## 7. MODUL MANAJEMEN PROJEK (MULTI-TENANT HIERARCHY)

Modul Projek (`/projects` & `/projects/:id`) mengorganisir infrastruktur berdasarkan domain bisnis dan lingkungan aplikasi.

### 7.1 Struktur Hirarki Data
```text
Project (Nama, Deskripsi, Environment, SLA Score)
 └── Server Node (Host IP, CPU, Memory, Disk, Databases)
      └── Microservice (Container, Port, Endpoint Health, APM)
```

### 7.2 Fitur-Fitur Manajemen Projek:
* **Katalog Projek:** Melihat daftar seluruh projek beserta jumlah server, jumlah microservices, dan status kesehatan agregat (*HEALTHY / DEGRADED / CRITICAL*).
* **Klasifikasi Lingkungan (*Environment*):** Pengelompokan berdasarkan *PRODUCTION*, *STAGING*, atau *DEVELOPMENT*.
* **CRUD Operasi Lengkap:** Form pembuatan projek baru, edit data deskripsi, penambahan atau pencabutan server dari projek, serta penghapusan projek.
* **Halaman Detail Projek (`/projects/:id`):**
  * Tampilan topologi server yang terhubung.
  * Metrik rata-rata CPU %, utilisasi Memory, dan kapasitas Disk agregat seluruh server dalam domain projek.
  * **AI Project Health Insight:** Tombol analisis kecerdasan buatan berbasis Gemini untuk mengevaluasi stabilitas dan risiko bottleneck infrastruktur projek secara holistik.

---

## 8. MODUL PEMANTAUAN SERVER NODE (INFRASTRUCTURE MONITORING)

Modul Server (`/servers` & `/servers/:id`) menyediakan telemetri mendalam dari setiap mesin fisik atau Virtual Machine (VM) yang terdaftar:

### 8.1 Telemetri Host Linux & VM
* **Spesifikasi & Info Sistem:** Hostname, alamat IP, sistem operasi, uptime, arsitektur CPU, dan jumlah core.
* **Utilisasi CPU & Load Average:** Grafik utilisasi real-time serta rata-rata antrean proses 1 menit, 5 menit, dan 15 menit.
* **Rincian Memori RAM:** Total memori, memori terpakai (*used*), memori bebas (*free*), serta alokasi *buffers/cached*.
* **Partisi Storage & Disk IOPS:** Kapasitas per-mountpoint (`/`, `/data`), persentase penggunaan, status sisa, serta throughput *read/write* disk (MB/s).
* **Lalu Lintas Jaringan (*Network Traffic*):** Throughput transmisi data masuk (*RX*) dan keluar (*TX*) dalam KB/s dan bytes/sec.

### 8.2 Pemantauan Multi-Database
Sistem secara otomatis mendeteksi dan memantau status engine database yang berjalan di server:
* **PostgreSQL:** Status koneksi, latensi query, jumlah database aktif.
* **MySQL / MariaDB:** Ketersediaan port, active connections, dan waktu respon.
* **MongoDB:** Status replika dan konektivitas driver.
* **Redis:** Status ping, memory usage, dan turn-lock cache status.

### 8.3 Pemantauan Kontainer Docker & Node Exporter
* Integrasi dengan **Prometheus Node Exporter** (Port 9100) untuk scraping metrik Linux standar industri.
* Pengecekan status kontainer aktif (`running`, `restarting`, `exited`).

---

## 9. MODUL OBSERVABILITAS MICROSERVICES (APM & 7 TAB ANALISIS MENDALAM)

Setiap microservice memiliki dasbor Application Performance Monitoring (APM) mandiri (`/services/:id`) yang terbagi ke dalam 7 tab analisis:

### 9.1 Tab Overview
* **Status Utama:** Indikator visual ketersediaan layanan (*HEALTHY* / *UNHEALTHY*).
* **SLA Uptime:** Persentase keandalan operasional selama periode waktu pemantauan.
* **Throughput (RPS):** Volume trafik permintaan per detik yang diproses.
* **Error Rate (%):** Persentase kegagalan permintaan (HTTP 4xx & 5xx).
* **Latensi P95 & P99:** Indikator waktu respon untuk 95% dan 99% pengguna.

### 9.2 Tab Requests
* Visualisasi grafik volume permintaan *time-series*.
* Distribusi metode HTTP (*GET, POST, PUT, DELETE*).
* Komposisi kode status HTTP (2xx Sukses, 3xx Redirect, 4xx Client Error, 5xx Server Error).

### 9.3 Tab Errors
* Daftar endpoint dengan frekuensi error tertinggi.
* Analisis rincian error (*Error categorization*): timeout, database error, validation failure, atau upstream LLM failure.
* Log cuplikan stack trace error terkini.

### 9.4 Tab Latency
* Grafik persentil latensi: P50 (median), P90, P95, dan P99.
* Deteksi query atau endpoint lambat (*Slow transactions detector*).

### 9.5 Tab Logs
* Aliran log langsung (*Live container stdout/stderr stream*).
* Penyaringan level log: `INFO`, `WARN`, `ERROR`, `DEBUG`.
* Pencarian teks bebas (*keyword search*) di dalam file log.

### 9.6 Tab Dependencies
* Diagram visual ketergantungan layanan:
  * Layanan upstream yang memanggil service ini.
  * Layanan downstream yang dipanggil (misalnya database PostgreSQL, cache Redis, broker Kafka, atau API pihak ketiga).

### 9.7 Tab Alerts
* Konfigurasi aturan ambang batas (*threshold rules*) untuk latensi tinggi, lonjakan error rate, dan kegagalan kontainer.
* Riwayat insiden dan log notifikasi peringatan.

---

## 10. MESIN PENGUJIAN BEBAN & SIMULASI (STRESS & LOAD TESTING SIMULATOR)

Modul **Simulator Stress Test** (`/stress-test`) adalah engine pengujian beban bawaan berbasis **Grafana k6** yang dirancang untuk menguji kapasitas batas microservices secara ilmiah.

### 10.1 Dual Mode Testing
1. **🟢 Load Test (Single-Wave Concurrent Iteration):**
   * Mensimulasikan lonjakan pengguna bersamaan (*concurrent users*) dalam 1 gelombang serentak.
   * Cocok untuk menguji kapasitas *baseline throughput* dan konkurensi awal.
2. **🔴 Stress Test (Sustained Ramping & Trapezoid Stages):**
   * Mengeksekusi pengujian multi-tahap berbentuk trapesium:
     * **Stage 1 (Ramp-up):** Peningkatan beban secara bertahap dari 0 ke target VUs.
     * **Stage 2 (Sustained Peak):** Mempertahankan beban puncak selama durasi stabil untuk menguji kebocoran memori (*memory leaks*) dan *connection pooling*.
     * **Stage 3 (Cool-down):** Penurunan beban bertahap menuju 0 untuk menguji kemampuan pemulihan sistem (*self-healing*).

### 10.2 Dynamic User Generator (1 VU = 1 User Riil)
* Setiap Virtual User (VU) yang diinisiasi oleh k6 merepresentasikan akun pengguna unik (contoh: `patient.k6.1@tara.health`, `patient.k6.2@tara.health`, dst.).
* Tahap `setup()` k6 melakukan panggilan autentikasi nyata ke **Identity Service** untuk memperoleh **JWT RS256 token** asli bagi setiap VU, menghindari tabrakan sesi atau *rate-limiting* akun tunggal.

### 10.3 Metrik Anti-Mocking (*Zero Mocking Verification*)
Untuk menjamin kejujuran hasil pengujian, sistem merekam metrik telemetri fisik:
* `real_microservice_transactions`: Jumlah transaksi fisik yang berhasil menembus database microservice.
* `real_data_bytes_downloaded`: Volume byte data aktual yang ditarik dari tabel database.
* `real_server_latency_ms`: Waktu pemrosesan murni container server.
* `pure_ai_chat_latency_ms`: Durasi komputasi inferensi model kecerdasan buatan (LLM).

### 10.4 Rancang Alur Kustom (*Custom Dynamic Flow Builder*)
Engineer dapat menyusun skenario perjalanan pengguna (*User Journey*) multi-tahap secara visual:
* **Context Injection Otomatis:**
  * `{{TOKEN}}`: Token autentikasi dari langkah pertama otomatis disuntikkan ke header otorisasi langkah berikutnya.
  * `{{consultId}}`: ID sesi yang dihasilkan dari pembuatan tiket otomatis disuntikkan ke payload chat atau rekam medis.
  * `{{sessionId}}`, `{{slug}}`, `{{VU_ID}}`, `{{VU_EMAIL}}`.
* **Proteksi Fail-Fast:** Jika langkah awal gagal (misal HTTP 500 saat membuat sesi), k6 secara cerdas langsung menghentikan iterasi langkah berikutnya bagi VU tersebut untuk mencegah data kotor (*dirty data*).
* **Alur Bawaan Sistem (*Preset Flows*):**
  1. *Konsultasi Chat Dokter AI (5 Langkah).*
  2. *Edukasi Medis & Gaya Hidup (2 Langkah).*
  3. *Chat Dokter Spesialis / Live Consult (3 Langkah).*

### 10.5 Uji Service Terisolasi (*Isolated Service Probing*)
Pengujian terfokus pada satu endpoint spesifik untuk mengukur kapasitas puncak murni tanpa terpengaruh oleh latensi dependensi layanan lain.

### 10.6 Telemetri Streaming WebSocket Real-Time
* Selama k6 berjalan, stdout log terminal di-streaming secara real-time ke antarmuka pengguna via WebSocket.
* Indikator pengukur (*gauge*), grafik RPS instan, persentase error rate, dan grafik latensi terbarui setiap detik.

### 10.7 Analisis Otomatis Google Gemini AI (RCA & Rekomendasi SRE)
Setelah pengujian k6 selesai, seluruh metrik ringkasan otomatis dikirimkan ke model **Google Gemini**:
* **Executive Verdict:** Status kelayakan sistem (*Lolos / Butuh Optimasi / Gagal Kritis*).
* **Identifikasi Bottleneck:** Menemukan titik kegagalan spesifik (misal: *Upstream LLM Auth Failure 502*, *Database Pool Exhaustion*, atau *High Latency on Redis Locks*).
* **Rekomendasi Arsitektural:** Tindakan konkret penyesuaian infrastruktur (*tuning connection pool*, *scaling pod*, atau *caching optimization*).

### 10.8 Riwayat & Arsip Pengujian (Database MySQL MariaDB)
* Riwayat pengujian tersimpan permanen di tabel `stress_test_history`.
* Dilengkapi fitur pencarian, filter berdasarkan jenis alur/status, tampilan detail laporan lengkap, dan tombol uji ulang (*re-run*).

---

## 11. ARSITEKTUR TEKNIS BACKEND, KOLEKTOR & KEAMANAN

Backend `monitoring-backend` dibangun menggunakan Node.js dan Express dengan prinsip keandalan tinggi:

### 11.1 Prometheus Collector & Fast TCP Prober
* Poller berkala menggunakan `node-cron` mengikis (*scraping*) endpoint `/metrics` dari seluruh microservice dan host Node Exporter.
* Helper **Fast TCP Probe** melakukan verifikasi konektivitas soket dengan batas *timeout* presisi (1200ms) untuk mendeteksi port yang tertutup atau hang.

### 11.2 SSH Tunneling untuk Node Server Privat
* Mendukung pembuatan SSH Tunnel aman (`sshTunnelService`) untuk mengakses metrik pada cluster server atau node database yang berada di dalam jaringan privat / VPC tanpa IP publik terbuka.

### 11.3 Sinkronisasi Real-Time Socket.IO
* Server WebSocket (`Socket.IO`) memancarkan event pembaruan metrik ke seluruh klien frontend yang terhubung:
  * `metrics_update`: Pembaruan berkala seluruh metrik armada.
  * `status_change`: Notifikasi instan jika terjadi perubahan status kesehatan server atau service.
  * `stress_test_progress`: Streaming baris log dan metrik pengujian beban.

### 11.4 Dual-Persistence: MySQL Hosting & Resilient JSON Cache
* Data konfigurasi proyek, server, alur pengujian, dan riwayat disimpan di database online **MySQL / MariaDB Hosting** (`sotardoc_server_monitoring`).
* Dilengkapi mekanisme **Resilient Local JSON Backup** (`data/projects.json`, `data/servers.json`, dll). Jika koneksi ke database hosting terputus, backend secara otomatis beralih ke cache lokal tanpa mengalami *downtime* atau crash.

---

## 12. PANDUAN MENJALANKAN SISTEM (*QUICK START*)

### Prasyarat:
* Node.js v18+ atau v20+
* NPM
* Binary Grafana k6 (sudah disertakan di folder `bin/k6.exe`)
* Akses Internet untuk koneksi database MySQL hosting dan Gemini API

### Langkah Menjalankan:

#### 1. Jalankan Backend:
```powershell
cd monitoring-backend
npm install
npm run dev
```
*Backend akan berjalan di:* `http://localhost:5000`

#### 2. Jalankan Frontend:
```powershell
cd monitoring-frontend
npm install
npm run dev
```
*Frontend akan berjalan di:* `http://localhost:5173`

#### 3. Buka Dashboard di Browser:
Akses browser ke alamat: **`http://localhost:5173`**

---

*Dokumentasi ini disusun sebagai referensi resmi arsitektur sistem, operasional DevOps/SRE, jaminan mutu perangkat lunak (*Software Quality Assurance*), dan panduan kolaborasi tim.*
