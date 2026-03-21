'use strict';

const { RRule } = require('rrule');

const BYDAY_TO_LABEL = {
  MO: 'Mondays', TU: 'Tuesdays', WE: 'Wednesdays',
  TH: 'Thursdays', FR: 'Fridays', SA: 'Saturdays', SU: 'Sundays',
};

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Parses a date string in M/D/YYYY format to a Date object (local midnight).
 * Returns null if invalid.
 *
 * @param {string} dateStr
 * @returns {Date|null}
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  const [m, d, y] = dateStr.split('/').map(Number);
  if (!m || !d || !y) return null;
  const date = new Date(y, m - 1, d);
  if (isNaN(date.getTime())) return null;
  return date;
}

/**
 * Returns a Date set to local midnight today.
 */
function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Returns a Date set to local midnight 2 months from today.
 */
function twoMonthsFromToday() {
  const d = today();
  return new Date(d.getFullYear(), d.getMonth() + 2, d.getDate());
}

/**
 * Formats a date range label for a single or multi-day event.
 * Examples: "Mar 27", "Mar 27-29", "Mar 30-Apr 1"
 *
 * @param {Date} start
 * @param {Date} end
 * @returns {string}
 */
function formatDateRange(start, end) {
  const sm = MONTH_ABBR[start.getMonth()];
  const sd = start.getDate();

  if (!end || start.getTime() === end.getTime()) {
    return `${sm} ${sd}`;
  }

  const em = MONTH_ABBR[end.getMonth()];
  const ed = end.getDate();

  if (start.getMonth() === end.getMonth()) {
    return `${sm} ${sd}-${ed}`;
  }
  return `${sm} ${sd}-${em} ${ed}`;
}

/**
 * Extracts the BYDAY value from a RRULE string.
 * Example: "RRULE:FREQ=WEEKLY;BYDAY=TU" → "TU"
 * Returns null if not a supported weekly rule.
 *
 * @param {string} rruleStr
 * @returns {string|null}
 */
function extractByday(rruleStr) {
  if (!rruleStr) return null;
  if (!rruleStr.includes('FREQ=WEEKLY')) return null;
  const match = rruleStr.match(/BYDAY=([A-Z,]+)/);
  if (!match) return null;
  // Only support single day (e.g. TU), not multi-day (TU,TH)
  const days = match[1].split(',');
  return days.length === 1 ? days[0] : null;
}

/**
 * Filters and formats sheet rows into event entries for the window [today, today+2mo].
 * Returns an array of { sortKey: Date, label: string } objects, sorted by sortKey.
 *
 * @param {Object[]} rows - Raw rows from sheets.js
 * @returns {{ sortKey: Date, label: string }[]}
 */
function buildEventEntries(rows) {
  const windowStart = today();
  const windowEnd   = twoMonthsFromToday();
  const entries = [];

  for (const row of rows) {
    const { title, start_date, end_date, recurrence_rule, status } = row;

    // Skip events without title or start_date
    if (!title || !start_date) continue;

    // Skip non-confirmed events (if status column exists)
    if (status !== undefined && status !== '' && status.toLowerCase() !== 'confirmed') continue;

    const startDt = parseDate(start_date);
    if (!startDt) continue;

    const byday = extractByday(recurrence_rule);

    if (byday) {
      // Recurring weekly event — expand by month in window
      processRecurringEvent(row, startDt, byday, windowStart, windowEnd, entries);
    } else {
      // Single or range event
      const endDt = parseDate(end_date) || startDt;
      if (startDt <= windowEnd && endDt >= windowStart) {
        entries.push({
          sortKey: startDt,
          label: `${formatDateRange(startDt, endDt)} ${title}`,
        });
      }
    }
  }

  entries.sort((a, b) => a.sortKey - b.sortKey);
  return entries;
}

/**
 * Expands a recurring weekly event into one entry per month within the window.
 */
function processRecurringEvent(row, startDt, byday, windowStart, windowEnd, entries) {
  const { title, recurrence_rule } = row;
  const dayLabel = BYDAY_TO_LABEL[byday] ?? byday;

  let rrule;
  try {
    const dtstart = new Date(Date.UTC(startDt.getFullYear(), startDt.getMonth(), startDt.getDate()));
    rrule = RRule.fromString(recurrence_rule.replace(/^RRULE:/, ''));
    rrule = new RRule({ ...rrule.origOptions, dtstart });
  } catch {
    return; // unsupported RRULE, skip silently
  }

  // Get all occurrences within the window (UTC dates from rrule)
  const occurrences = rrule.between(
    new Date(Date.UTC(windowStart.getFullYear(), windowStart.getMonth(), windowStart.getDate())),
    new Date(Date.UTC(windowEnd.getFullYear(), windowEnd.getMonth(), windowEnd.getDate())),
    true
  );

  // Group by month — one entry per month
  const seenMonths = new Set();
  for (const occ of occurrences) {
    const monthKey = `${occ.getUTCFullYear()}-${occ.getUTCMonth()}`;
    if (seenMonths.has(monthKey)) continue;
    seenMonths.add(monthKey);

    const monthLabel = MONTH_ABBR[occ.getUTCMonth()];
    const sortDate = new Date(occ.getUTCFullYear(), occ.getUTCMonth(), occ.getUTCDate());
    entries.push({
      sortKey: sortDate,
      label: `${monthLabel} (${dayLabel}) ${title}`,
    });
  }
}

/**
 * Formats the final WhatsApp message from a list of event entries.
 *
 * @param {{ label: string }[]} entries
 * @returns {string}
 */
function formatMessage(entries) {
  const lines = ['📅 *Upcoming Events*', ''];
  for (const entry of entries) {
    lines.push(entry.label);
  }
  return lines.join('\n');
}

module.exports = { buildEventEntries, formatMessage, parseDate, formatDateRange, extractByday };
