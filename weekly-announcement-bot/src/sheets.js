'use strict';

const axios = require('axios');

// gid of the "Settings" tab in the events spreadsheet (confirmed via
// spreadsheets.get: gid=0 is "Events", gid=1434227925 is "Settings").
const SETTINGS_GID = 1434227925;

/**
 * Fetches and parses rows from the public Google Sheets calendar.
 * Uses CSV export — no API key required (sheet must be publicly readable).
 *
 * @returns {Promise<Object[]>} Array of raw row objects with string values
 */
async function fetchSheetRows() {
  const sheetId = process.env.SHEET_ID;
  if (!sheetId) throw new Error('SHEET_ID must be set in .env');

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
  const response = await axios.get(url, { timeout: 15000 });
  return parseCSV(response.data);
}

/**
 * Fetches the "Settings" tab (key/value rows) from the same spreadsheet.
 *
 * @returns {Promise<Record<string,string>>}
 */
async function fetchSettings() {
  const sheetId = process.env.SHEET_ID;
  if (!sheetId) throw new Error('SHEET_ID must be set in .env');

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${SETTINGS_GID}`;
  const response = await axios.get(url, { timeout: 15000 });
  const rows = parseCSV(response.data);

  const settings = {};
  for (const row of rows) {
    if (row.key) settings[row.key.trim()] = (row.value || '').trim();
  }
  return settings;
}

/**
 * Parses a CSV string into an array of objects keyed by header row.
 *
 * @param {string} csv
 * @returns {Object[]}
 */
function parseCSV(csv) {
  const rows = parseCSVRows(csv);
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.trim());

  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    if (values.every(v => v.trim() === '')) continue;

    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? '').trim();
    });
    result.push(row);
  }
  return result;
}

/**
 * Parses a full CSV document into rows of cells in a single quote-aware
 * pass, per RFC4180: a comma or newline inside a quoted field is part of
 * the field's value, not a column/row separator, and "" inside a quoted
 * field is an escaped literal quote.
 *
 * Splitting into lines before parsing quotes (the previous approach here)
 * corrupts any row whose cell contains an embedded newline - e.g. a
 * recurrence_rule storing "RRULE:...\nEXDATE:..." on two lines, which
 * Google Sheets' CSV export correctly wraps in quotes. That newline would
 * get treated as ending the row early, silently blanking every column
 * after it for that row and misdirecting the remainder into a bogus
 * extra row.
 *
 * @param {string} csv
 * @returns {string[][]}
 */
function parseCSVRows(csv) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];

    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') { cell += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r') {
      // Skip - a following '\n' (or a lone '\r', unlikely from Sheets)
      // ends the row on its own.
    } else if (ch === '\n') {
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }

  // The document may or may not end with a trailing newline.
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

module.exports = { fetchSheetRows, fetchSettings, parseCSV, parseCSVRows };
