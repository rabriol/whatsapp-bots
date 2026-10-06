'use strict';

const cron = require('node-cron');
const { fetchAnnouncements } = require('./sheets');
const { formatMessage } = require('./messages');
const { sendMessage, sendAlert } = require('./whatsapp');

const CHURCH_TZ = 'America/Los_Angeles';
const DOW_MAP = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const RETRY_DELAYS_MS = [30_000, 120_000, 300_000];

// Tracks, per row id, the last "YYYY-M-D H:MM" this bot fired for it - guards
// against firing twice for the same minute without needing to stop/recreate
// anything. Also tracks the last warning logged per row id, so a row with a
// persistent config problem (e.g. missing day) doesn't spam the log every
// minute - only when the problem appears, changes, or clears.
const lastFiredKeys = new Map();
const lastWarnings = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The container runs in UTC; schedules are wall-clock time in the church's
// own timezone, so "now" has to be resolved there rather than read off Date.
function getNowInTz(tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const hour = parseInt(map.hour, 10) % 24; // midnight can format as "24" with hour12:false on some ICU builds
  const dow = new Date(Date.UTC(parseInt(map.year, 10), parseInt(map.month, 10) - 1, parseInt(map.day, 10))).getUTCDay();
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour,
    minute: parseInt(map.minute, 10),
    dow,
  };
}

function parseTime(time) {
  const [hour, minute] = time.split(':').map((s) => parseInt(s.trim(), 10));
  return { hour, minute };
}

/**
 * Resolves a row's `freq` column into a schedule descriptor, or an error
 * string if the row is missing/has invalid fields for that frequency.
 * Blank/unrecognized freq defaults to "monthly" for backward compatibility
 * with rows written before this column existed.
 */
function describeRowSchedule(row) {
  if (!row.time) {
    return { error: 'missing time' };
  }

  const { hour, minute } = parseTime(row.time);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return { error: `invalid time "${row.time}"` };
  }

  const freq = (row.freq || 'monthly').toLowerCase();

  if (freq === 'daily') {
    return { schedule: { kind: 'daily', hour, minute } };
  }

  if (freq === 'weekly') {
    const codes = (row.byday || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    const dow = codes.map((c) => DOW_MAP[c]).filter((n) => n !== undefined);
    if (dow.length === 0) {
      return { error: 'freq=weekly but no valid byday codes' };
    }
    return { schedule: { kind: 'weekly', hour, minute, dow } };
  }

  if (freq === 'none') {
    // One-time send on a specific date. There's no "just once, ever" concept
    // here - this matches day-of-month AND month, so it fires on that
    // calendar date every year the row stays active. For a true one-off, the
    // row needs to be deactivated after it sends (admin-api can do this;
    // this bot only has read access to the sheet via GOOGLE_API_KEY, so it
    // can't write that back).
    if (!row.date_once) {
      return { error: 'freq=none but no date_once' };
    }
    const [, monthStr, dayStr] = row.date_once.split('-');
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    if (!Number.isFinite(month) || !Number.isFinite(day)) {
      return { error: `invalid date_once "${row.date_once}"` };
    }
    return { schedule: { kind: 'once', hour, minute, month, day } };
  }

  // monthly (default)
  const day = parseInt(row.day, 10);
  if (!Number.isFinite(day)) {
    return { error: 'freq=monthly but no day' };
  }
  return { schedule: { kind: 'monthly', hour, minute, day } };
}

function matchesNow(schedule, now) {
  if (now.hour !== schedule.hour || now.minute !== schedule.minute) return false;

  switch (schedule.kind) {
    case 'daily':
      return true;
    case 'weekly':
      return schedule.dow.includes(now.dow);
    case 'once':
      return now.month === schedule.month && now.day === schedule.day;
    case 'monthly':
      return now.day === schedule.day;
    default:
      return false;
  }
}

function warnOnce(rowId, message) {
  if (lastWarnings.get(rowId) === message) return;
  if (message) {
    console.warn(`Skipping row ID=${rowId}: ${message}.`);
  }
  lastWarnings.set(rowId, message);
}

async function withRetry(label, fn, delays = RETRY_DELAYS_MS) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= delays.length) throw err;
      const wait = delays[attempt];
      console.error(
        `Failed to ${label} (attempt ${attempt + 1}/${delays.length + 1}): ` +
          `${err.message}. Retrying in ${Math.round(wait / 1000)}s.`
      );
      await sleep(wait);
    }
  }
}

async function fireAnnouncement(row, groupId) {
  console.log(`Firing announcement ID=${row.id} (${row.title})`);
  try {
    await withRetry(`send announcement ID=${row.id}`, async () => {
      const fresh = (await fetchAnnouncements()).find((r) => r.id === row.id) || row;
      const text = formatMessage(fresh);
      await sendMessage(groupId, text);
    });
    console.log(`Sent announcement ID=${row.id}`);
  } catch (err) {
    console.error(`Failed to send announcement ID=${row.id}:`, err.message);
    await sendAlert(`Não consegui enviar o anúncio "${row.title}" (ID=${row.id}).\n\nErro: ${err.message}`);
  }
}

async function checkSchedules() {
  const groupId = process.env.WHATSAPP_GROUP_JID;
  if (!groupId) {
    console.error('WHATSAPP_GROUP_JID not set, skipping.');
    return;
  }

  let announcements;
  try {
    announcements = await fetchAnnouncements();
  } catch (err) {
    console.error('Failed to fetch announcements from Google Sheets:', err.message);
    return;
  }

  const now = getNowInTz(CHURCH_TZ);
  const minuteKey = `${now.year}-${now.month}-${now.day} ${now.hour}:${now.minute}`;

  for (const row of announcements) {
    const { schedule, error } = describeRowSchedule(row);
    warnOnce(row.id, error);
    if (error) continue;

    if (!matchesNow(schedule, now)) continue;
    if (lastFiredKeys.get(row.id) === minuteKey) continue;
    lastFiredKeys.set(row.id, minuteKey);

    await fireAnnouncement(row, groupId);
  }
}

/**
 * Registers a single cron that polls every minute and compares the current
 * wall-clock time against each active row's own schedule (daily / weekly /
 * monthly / one-time).
 *
 * This task is never stopped or recreated. The previous design registered
 * one cron pattern per row and rebuilt all of them hourly by stopping every
 * active task - including the hourly sync task itself - and restarting from
 * an empty list. Because nothing ever re-added the sync task, the very first
 * resync permanently stopped all future resyncs: schedule changes made in
 * admin-ui silently stopped taking effect until the container restarted.
 * Polling also drops the lag on a schedule change from an hour to a minute.
 */
function setupSchedule() {
  cron.schedule('* * * * *', () => {
    checkSchedules().catch((err) => console.error('Error checking announcement schedules:', err.message));
  }, { timezone: CHURCH_TZ });
  console.log('Polling the Announcements sheet every minute (America/Los_Angeles).');
}

module.exports = { setupSchedule, checkSchedules, describeRowSchedule, matchesNow, withRetry };
