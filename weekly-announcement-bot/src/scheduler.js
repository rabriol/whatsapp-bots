'use strict';

const cron = require('node-cron');
const { RRule } = require('rrule');
const { fetchSheetRows, fetchSettings } = require('./sheets');
const { createEventsModule } = require('../../shared/events');
const { sendMessage } = require('./sender');

const { buildEventEntries, formatMessage } = createEventsModule(RRule);
const DEFAULT_WINDOW_DAYS = 45;

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

/**
 * Schedules the job to run every Saturday at 11:00 AM America/Los_Angeles.
 */
function setupSchedule() {
  cron.schedule('0 11 * * 6', runJob, { timezone: 'America/Los_Angeles' });
  console.log('[weekly-bot] Scheduled: Saturdays 11:00 AM America/Los_Angeles');
}

module.exports = { setupSchedule, runJob };
