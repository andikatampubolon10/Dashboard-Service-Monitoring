# Dashboard Service Monitoring

## Alur CI/CD

Jenkins menjalankan pipeline setiap kali ada push ke repository:

1. Checkout source code.
2. Menjalankan `terraform init` dan `terraform validate`.
3. Membuat `terraform plan` untuk production.
4. Membuat dan menjalankan Docker Compose development secara otomatis.
5. Menampilkan pertanyaan approval di console Jenkins: `Upload perubahan ke production?`.
6. Jika disetujui, menjalankan `terraform apply` dan Docker Compose production.

Jika approval ditolak atau timeout, tahap production tidak dijalankan.

## Prasyarat Jenkins

Node Jenkins yang menjalankan pipeline perlu memiliki:

- Docker Engine dan Docker Compose v2.
- Terraform versi 1.5 atau lebih baru.
- Label node `Jenkins`.
- Agent Jenkins menggunakan Windows, sehingga Docker Desktop dan Terraform harus tersedia di `PATH`.
- Trigger job `Build when a change is pushed to GitHub` atau webhook SCM yang sesuai.

Tambahkan webhook repository ke URL Jenkins `/github-webhook/` dan gunakan Pipeline job dengan `Jenkinsfile` dari SCM.

## Menjalankan Compose secara manual

Development:

```sh
terraform -chdir=terraform init
terraform -chdir=terraform workspace select development || terraform -chdir=terraform workspace new development
terraform -chdir=terraform apply -var="environment=development"
docker compose -f docker/docker-compose.dev.yml up -d --build
```

Production:

```sh
terraform -chdir=terraform workspace select production || terraform -chdir=terraform workspace new production
terraform -chdir=terraform apply -var="environment=production"
docker compose -f docker/docker-compose.prod.yml up -d --build
```

Image saat ini menggunakan Nginx sebagai baseline karena source aplikasi belum tersedia di repository. Ganti isi `docker/Dockerfile` dengan build aplikasi ketika source service sudah ditambahkan.