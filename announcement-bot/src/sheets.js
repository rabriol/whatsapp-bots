const axios = require('axios');

// Matches columns A–K in the "Announcements" sheet tab
const COLUMNS = ['id', 'type', 'title', 'day', 'time', 'goal', 'collected', 'due_date', 'link', 'text', 'active'];

/**
 * Fetches announcements from the public Google Sheets spreadsheet.
 * @returns {Promise<Object[]>} Array of announcement objects
 */
async function fetchAnnouncements() {
  const { GOOGLE_SHEETS_ID, GOOGLE_API_KEY } = process.env;

  if (!GOOGLE_SHEETS_ID || !GOOGLE_API_KEY) {
    throw new Error('GOOGLE_SHEETS_ID and GOOGLE_API_KEY must be set in .env');
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_ID}/values/Announcements!A2:K?key=${GOOGLE_API_KEY}`;

  const response = await axios.get(url);
  const rows = response.data.values || [];

  return rows
    .map((row) => {
      const obj = {};
      COLUMNS.forEach((col, i) => {
        obj[col] = row[i] !== undefined ? row[i].trim() : '';
      });
      return obj;
    })
    .filter((row) => row.active.toUpperCase() === 'TRUE');
}

module.exports = { fetchAnnouncements };
