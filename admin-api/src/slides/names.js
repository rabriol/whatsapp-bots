'use strict';

// Slide folders are named mm_dd_yyyy; image files are named by content hash.
// Every path built from user input must pass one of these first.
const FOLDER_RE = /^\d{2}_\d{2}_\d{4}$/;
const FILE_RE = /^[0-9a-f]{12}\.(png|jpe?g|webp)$/;

const CHURCH_TZ = 'America/Los_Angeles';

function folderNameFromDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || '');
  if (!match) throw new Error(`Data inválida: ${isoDate}`);
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(+year, +month - 1, +day));
  if (date.getUTCMonth() !== +month - 1 || date.getUTCDate() !== +day) {
    throw new Error(`Data inválida: ${isoDate}`);
  }
  return `${month}_${day}_${year}`;
}

// 'mm_dd_yyyy' -> 'yyyymmdd', so plain string comparison orders by date.
function folderDateKey(name) {
  const [month, day, year] = name.split('_');
  return `${year}${month}${day}`;
}

// The VPS runs in UTC; "today" for the church means today in Los Angeles.
function todayKeyInTz(tz = CHURCH_TZ, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}${map.month}${map.day}`;
}

module.exports = { FOLDER_RE, FILE_RE, CHURCH_TZ, folderNameFromDate, folderDateKey, todayKeyInTz };
