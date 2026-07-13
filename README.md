# LK Tak Ditemukan SE2026

Aplikasi web untuk PML (Pengawas Mitra Lapangan) melaporkan jumlah assignment yang
tidak berhasil ditemukan PPL di lapangan — kategori **Usaha** dan **Keluarga**, per Sub-SLS.
Tanpa login: siapa pun yang memegang tautan bisa mengakses dan mengisi.

Dibangun sebagai **Google Apps Script Web App** dengan Google Sheets sebagai database:

> https://docs.google.com/spreadsheets/d/1d_ZDiUNV9BukyiiSKtI_gtkbywP21q1IuBEVt-gOw2s

**Aplikasi live (bagikan URL ini ke para PML):**

> https://script.google.com/macros/s/AKfycbzV_gfktO65eZpGhbu_RXRm8aZbuQ8K4ZEu1UTd_6jDNcvHlDu_oktC6ye7GXMaMPfFxg/exec

## Fitur

- **Daftar Sub-SLS** — 2.601 Sub-SLS Kab. Buleleng, filter cascading
  (Kecamatan → Desa) + filter PPL/PML/Status, pencarian bebas,
  kartu rekap mengikuti filter, expand baris untuk rincian, paginasi.
  Filter PML terakhir diingat per perangkat (localStorage).
  (Provinsi/Kabupaten tidak ditampilkan karena aplikasi dipakai satu kabupaten.)
  Kolom **Selisih Usaha** & **Selisih Keluarga** (laporan − hasil Monitoring SE2026):
  hijau bila sama, merah bertanda bila beda, "–" bila belum dilaporkan/belum sinkron.
- **Form Input** — 3 isian Usaha + 3 isian Keluarga (Pindah / Keluar / Tidak ada informasi),
  catatan opsional, validasi bilangan bulat ≥ 0, mode edit bila sudah pernah diisi.
  Di dekat tiap subtotal muncul **chip referensi** berisi angka "tidak ditemukan"
  dari sistem Monitoring SE2026 (total saja) — hijau bila cocok, kuning bila selisih,
  membantu PML memperkirakan dan menyelaraskan angkanya.
- **Dashboard Rekap** — filter cascading (Kecamatan → Desa → SLS) + filter PPL/PML dan
  bilah pencarian yang berlaku untuk seluruh isi dashboard (KPI, grafik, rekapitulasi);
  kartu KPI; donut chart breakdown alasan (Chart.js); satu tabel **Rekapitulasi** bertab
  (Kecamatan / Desa/Kelurahan / SLS / PPL / PML) — tiap baris memuat jumlah Sub-SLS,
  sudah/belum lapor, **% Lapor** minimalis (hijau bila 100%), rincian per 3 jenis tak
  ditemukan (Pindah / Keluar / Tanpa informasi) untuk Usaha & Keluarga beserta totalnya,
  kolom **Selisih** agregat terhadap Monitoring SE2026 (hijau bila 0, merah bila beda;
  dihitung atas Sub-SLS yang sudah dilaporkan, konsisten dengan Daftar Sub-SLS),
  serta total gabungan U+K; semua kolom bisa diurutkan. Tombol muat ulang data.
- Mobile-friendly: tabel bisa di-scroll ke samping dengan kolom Sub-SLS beku (sticky)
  dan font mengecil di layar sempit. Bahasa Indonesia.

## Struktur data

**Sheet `master`** (referensi, tidak diubah aplikasi): `idsubsls, kdprov, kdkab, kdkec,
kddesa, kdsls, kdsubsls, nmppl, nmpml, nmprov, nmkab, nmkec, nmdesa, nmsls`.

**Sheet `Laporan_Tidak_Ditemukan`** (dibuat otomatis saat simpan pertama, satu baris per
`id_subsls`, pola upsert):

| Kolom | Isi |
|---|---|
| `id_subsls` | relasi ke `master.idsubsls` (format teks) |
| `usaha_pindah_subsls`, `usaha_keluar_subsls`, `usaha_tidak_ada_informasi` | jumlah usaha per alasan |
| `keluarga_pindah_subsls`, `keluarga_keluar_subsls`, `keluarga_tidak_ada_informasi` | jumlah keluarga per alasan |
| `catatan` | catatan bebas opsional (maks. 500 karakter) |
| `terakhir_diperbarui` | timestamp WITA, diisi otomatis |

**Sheet `Ref_Monitoring`** (dibuat/ditulis-ulang otomatis oleh fitur sinkron, satu baris per
`id_subsls` yang punya angka): `id_subsls, ref_usaha_tidak_ditemukan,
ref_keluarga_tidak_ditemukan, terakhir_sinkron`. Sumber angka acuan yang ditampilkan di form.

## Sinkronisasi referensi Monitoring SE2026

