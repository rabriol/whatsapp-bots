'use strict';

const cron = require('node-cron');
const { RRule } = require('rrule');
const { fetchSheetRows, fetchSettings } = require('./sheets');
const { createEventsModule } = require('../../shared/events');
const { sendMessage } = require('./sender');

const { buildEventEntries, formatMessage } = createEventsModule(RRule);
const DEFAULT_WINDOW_DAYS = 45;
const DEFAULT_SEND_RRULE = 'RRULE:FREQ=WEEKLY;BYDAY=SA';
const DEFAULT_SEND_TIME = '11:00';
const SEND_TZ = 'America/Los_Angeles';

// Fixed anchor for RRULE occurrence math (a Saturday, matching the
// original hardcoded default). This only matters for INTERVAL>1 patterns
// (e.g. "every 2 weeks"), where RFC5545 needs *some* reference point to
// know which weeks/months are "in phase". There's no natural start date
// for a recurring send schedule the way an event has its own start_date,
// so this is a fixed, deterministic stand-in - using "now" instead would
// silently make every interval a no-op, since re-parsing fresh on every
// poll would make "today" the anchor every single time.
const ANCHOR_DTSTART = new Date(Date.UTC(2024, 0, 6));

async function getWindowDays() {
  try {
    const settings = await fetchSettings();
    const n = parseInt(settings.event_window_days, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 180) return n;
  } catch (err) {
    console.error('[weekly-bot] Failed to read event_window_days, using default:', err.message);
  }
  return DEFAULT_WINDOW_DAYS;
}

async function getSendSchedule() {
  try {
    const settings = await fetchSettings();
    const rrule = (settings.weekly_send_rrule || '').trim() || DEFAULT_SEND_RRULE;
    const time = (settings.weekly_send_time || '').trim() || DEFAULT_SEND_TIME;
    return { rrule, time };
  } catch (err) {
    console.error('[weekly-bot] Failed to read send schedule, using default:', err.message);
    return { rrule: DEFAULT_SEND_RRULE, time: DEFAULT_SEND_TIME };
  }
}

// Returns {year, month, day, hour, minute} for "now" in the given
// timezone - matching the Intl-based approach admin-api already uses for
// birthday due-dates, to avoid the server's own (UTC, in production) local
// time.
function getNowInTz(tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour, 10) % 24, // midnight can format as "24" with hour12:false on some ICU builds
    minute: parseInt(map.minute, 10),
  };
}

function isTodayAnOccurrence(rruleStr, { year, month, day }) {
  try {
    const parsed = RRule.fromString(rruleStr);
    const rule = new RRule({ ...parsed.origOptions, dtstart: ANCHOR_DTSTART });
    const dayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59));
    return rule.between(dayStart, dayEnd, true).length > 0;
  } catch (err) {
    console.error('[weekly-bot] Failed to evaluate send schedule rrule, treating as no match:', err.message);
    return false;
  }
}

/**
 * Runs the weekly announcement job:
 * fetch events → filter/format → send to WhatsApp group.
 */
async function runJob() {
  console.log('[weekly-bot] Running job...');

  const groupJid = process.env.WHATSAPP_GROUP_JID;
  if (!groupJid) {
    console.error('[weekly-bot] WHATSAPP_GROUP_JID not set, skipping.');
    return;
  }

  let rows;
  try {
    rows = await fetchSheetRows();
  } catch (err) {
    console.error('[weekly-bot] Failed to fetch sheet:', err.message);
    return;
  }

  const windowDays = await getWindowDays();
  console.log(`[weekly-bot] Using ${windowDays}-day window`);

  const entries = buildEventEntries(rows, windowDays);
  if (entries.length === 0) {
    console.log('[weekly-bot] No upcoming events found, skipping send.');
    return;
  }

  const message = formatMessage(entries);

  try {
    await sendMessage(groupJid, message);
    console.log(`[weekly-bot] Message sent to ${groupJid}`);
  } catch (err) {
    console.error('[weekly-bot] Failed to send message:', err.message);
  }
}

let lastSentKey = null;

async function checkSchedule() {
  const now = getNowInTz(SEND_TZ);
  const { rrule, time } = await getSendSchedule();
  const [targetHour, targetMinute] = time.split(':').map(Number);

  if (now.hour !== targetHour || now.minute !== targetMinute) return;
  if (!isTodayAnOccurrence(rrule, now)) return;

  // Guards against firing twice for the same minute (e.g. an overlapping
  // slow check) - resets naturally once the minute rolls over.
  const key = `${now.year}-${now.month}-${now.day}-${now.hour}:${now.minute}`;
  if (lastSentKey === key) return;
  lastSentKey = key;

  await runJob();
}

/**
 * Checks every minute (America/Los_Angeles) whether the send schedule
 * configured in admin-ui matches "now", instead of registering a single
 * fixed cron pattern at startup - so a schedule change takes effect on the
 * very next check, without restarting this process.
 */
function setupSchedule() {
  cron.schedule('* * * * *', checkSchedule, { timezone: SEND_TZ });
  console.log('[weekly-bot] Polling send schedule every minute (America/Los_Angeles)');
}

module.exports = { setupSchedule, runJob };
