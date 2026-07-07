/**
 * Pelaporan Assignment Tidak Ditemukan — SE2026 (PML)
 *
 * Backend Google Apps Script:
 *  - Membaca sheet "master" (daftar Sub-SLS + petugas).
 *  - Upsert ke sheet "Laporan_Tidak_Ditemukan" (satu baris per id_subsls).
 *
 * Deploy sebagai Web App: Execute as "Me", Who has access "Anyone".
 */

var SPREADSHEET_ID = '1d_ZDiUNV9BukyiiSKtI_gtkbywP21q1IuBEVt-gOw2s';
var SHEET_MASTER = 'master';
var SHEET_LAPORAN = 'Laporan_Tidak_Ditemukan';
var TIMEZONE = 'Asia/Makassar'; // WITA

var NUM_FIELDS = [
  'usaha_pindah_subsls',
  'usaha_keluar_subsls',
  'usaha_tidak_ada_informasi',
  'keluarga_pindah_subsls',
  'keluarga_keluar_subsls',
  'keluarga_tidak_ada_informasi'
];
var LAPORAN_HEADERS = ['id_subsls'].concat(NUM_FIELDS, ['catatan', 'terakhir_diperbarui']);

// Urutan kolom yang dikirim ke klien — harus sinkron dengan MASTER_COLS / LAP_COLS di Index.html.
var MASTER_SEND = ['idsubsls', 'nmprov', 'nmkab', 'nmkec', 'nmdesa', 'kdsls', 'kdsubsls', 'nmsls', 'nmppl', 'nmpml'];

// --- Referensi dari situs Monitoring SE2026 (angka "tidak ditemukan" dari sistem) ---
var SHEET_REF = 'Ref_Monitoring';
var MONITORING_URL = 'https://bpsbuleleng.github.io/MonitoringSE2026/index.html';
var REF_HEADERS = ['id_subsls', 'ref_usaha_tidak_ditemukan', 'ref_keluarga_tidak_ditemukan', 'terakhir_sinkron'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Pelaporan Assignment Tidak Ditemukan — SE2026')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Menu bantuan di spreadsheet untuk melihat URL web app yang sudah dideploy. */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('LK Tak Ditemukan')
      .addItem('Tampilkan URL Aplikasi', 'showAppUrl_')
      .addSeparator()
      .addItem('Sinkronkan Data Monitoring', 'syncMonitoringMenu_')
      .addItem('Jadwalkan Sinkron Harian (otomatis)', 'createDailySyncTrigger_')
      .addToUi();
  } catch (e) { /* bukan konteks UI */ }
}

function showAppUrl_() {
  var url = ScriptApp.getService().getUrl();
  var msg = url
    ? 'URL aplikasi:\n\n' + url
    : 'Belum ada deployment. Buka editor Apps Script → Deploy → New deployment → Web app.';
  SpreadsheetApp.getUi().alert(msg);
}

function getSpreadsheet_() {
  var active = SpreadsheetApp.getActive();
  return active ? active : SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * Dipanggil klien saat load / refresh.
 * Master dan laporan dikirim sebagai array-of-array agar payload ringkas.
 */
function getAppData() {
  var ss = getSpreadsheet_();
  return {
    master: readMaster_(ss),
    laporan: readLaporan_(ss),
    ref: readRef_(ss),
    refSyncedAt: readRefSyncedAt_(ss),
    generatedAt: nowString_()
  };
}

function readMaster_(ss) {
  var sh = ss.getSheetByName(SHEET_MASTER);
  if (!sh) throw new Error('Sheet "' + SHEET_MASTER + '" tidak ditemukan di spreadsheet.');
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var idx = MASTER_SEND.map(function (name) {
    var i = headers.indexOf(name);
    if (i < 0) throw new Error('Kolom "' + name + '" tidak ditemukan di sheet "' + SHEET_MASTER + '".');
    return i;
  });

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var id = String(values[r][idx[0]]).trim();
    if (!id) continue;
    rows.push(idx.map(function (i) { return String(values[r][i]).trim(); }));
  }
  return rows;
}

