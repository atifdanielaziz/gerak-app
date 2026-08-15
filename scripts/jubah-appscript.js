// ═══════════════════════════════════════════════════════════════════
// GERAK — Jubah Booking Google Apps Script
// ═══════════════════════════════════════════════════════════════════
//
// HOW TO DEPLOY:
//   1. Create a new Google Sheet (sheets.new)
//   2. Click Extensions → Apps Script
//   3. Delete existing code, paste this entire file
//   4. Click Deploy → New deployment
//      Type: Web app | Execute as: Me | Access: Anyone
//   5. Copy the Web app URL
//   6. Paste into: src/lib/sheetsService.ts → SHEETS_WEBAPP_URL
//
// UPDATING THE EXISTING DEPLOYMENT:
//   1. Paste this file over the old code in the same Apps Script project.
//   2. Run migrateExistingSheets() once. It preserves booking rows.
//   3. Deploy > Manage deployments > Edit > New version > Deploy.
//   4. Do NOT run resetSheets() on a sheet containing real bookings.
//
// SHEETS CREATED AUTOMATICALLY:
//   • UMPSA  → Universiti Malaysia Pahang Al-Sultan Abdullah
//   • UIA    → Universiti Islam Antarabangsa Malaysia
//   • UITM   → Universiti Teknologi MARA (UiTM)
//   • Others → any unknown university (safety fallback)
//
// ═══════════════════════════════════════════════════════════════════

// Maps the university full name sent from the app to a sheet tab name
var UNIVERSITY_SHEET_MAP = {
  'Universiti Malaysia Pahang Al-Sultan Abdullah': 'UMPSA',
  'Universiti Islam Antarabangsa Malaysia':        'UIA',
  'Universiti Teknologi MARA (UiTM)':              'UITM',
};

var HEADERS = [
  'Timestamp (MYT)',
  'Reference',
  'Full Name',
  'IC Number',
  'HP Number',
  'University',
  'Faculty',
  'Matric ID',
  'Payment Detail',
  'Amount (RM)',
  'Remark',
  'Delivery Address',
  'Assigned Rider',
  'Combined PDF',
  'Payment Proof',
  'OSCAR',
  'SKPG',
  'Konvo Slip',
  'IC',
  'Balance Proof',
];

var COLUMN_WIDTHS = [160, 140, 200, 130, 120, 260, 90, 100, 170, 90, 90, 360, 150, 110, 110, 90, 90, 110, 90, 110];

// Tab colours per university
var SHEET_COLORS = {
  'UMPSA':  '#1D4ED8', // blue
  'UIA':    '#065F46', // green
  'UITM':   '#7C2D12', // maroon
  'Others': '#6B7280', // grey
};

var HEADER_COLORS = {
  'UMPSA':  '#1D4ED8',
  'UIA':    '#065F46',
  'UITM':   '#9B2335', // UiTM maroon
  'Others': '#6B7280',
};

// Applies header row styling + column widths to a sheet. Used whenever a
// sheet is newly created AND whenever an existing sheet is found blank
// (e.g. right after resetSheets()), so both paths stay in sync instead
// of duplicating this logic.
function applyHeader(sheet, sheetName) {
  sheet.clear();
  sheet.appendRow(HEADERS);

  var headerColor = HEADER_COLORS[sheetName] || '#1D4ED8';
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setFontWeight('bold')
    .setBackground(headerColor)
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);
  sheet.setFrozenRows(1);

  for (var i = 0; i < COLUMN_WIDTHS.length; i++) {
    sheet.setColumnWidth(i + 1, COLUMN_WIDTHS[i]);
  }
  if (SHEET_COLORS[sheetName]) sheet.setTabColor(SHEET_COLORS[sheetName]);
}

function normalizeAddress(value) {
  if (!value) return '';
  return String(value)
    .split(/\r?\n|\r/)
    .map(function (part) { return part.trim().replace(/^,+|,+$/g, '').trim(); })
    .filter(function (part) { return part !== ''; })
    .join(', ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/(?:,\s*){2,}/g, ', ');
}

function getHeaders(sheet) {
  if (sheet.getLastColumn() === 0) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function (header) { return String(header).trim(); });
}

function headerColumn(headers, name) {
  var index = headers.indexOf(name);
  return index === -1 ? 0 : index + 1;
}

