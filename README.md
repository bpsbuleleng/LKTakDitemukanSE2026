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
- **Form Input** — 3 isian Usaha + 3 isian Keluarga (Pindah / Keluar / Tidak ada informasi),
  catatan opsional, validasi bilangan bulat ≥ 0, mode edit bila sudah pernah diisi.
- **Dashboard Rekap** — kartu KPI, donut chart breakdown alasan (Chart.js),
  rekap per kecamatan, tabel progres per PML (bisa diurutkan & dicari), tombol muat ulang.
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

## Cara deploy

1. Buka spreadsheet di atas → menu **Ekstensi → Apps Script**.
2. Di editor Apps Script:
   - Ganti isi `Code.gs` dengan isi file [Code.gs](Code.gs).
   - Tambah file HTML baru bernama persis **`Index`** (menu + → HTML; editor menambahkan
     `.html` otomatis — jangan ketik `Index.html`), isi dengan [Index.html](Index.html).
   - (Opsional) Setelan proyek → centang *Show "appsscript.json" manifest file*, lalu
     samakan dengan [appsscript.json](appsscript.json).
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