function readLaporan_(ss) {
  var sh = ss.getSheetByName(SHEET_LAPORAN);
  if (!sh) return []; // sheet dibuat otomatis saat simpan pertama

  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var idx = LAPORAN_HEADERS.map(function (name) { return headers.indexOf(name); });

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var raw = values[r];
    var id = idx[0] >= 0 ? String(raw[idx[0]]).trim() : '';
    if (!id) continue;
    var row = [id];
    for (var f = 0; f < NUM_FIELDS.length; f++) {
      var v = idx[f + 1] >= 0 ? Number(raw[idx[f + 1]]) : 0;
      row.push(isFinite(v) ? v : 0);
    }
    var cIdx = idx[LAPORAN_HEADERS.indexOf('catatan')];
    row.push(cIdx >= 0 ? String(raw[cIdx]) : '');
    var uIdx = idx[LAPORAN_HEADERS.indexOf('terakhir_diperbarui')];
    var u = uIdx >= 0 ? raw[uIdx] : '';
    row.push(u instanceof Date ? Utilities.formatDate(u, TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(u));
    rows.push(row);
  }
  return rows;
}

/**
 * Upsert satu laporan. payload:
 * { id_subsls, usaha_pindah_subsls, ..., keluarga_tidak_ada_informasi, catatan }
 */
function saveLaporan(payload) {
  if (!payload || !payload.id_subsls) throw new Error('id_subsls wajib disertakan.');
  var id = String(payload.id_subsls).trim();

  var LABELS = {
    usaha_pindah_subsls: 'Usaha — Pindah Sub-SLS',
    usaha_keluar_subsls: 'Usaha — Keluar Sub-SLS',
    usaha_tidak_ada_informasi: 'Usaha — Tidak ada informasi',
    keluarga_pindah_subsls: 'Keluarga — Pindah Sub-SLS',
    keluarga_keluar_subsls: 'Keluarga — Keluar Sub-SLS',
    keluarga_tidak_ada_informasi: 'Keluarga — Tidak ada informasi'
  };

  var nums = NUM_FIELDS.map(function (f) {
    var raw = payload[f];
    var v = Number(raw);
    if (raw === '' || raw === null || raw === undefined || !isFinite(v) || v < 0 || v !== Math.floor(v)) {
      throw new Error('Isian "' + LABELS[f] + '" harus bilangan bulat ≥ 0.');
    }
    return v;
  });
  var catatan = payload.catatan ? String(payload.catatan).slice(0, 500) : '';

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    throw new Error('Server sedang sibuk, coba simpan lagi beberapa saat.');
  }

  try {
    var ss = getSpreadsheet_();
    if (!masterHasId_(ss, id)) {
      throw new Error('id_subsls "' + id + '" tidak terdaftar di sheet master.');
    }

    var sh = ensureLaporanSheet_(ss);
    var last = sh.getLastRow();
    var rowIndex = -1;
    if (last > 1) {
      var ids = sh.getRange(2, 1, last - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]).trim() === id) { rowIndex = i + 2; break; }
      }
    }
    if (rowIndex === -1) rowIndex = last + 1;

    var ts = nowString_();
    var row = [id].concat(nums, [catatan, ts]);
    // Format teks agar id 16 digit tidak terkorupsi jadi angka.
    sh.getRange(rowIndex, 1).setNumberFormat('@');
    sh.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    SpreadsheetApp.flush();

    return { ok: true, id_subsls: id, terakhir_diperbarui: ts };
  } finally {
    lock.releaseLock();
  }
}