Situs [Monitoring SE2026](https://bpsbuleleng.github.io/MonitoringSE2026) adalah halaman
statis; seluruh data rekap (termasuk tab **Sub-SLS**) tertanam sebagai JSON
`{"fields":[…],"rows":[[…]]}` di dalam `index.html`-nya. Jadi tidak perlu "bot" browser —
`syncMonitoring()` cukup mengambil HTML via `UrlFetchApp`, mem-parse angka **Usaha Tidak
Ditemukan** (`ulTdk`) dan **Keluarga Tidak Ditemukan** (`klTdk`) per baris, lalu mencocokkan
ke `master` lewat ID:

> `idsubsls` (16 digit) = `idsls` (14 digit dari monitoring) + `kdsub` yang dipad 2 digit

Pencocokan ID ini 100% pas (2.601/2.601 Sub-SLS), lebih andal daripada mencocokkan nama
(nama di monitoring HURUF BESAR, di master Title Case). Hasilnya ditulis ke `Ref_Monitoring`.

**Cara menjalankan** (dari spreadsheet, menu **LK Tak Ditemukan**):
- **Sinkronkan Data Monitoring** — jalan sekali sekarang. Menampilkan ringkasan jumlah & total.
- **Jadwalkan Sinkron Harian (otomatis)** — memasang trigger harian ±05:00 WITA.

**Otorisasi pertama kali** (karena mengakses internet): jika muncul *"You do not have
permission to call UrlFetchApp.fetch"*, pastikan `appsscript.json` sudah memuat scope
`script.external_request` (lihat di atas), lalu di editor Apps Script pilih fungsi
`syncMonitoring` → **Run** → **Review permissions** → pilih akun → **Advanced → Go to
project → Allow** (ada butir *"Connect to an external service"*). Setelah diizinkan sekali,
menu dan trigger harian berjalan tanpa diminta lagi.

Aplikasi web hanya **membaca** `Ref_Monitoring` (tidak ikut memicu fetch berat), jadi para
PML tinggal melihat angkanya; klik **Muat Ulang Data** di Dashboard untuk menarik hasil
sinkron terbaru.

## Cara deploy

1. Buka spreadsheet di atas → menu **Ekstensi → Apps Script**.
2. Di editor Apps Script:
   - Ganti isi `Code.gs` dengan isi file [Code.gs](Code.gs).
   - Tambah file HTML baru bernama persis **`Index`** (menu + → HTML; editor menambahkan
     `.html` otomatis — jangan ketik `Index.html`), isi dengan [Index.html](Index.html).
   - **Wajib** samakan manifest: Setelan proyek (⚙️) → centang *Show "appsscript.json"
     manifest file*, lalu buka `appsscript.json` di editor dan samakan dengan
     [appsscript.json](appsscript.json). Manifest ini memuat `oauthScopes` — termasuk
     `script.external_request` yang diperlukan fitur sinkron monitoring (`UrlFetchApp`).
     Tanpa scope ini, sinkron gagal dengan pesan *"You do not have permission to call
     UrlFetchApp.fetch"*.
3. **Deploy → New deployment → Web app**:
   - *Execute as*: **Me** (akun pemilik spreadsheet).
   - *Who has access*: **Anyone** (Siapa saja).
4. Salin URL `…/exec` dan bagikan ke para PML. Selesai — sheet
   `Laporan_Tidak_Ditemukan` akan dibuat otomatis saat laporan pertama disimpan.

Setelah deploy, di spreadsheet juga muncul menu **LK Tak Ditemukan → Tampilkan URL
Aplikasi** (refresh halaman spreadsheet dulu).

**Memperbarui aplikasi** setelah mengubah kode: **Deploy → Manage deployments →
✏️ Edit → Version: New version → Deploy** (URL tidak berubah). Jangan pakai
*New deployment* — itu membuat URL baru, sedangkan URL lama tetap menyajikan versi lama.

Alternatif via [clasp](https://github.com/google/clasp): `clasp clone <scriptId>` lalu
`clasp push` dari folder repo ini (file `.gs` dan `.html` sudah sesuai konvensi clasp).

## Pratinjau lokal

Buka `Index.html` langsung di browser — di luar Apps Script aplikasi otomatis memakai
data contoh (mock) sehingga UI bisa dicek tanpa deploy. Data asli hanya terbaca/tertulis
saat berjalan sebagai Web App Apps Script.

## Catatan teknis

- `id_subsls` 16 digit ditulis dengan format sel teks (`@`) agar tidak terpotong presisi angka.
- Penyimpanan memakai `LockService` supaya dua PML yang menyimpan bersamaan tidak saling menimpa baris.
- Server memvalidasi ulang semua isian (bilangan bulat ≥ 0, `id_subsls` harus ada di `master`).
- Zona waktu timestamp: `Asia/Makassar` (WITA).