function ensureSheetLayout(sheet, sheetName) {
  if (sheet.getLastRow() === 0 || sheet.getRange(1, 1).getValue() === '') {
    applyHeader(sheet, sheetName);
    return;
  }

  var headers = getHeaders(sheet);
  var redundantHeaders = ['Combined File', 'Documents'];
  for (var redundant = 0; redundant < redundantHeaders.length; redundant++) {
    var redundantColumn = headerColumn(headers, redundantHeaders[redundant]);
    if (redundantColumn) {
      sheet.deleteColumn(redundantColumn);
      headers = getHeaders(sheet);
    }
  }

  for (var i = 0; i < HEADERS.length; i++) {
    if (!headerColumn(headers, HEADERS[i])) {
      var newColumn = sheet.getLastColumn() + 1;
      sheet.getRange(1, newColumn).setValue(HEADERS[i]);
      headers.push(HEADERS[i]);
    }
  }

  var headerColor = HEADER_COLORS[sheetName] || '#1D4ED8';
  sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .setFontWeight('bold')
    .setBackground(headerColor)
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);
  sheet.setFrozenRows(1);
}

function getOrCreateSheet(sheetName) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  var isNew = !sheet;

  if (isNew) sheet = ss.insertSheet(sheetName);

  if (isNew) applyHeader(sheet, sheetName);
  else ensureSheetLayout(sheet, sheetName);

  return sheet;
}

// ── Run this ONCE manually after pasting the script ──────────────────────────
// In the Apps Script editor: select "initializeSheets" from the dropdown → ▶ Run
function initializeSheets() {
  var names = ['UMPSA', 'UIA', 'UITM'];
  for (var i = 0; i < names.length; i++) {
    getOrCreateSheet(names[i]);
    Logger.log('✅ Sheet ready: ' + names[i]);
  }
}

// Run once after replacing the deployed script. This preserves all booking
// rows, removes the redundant Combined File/Documents columns, adds any
// missing status columns, converts stored paths to Yes/No, and flattens addresses.
function migrateExistingSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var documentHeaders = ['Combined PDF', 'Payment Proof', 'OSCAR', 'SKPG', 'Konvo Slip', 'IC', 'Balance Proof'];

  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    ensureSheetLayout(sheet, sheet.getName());
    if (sheet.getLastRow() < 2) continue;

    var headers = getHeaders(sheet);
    var addressColumn = headerColumn(headers, 'Delivery Address');
    if (addressColumn) {
      var addressRange = sheet.getRange(2, addressColumn, sheet.getLastRow() - 1, 1);
      var addresses = addressRange.getValues();
      for (var a = 0; a < addresses.length; a++) addresses[a][0] = normalizeAddress(addresses[a][0]);
      addressRange.setValues(addresses).setWrap(false);
    }

    for (var d = 0; d < documentHeaders.length; d++) {
      var documentColumn = headerColumn(headers, documentHeaders[d]);
      if (!documentColumn) continue;
      var documentRange = sheet.getRange(2, documentColumn, sheet.getLastRow() - 1, 1);
      var values = documentRange.getValues();
      for (var r = 0; r < values.length; r++) {
        var current = String(values[r][0] || '').trim().toLowerCase();
        values[r][0] = current && current !== 'no' ? 'Yes' : 'No';
      }
      documentRange.setValues(values);
    }
  }
}

// ── DESTRUCTIVE — wipes header + all rows on every existing tab. ────────────
// Only run this if the current sheet contents are disposable test data.
// After running, call initializeSheets() (or just wait for the next booking)
// to re-apply the new header.
// In the Apps Script editor: select "resetSheets" from the dropdown → ▶ Run
function resetSheets() {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    sheets[i].clear();
  }
  Logger.log('✅ Cleared ' + sheets.length + ' sheet(s). Run initializeSheets() to re-apply headers.');
}
// ─────────────────────────────────────────────────────────────────────────────

// Builds a human-readable payment description. Amount (RM) already carries
// the real, current price (dynamic per remark — see pricing table in the
// app), so this only needs to describe WHICH option was chosen, not repeat
// a price here (a hardcoded price here would just go stale over time).
function buildPaymentDetail(data) {
  var zone = data.postageZone === 'SS' ? ' (SS)' : data.postageZone === 'SM' ? ' (SM)' : '';
  if (data.paymentMode === 'pickup')  return 'Pickup';
  if (data.paymentMode === 'postage') return 'Postage' + zone;
  if (data.paymentMode === 'deposit') {
    var sub = data.depositMethod === 'postage' ? 'Postage' + zone : 'Pickup';
    return 'Deposit — ' + sub;
  }
  return data.paymentMode || '';
}

// Joins every uploaded document (per-field docs + combined PDF + payment
// proof, whatever the caller included) into one readable cell. Deliberately
// NOT a fixed column per document type — the app's document fields are
// configurable per university, so a fixed column layout would either
// mislabel or silently drop documents whenever that configuration differs
// from the original four (OSCAR/SKPG/Konvo/IC).
//
// Paths are storage references, not clickable links — jubah-docs is a
// private Supabase bucket, so viewing a file requires generating a signed
// URL from inside the Gerak app (Admin/Rider view), not from this sheet.
function buildDocumentsCell(documents) {
  if (!documents || !documents.length) return '';
  var lines = [];
  for (var i = 0; i < documents.length; i++) {
    lines.push(documents[i].label + ': ' + documents[i].path);
  }
  return lines.join('\n');
}

