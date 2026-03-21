'use strict';

const axios = require('axios');

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
 * Parses a CSV string into an array of objects keyed by header row.
 * Handles quoted fields and escaped quotes ("").
 *
 * @param {string} csv
 * @returns {Object[]}
 */
function parseCSV(csv) {
  const lines = csv.split('\n').filter(l => l.trim() !== '');
  if (lines.length < 2) return [];

  const headers = parseCSVRow(lines[0]);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVRow(lines[i]);
    if (values.every(v => v.trim() === '')) continue;

    const row = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

/**
 * Parses a single CSV line respecting quoted fields.
 *
 * @param {string} line
 * @returns {string[]}
 */
function parseCSVRow(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

module.exports = { fetchSheetRows, parseCSV, parseCSVRow };
