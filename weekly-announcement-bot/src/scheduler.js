'use strict';

const cron = require('node-cron');
const { fetchSheetRows } = require('./sheets');
const { buildEventEntries, formatMessage } = require('./events');
const { sendMessage } = require('./sender');

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

  const entries = buildEventEntries(rows);
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