function ensureLaporanSheet_(ss) {
  var sh = ss.getSheetByName(SHEET_LAPORAN);
  if (!sh) {
    sh = ss.insertSheet(SHEET_LAPORAN);
    sh.getRange(1, 1, 1, LAPORAN_HEADERS.length).setValues([LAPORAN_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@');
  }
  return sh;
}

function masterHasId_(ss, id) {
  var sh = ss.getSheetByName(SHEET_MASTER);
  if (!sh) return false;
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
  var c = headers.indexOf('idsubsls');
  if (c < 0) return false;
  var last = sh.getLastRow();
  if (last < 2) return false;
  var vals = sh.getRange(2, c + 1, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === id) return true;
  }
  return false;
}

function nowString_() {
  return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

/* =====================================================================
 * SINKRONISASI REFERENSI DARI SITUS MONITORING SE2026
 *
 * Situs https://bpsbuleleng.github.io/MonitoringSE2026 adalah halaman statis;
 * seluruh data REKAPITULASI (termasuk tab Sub-SLS) tertanam sebagai JSON
 * {"fields":[...],"rows":[[...]]} di dalam index.html. Jadi tidak perlu
 * "bot" browser — cukup ambil HTML lalu parse angka:
 *   - ulTdk  = Usaha Tidak Ditemukan
 *   - klTdk  = Keluarga Tidak Ditemukan
 * Dicocokkan ke master lewat ID:
 *   idsubsls (16 digit) = idsls (14 digit) + kdsub (dipad 2 digit).
 * ===================================================================== */

/**
 * Ambil data monitoring, cocokkan ke master, tulis ke sheet Ref_Monitoring.
 * Bisa dipanggil dari menu, trigger harian, atau editor Apps Script.
 * @return {{ok:boolean,count:number,totalUsaha:number,totalKeluarga:number,syncedAt:string}}
 */
function syncMonitoring() {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(60000); } catch (e) {
    throw new Error('Proses sinkron lain sedang berjalan. Coba lagi sebentar.');
  }
  try {
    var resp = UrlFetchApp.fetch(MONITORING_URL, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'User-Agent': 'LK-TakDitemukan-SE2026/1.0 (Apps Script)' }
    });
    var code = resp.getResponseCode();
    if (code !== 200) {
      throw new Error('Gagal mengambil halaman monitoring (HTTP ' + code + ').');
    }

    var refs = parseMonitoringRows_(resp.getContentText());
    if (!refs.length) throw new Error('Tidak ada baris data yang terbaca dari monitoring.');

    var ss = getSpreadsheet_();
    var masterIds = readMasterIdSet_(ss);
    var ts = nowString_();
    var out = [], totU = 0, totK = 0, matched = 0;

    for (var i = 0; i < refs.length; i++) {
      var r = refs[i];
      if (!masterIds[r.id]) continue; // lewati baris total kabupaten / non-master
      matched++;
      totU += r.ul; totK += r.kl;
      if (r.ul || r.kl) out.push([r.id, r.ul, r.kl, ts]); // simpan yang berisi saja
    }
    if (!matched) {
      throw new Error('Tidak ada ID monitoring yang cocok dengan sheet master. Cek format ID.');
    }

    writeRefSheet_(ss, out);
    return { ok: true, count: out.length, matched: matched,
             totalUsaha: totU, totalKeluarga: totK, syncedAt: ts };
  } finally {
    lock.releaseLock();
  }
}

/** Versi menu: jalankan syncMonitoring dan tampilkan ringkasan via alert. */
function syncMonitoringMenu_() {
  var ui = SpreadsheetApp.getUi();
  try {
    var res = syncMonitoring();
    ui.alert('Sinkron berhasil',
      'Sub-SLS cocok: ' + res.matched + '\n' +
      'Baris referensi tersimpan (berisi angka): ' + res.count + '\n\n' +
      'Total Usaha tidak ditemukan: ' + res.totalUsaha + '\n' +
      'Total Keluarga tidak ditemukan: ' + res.totalKeluarga + '\n\n' +
      'Waktu: ' + res.syncedAt + ' WITA',
      ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Sinkron gagal', String(e.message || e), ui.ButtonSet.OK);
  }
}

/** Buat trigger harian (sekitar 05:00 WITA) untuk syncMonitoring. Idempoten. */
function createDailySyncTrigger_() {
  var ui = SpreadsheetApp.getUi();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncMonitoring') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncMonitoring').timeBased().everyDays(1).atHour(5).create();
  ui.alert('Jadwal dibuat',
    'Sinkron otomatis akan berjalan setiap hari sekitar pukul 05:00 WITA.',
    ui.ButtonSet.OK);
}

/**
 * Ekstrak angka tidak-ditemukan per Sub-SLS dari HTML monitoring.
 * @return {Array<{id:string,ul:number,kl:number}>}
 */
