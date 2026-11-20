# LOCAL UPDATE GUIDE — HEXA CORE

Tanggal: 2026-11-20

Dokumen ini menjelaskan cara menyamakan folder lokal VS Code dengan branch implementasi GitHub, serta perubahan yang sudah masuk ke branch tersebut.

## 1. Sumber perubahan

- Repository: `dawudsw0491-cell/erp-distribution`
- Branch sumber update: `work/hexa-core-implementation-20261120`
- Base: `master`
- Base SHA: `8eadef2a0cb7e03fa2eb3fdb194dee4987af2bfa`
- Head SHA saat dokumen dibuat: `06e6de2f06d451ef6c7a11899d02b5f2cc3aa13d`
- Pull Request: https://github.com/dawudsw0491-cell/erp-distribution/pull/1

Perubahan pada branch GitHub TIDAK otomatis mengubah file lokal VS Code. Sinkronisasi harus dilakukan dari terminal pada folder repository yang benar.

## 2. Prosedur aman update lokal

Jalankan perintah satu per satu di terminal VS Code, dari root repository.

### Langkah A — periksa kondisi lokal

```bash
git status
git branch --show-current
git log -1 --oneline
git remote -v
```

Pastikan remote `origin` mengarah ke repository yang benar.

Jika ada perubahan lokal yang belum disimpan, jangan lanjut pull sebelum perubahan itu di-commit atau di-backup. Jangan gunakan `git reset --hard`, `git clean -fd`, atau force pull.

### Langkah B — simpan pekerjaan lokal yang belum di-commit

Pilihan yang disarankan: commit pekerjaan lokal pada branch kerja lokal terlebih dahulu. Jika belum siap commit, buat backup folder/repository di luar folder kerja. Jangan menimpa perubahan lokal.

### Langkah C — ambil update remote

```bash
git fetch origin
```

### Langkah D — pindah atau buat branch implementasi

Jika branch sudah ada secara lokal:

```bash
git switch work/hexa-core-implementation-20261120
```

Jika branch belum ada secara lokal:

```bash
git switch --track -c work/hexa-core-implementation-20261120 origin/work/hexa-core-implementation-20261120
```

### Langkah E — fast-forward ke versi GitHub terbaru

```bash
git pull --ff-only origin work/hexa-core-implementation-20261120
```

Jika Git menolak karena diverged atau ada perubahan lokal, BERHENTI. Jangan force. Catat output `git status` dan `git log --oneline --decorate -5` untuk rekonsiliasi.

### Langkah F — verifikasi hasil

```bash
git status
git branch --show-current
git log -1 --oneline
```

Branch harus bernama `work/hexa-core-implementation-20261120` dan commit harus sama dengan HEAD GitHub terbaru. Working tree idealnya clean.

## 3. Ringkasan perubahan dibanding master

Perbandingan GitHub saat dokumen dibuat menunjukkan 48 commit di depan master, 0 commit di belakang master, dan 25 file berubah. Rincian file:

### File aplikasi yang diubah

- `app/master-data/page.tsx` — Master Data Hub diringkas menjadi satu pintu Product Management untuk pengelolaan produk.
- `app/product-attribute-values/actions.ts` — validasi dan penanganan duplikasi nilai atribut diperketat.
- `app/product-attribute-values/page.tsx` — perbaikan alur halaman nilai atribut.
- `app/product-models/actions.ts` — perbaikan action Product Model dan pengurangan logika berulang.
- `app/products/[id]/edit/edit-product-form.tsx` — penyederhanaan form edit, pemakaian rekomendasi klasifikasi bersama, dan alur model.
- `app/products/[id]/edit/page.tsx` — penyesuaian data yang disiapkan untuk form edit.
- `app/products/actions.ts` — validasi create/update produk, relasi brand/model/kategori, dan pengelolaan produk.
- `app/products/new/page.tsx` — penyesuaian data master untuk form tambah produk.
- `app/products/new/product-form.tsx` — penyederhanaan form produk dan pemakaian classifier bersama.
- `components/layout/erp-sidebar.tsx` — link kategori, Product Models, Product Attributes, dan Attribute Values dihapus dari navigasi sidebar.

PENTING: Penghapusan link navigasi bukan berarti route atau tabel database sudah dihapus. Route mandiri masih perlu diintegrasikan dan ditelusuri sebelum dihapus permanen.

### File database

- `database/50_hexa_core_harden_public_definer_function_execute.sql` — migration untuk membatasi eksekusi publik/anon pada tujuh fungsi SECURITY DEFINER yang telah diperiksa. Migration live sudah diterapkan dan diverifikasi di Supabase pada pekerjaan sebelumnya.

### Dokumentasi yang ditambahkan/diubah

- `docs/ARCHITECTURE.md`
- `docs/BACKLOG.md`
- `docs/CHANGELOG.md`
- `docs/DECISIONS.md`
- `docs/KNOWN_ISSUES.md`
- `docs/MASTER_DATA_ANALYSIS.md`
- `docs/MASTER_DATA_MAPPING.md`
- `docs/PROJECT_STATUS.md`
- `docs/REPOSITORY_AUDIT.md`
- `docs/TEST_EVIDENCE.md`
- `docs/VERIFICATION_REPORT_20261119.md`

### Helper bersama yang ditambahkan

- `lib/master-data/brands.ts` — helper server-side untuk pembuatan Brand.
- `lib/master-data/categories.ts` — definisi kategori utama bersama.
- `lib/master-data/product-classification.ts` — rekomendasi klasifikasi produk bersama.

## 4. Yang dihilangkan dan yang belum dihilangkan

### Sudah dihilangkan dari navigasi

- Link Kategori Produk pada sidebar.
- Link Product Models pada sidebar.
- Link Product Attributes pada sidebar.
- Link Product Attribute Values pada sidebar.
- Kartu-kartu area terpisah tersebut dari Master Data Hub; Product Management menjadi satu pintu kerja produk.

### Belum dihapus dari repository atau database

- File route halaman mandiri untuk kategori, model, atribut, dan nilai atribut belum dihapus.
- Tabel/kolom Product Model, Product Attributes, Attribute Values, Product Variant, dan relasinya belum dihapus.
- Data uji/demo tidak dihapus.
- Product Variant ID masih direferensikan oleh Purchasing dan Inventory. Identitas transaksionalnya tidak boleh dihapus tanpa migrasi seluruh konsumen.
- Kepemilikan SKU kanonis masih harus diputuskan karena live schema menyimpan `products.sku` dan `product_variants.variant_sku`.

## 5. Status validasi

- GitHub branch sudah diperbarui.
- Supabase migration keamanan yang disebut di atas sudah diterapkan dan diverifikasi pada pekerjaan sebelumnya.
- Tidak ada penghapusan tabel atau data pada perubahan navigasi terbaru.
- Build/lint/test otomatis belum boleh dianggap lulus hanya dari perubahan GitHub.
- Saat pemeriksaan terakhir, status deployment Vercel untuk commit tersebut masih pending.

## 6. Aturan kerja setelah sinkronisasi

1. Jangan mengerjakan branch `master` secara langsung.
2. Lanjutkan dari branch implementasi di atas.
3. Jangan melakukan force push, hard reset, atau menghapus file lokal tanpa memeriksa `git status`.
4. Jika ada konflik lokal, hentikan proses dan bandingkan perubahan sebelum menyelesaikannya.
5. Setiap perubahan database harus memiliki migration source di repository dan diverifikasi terhadap Supabase.
