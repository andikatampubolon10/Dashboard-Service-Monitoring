# Backup Data Monitoring Backend

Folder ini berisi cadangan konfigurasi utama sistem monitoring:
- **`projects.json`**: Data daftar projek dan pemetaan server ke projek.
- **`registered_servers.json`**: Data seluruh server target monitoring (Server 1 & 2 GCP, port, kredensial SSH, database).
- **`dynamic_services.json`**: Data 7 microservice dan endpoint scraping Prometheus.

### Cara Restore (Jika Diperlukan):
Salin kembali file-file di atas ke folder utama `monitoring-backend/data/`:
```bash
cp data_backup/*.json data/
```
Atau di PowerShell:
```powershell
Copy-Item data_backup\*.json data\ -Force
```
Lalu restart backend monitoring.
