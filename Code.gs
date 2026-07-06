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
