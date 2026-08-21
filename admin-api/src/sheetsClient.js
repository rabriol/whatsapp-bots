'use strict';

const { google } = require('googleapis');
const config = require('./config');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

let sheetsPromise = null;

function getSheets() {
  if (!sheetsPromise) {
    const auth = new google.auth.GoogleAuth({
      keyFile: config.credentialsPath,
      scopes: SCOPES,
    });
    sheetsPromise = auth.getClient().then((client) => google.sheets({ version: 'v4', auth: client }));
  }
  return sheetsPromise;
}

/**
 * Reads a sheet tab as an array of row objects, keyed by the header row.
 * @param {string} sheetName
 * @returns {Promise<{headers: string[], rows: Array<{rowNumber: number, values: Record<string,string>}>}>}
 */
async function readSheet(sheetName) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetsId,
    range: sheetName,
  });

  const values = res.data.values || [];
  if (values.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = values[0].map((h) => h.trim());
  const rows = values.slice(1).map((row, i) => {
    const obj = {};
    headers.forEach((h, col) => {
      obj[h] = row[col] !== undefined ? String(row[col]).trim() : '';
    });
    return { rowNumber: i + 2, values: obj }; // +2: 1-indexed, plus header row
  });

  return { headers, rows };
}

/**
 * Appends a new row to a sheet tab, in header order.
 * @param {string} sheetName
 * @param {string[]} headers
 * @param {Record<string,string|number>} rowValues
 */
async function appendRow(sheetName, headers, rowValues) {
  const sheets = await getSheets();
  const row = headers.map((h) => (rowValues[h] !== undefined ? rowValues[h] : ''));
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetsId,
    range: sheetName,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}

/**
 * Overwrites a single row (by 1-indexed sheet row number) with new values, in header order.
 * @param {string} sheetName
 * @param {number} rowNumber
 * @param {string[]} headers
 * @param {Record<string,string|number>} rowValues
 */
async function updateRow(sheetName, rowNumber, headers, rowValues) {
  const sheets = await getSheets();
  const row = headers.map((h) => (rowValues[h] !== undefined ? rowValues[h] : ''));
  const lastCol = columnLetter(headers.length);
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.googleSheetsId,
    range: `${sheetName}!A${rowNumber}:${lastCol}${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}

/**
 * Clears a single row's contents (does not delete the row itself, avoids
 * shifting row numbers of other in-flight edits).
 * @param {string} sheetName
 * @param {number} rowNumber
 * @param {number} columnCount
 */
async function clearRow(sheetName, rowNumber, columnCount) {
  const sheets = await getSheets();
  const lastCol = columnLetter(columnCount);
  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.googleSheetsId,
    range: `${sheetName}!A${rowNumber}:${lastCol}${rowNumber}`,
  });
}

/**
 * Reads a sheet tab as raw rows (no header-based key mapping), skipping row 1.
 * Matches how the existing bots (birthday-bot, announcement-bot) parse sheets
 * positionally, so this stays compatible regardless of what row 1 says.
 * @param {string} sheetName
 * @param {string} range e.g. "A2:C"
 */
async function readRawRows(sheetName, range) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetsId,
    range: `${sheetName}!${range}`,
  });
  const values = res.data.values || [];
  return values.map((row, i) => ({ rowNumber: i + 2, values: row }));
}

async function appendRawRow(sheetName, row) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetsId,
    range: sheetName,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}

async function updateRawRow(sheetName, rowNumber, row) {
  const sheets = await getSheets();
  const lastCol = columnLetter(row.length);
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.googleSheetsId,
    range: `${sheetName}!A${rowNumber}:${lastCol}${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}

function columnLetter(oneIndexedCount) {
  let n = oneIndexedCount;
  let letter = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

module.exports = {
  readSheet,
  appendRow,
  updateRow,
  clearRow,
  readRawRows,
  appendRawRow,
  updateRawRow,
};