function hasDocument(documents, terms) {
  if (!documents || !documents.length) return 'No';
  for (var i = 0; i < documents.length; i++) {
    var label = String(documents[i].label || '').toLowerCase();
    var path = String(documents[i].path || '').trim();
    if (!path) continue;
    for (var t = 0; t < terms.length; t++) {
      if (label.indexOf(terms[t]) !== -1) return 'Yes';
    }
  }
  return 'No';
}

function appendMappedRow(sheet, valuesByHeader) {
  var headers = getHeaders(sheet);
  var row = [];
  for (var i = 0; i < headers.length; i++) row.push(valuesByHeader[headers[i]] || '');
  sheet.appendRow(row);
  return sheet.getLastRow();
}

function findBookingByReference(reference) {
  if (!reference) return null;
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    if (sheet.getLastRow() < 2) continue;
    var headers = getHeaders(sheet);
    var referenceColumn = headerColumn(headers, 'Reference');
    if (!referenceColumn) continue;
    var match = sheet.getRange(2, referenceColumn, sheet.getLastRow() - 1, 1)
      .createTextFinder(String(reference))
      .matchEntireCell(true)
      .findNext();
    if (match) return { sheet: sheet, row: match.getRow(), headers: headers };
  }
  return null;
}

function updateDocumentStatus(reference, documentHeader, uploaded) {
  var booking = findBookingByReference(reference);
  if (!booking) return false;
  var column = headerColumn(booking.headers, documentHeader);
  if (!column) return false;
  booking.sheet.getRange(booking.row, column).setValue(uploaded ? 'Yes' : 'No');
  return true;
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (data.type === 'jubah_balance_update') {
      var balanceUpdated = updateDocumentStatus(data.reference, 'Balance Proof', Boolean(data.balanceProofUrl));
      return ContentService
        .createTextOutput(JSON.stringify({ success: balanceUpdated, updated: balanceUpdated }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.type === 'jubah_document_update') {
      var allowedHeaders = ['Combined PDF', 'Payment Proof', 'OSCAR', 'SKPG', 'Konvo Slip', 'IC', 'Balance Proof'];
      if (allowedHeaders.indexOf(data.document) === -1) throw new Error('Unsupported document column.');
      var documentUpdated = updateDocumentStatus(data.reference, data.document, Boolean(data.uploaded));
      return ContentService
        .createTextOutput(JSON.stringify({ success: documentUpdated, updated: documentUpdated }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var university = data.university || '';

    // Resolve which sheet to write into
    var sheetName  = UNIVERSITY_SHEET_MAP[university] || 'Others';
    var sheet      = getOrCreateSheet(sheetName);

    var timestamp  = Utilities.formatDate(
      new Date(), 'Asia/Kuala_Lumpur', 'dd/MM/yyyy HH:mm:ss'
    );

    var lastRow = appendMappedRow(sheet, {
      'Timestamp (MYT)': timestamp,
      'Reference': data.reference || '',
      'Full Name': data.fullName || '',
      'IC Number': data.icNumber || '',
      'HP Number': data.hpNumber || '',
      'University': university,
      'Faculty': data.faculty || '',
      'Matric ID': data.matricId || '',
      'Payment Detail': buildPaymentDetail(data),
      'Payment Mode': buildPaymentDetail(data),
      'Amount (RM)': data.cost || '',
      'Remark': data.remark || '',
      'Delivery Address': normalizeAddress(data.deliveryAddress),
      'Assigned Rider': data.riderName || '',
      'Combined PDF': hasDocument(data.documents, ['combined pdf']),
      'Payment Proof': hasDocument(data.documents, ['payment proof']),
      'OSCAR': hasDocument(data.documents, ['oscar']),
      'SKPG': hasDocument(data.documents, ['skpg']),
      'Konvo Slip': hasDocument(data.documents, ['konvo']),
      'IC': hasDocument(data.documents, ['ic']),
      'Balance Proof': 'No',
    });

    // Alternate row shading for readability
    if (lastRow % 2 === 0) {
      sheet.getRange(lastRow, 1, 1, sheet.getLastColumn()).setBackground('#F0F7FF');
    }
    var addressColumn = headerColumn(getHeaders(sheet), 'Delivery Address');
    if (addressColumn) sheet.getRange(lastRow, addressColumn).setWrap(false);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, sheet: sheetName, row: lastRow }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Health check — open the web app URL in a browser to confirm it's live
function doGet() {
  return ContentService
    .createTextOutput('GERAK Jubah Booking API — Running ✓\nSheets: UMPSA | UIA | UITM')
    .setMimeType(ContentService.MimeType.TEXT);
}