function parseMonitoringRows_(html) {
  var fi = html.indexOf('"fields":[');
  if (fi < 0) throw new Error('Format monitoring berubah: bagian "fields" tidak ditemukan.');
  var fields = JSON.parse(extractJsonArray_(html, html.indexOf('[', fi)));
  var F = {};
  fields.forEach(function (f, i) { F[f] = i; });
  ['idsls', 'kdsub', 'ulTdk', 'klTdk'].forEach(function (k) {
    if (F[k] === undefined) throw new Error('Field "' + k + '" hilang dari data monitoring.');
  });

  var ri = html.indexOf('"rows":[', fi);
  if (ri < 0) throw new Error('Format monitoring berubah: bagian "rows" tidak ditemukan.');
  var rows = JSON.parse(extractJsonArray_(html, html.indexOf('[', ri)));

  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var idsls = String(r[F.idsls]).trim();
    if (!idsls) continue;
    var id = idsls + ('0' + r[F.kdsub]).slice(-2);
    var ul = Number(r[F.ulTdk]); if (!isFinite(ul) || ul < 0) ul = 0;
    var kl = Number(r[F.klTdk]); if (!isFinite(kl) || kl < 0) kl = 0;
    out.push({ id: id, ul: ul, kl: kl });
  }
  return out;
}

/**
 * Potong satu array JSON utuh mulai dari kurung '[' di posisi `start`,
 * memperhatikan string (tanda kutip & escape) agar tidak salah hitung kurung.
 */
function extractJsonArray_(s, start) {
  if (start < 0 || s.charAt(start) !== '[') throw new Error('Awal array JSON tidak valid.');
  var depth = 0, inStr = false, esc = false;
  for (var i = start; i < s.length; i++) {
    var c = s.charAt(i);
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
    } else if (c === '[') {
      depth++;
    } else if (c === ']') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  throw new Error('Array JSON tidak lengkap (kurung tidak seimbang).');
}

/** Set berisi seluruh idsubsls di master untuk pencocokan cepat. */
function readMasterIdSet_(ss) {
  var sh = ss.getSheetByName(SHEET_MASTER);
  if (!sh) throw new Error('Sheet "' + SHEET_MASTER + '" tidak ditemukan.');
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
  var c = headers.indexOf('idsubsls');
  if (c < 0) throw new Error('Kolom "idsubsls" tidak ada di sheet master.');
  var set = {};
  var last = sh.getLastRow();
  if (last < 2) return set;
  var vals = sh.getRange(2, c + 1, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    var id = String(vals[i][0]).trim();
    if (id) set[id] = true;
  }
  return set;
}

/** Tulis ulang sheet Ref_Monitoring (snapshot penuh). */
function writeRefSheet_(ss, rows) {
  var sh = ss.getSheetByName(SHEET_REF);
  if (!sh) sh = ss.insertSheet(SHEET_REF);
  sh.clearContents();
  sh.getRange('A:A').setNumberFormat('@'); // id 16 digit sebagai teks
  sh.getRange(1, 1, 1, REF_HEADERS.length).setValues([REF_HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  if (rows.length) {
    sh.getRange(2, 1, rows.length, REF_HEADERS.length).setValues(rows);
  }
  SpreadsheetApp.flush();
}

/** Baca Ref_Monitoring -> array [id, ref_usaha, ref_keluarga] (hanya yang berisi). */
function readRef_(ss) {
  var sh = ss.getSheetByName(SHEET_REF);
  if (!sh) return [];
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iId = headers.indexOf('id_subsls');
  var iU = headers.indexOf('ref_usaha_tidak_ditemukan');
  var iK = headers.indexOf('ref_keluarga_tidak_ditemukan');
  if (iId < 0) return [];
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var id = String(values[r][iId]).trim();
    if (!id) continue;
    var u = iU >= 0 ? Number(values[r][iU]) || 0 : 0;
    var k = iK >= 0 ? Number(values[r][iK]) || 0 : 0;
    if (!u && !k) continue;
    out.push([id, u, k]);
  }
  return out;
}

/** Waktu sinkron terakhir (dari baris pertama Ref_Monitoring), atau '' bila belum ada. */
function readRefSyncedAt_(ss) {
  var sh = ss.getSheetByName(SHEET_REF);
  if (!sh || sh.getLastRow() < 2) return '';
  var c = REF_HEADERS.indexOf('terakhir_sinkron') + 1;
  var v = sh.getRange(2, c).getValue();
  if (v instanceof Date) return Utilities.formatDate(v, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  return String(v || '');
}
