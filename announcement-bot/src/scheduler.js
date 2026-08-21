'use strict';

const cron = require('node-cron');
const { fetchAnnouncements } = require('./sheets');
const { formatMessage } = require('./messages');
const { sendMessage } = require('./whatsapp');

let activeTasks = [];

const DOW_MAP = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function clearSchedules() {
  activeTasks.forEach((task) => task.stop());
  activeTasks = [];
}

function parseTime(time) {
  const [hour, minute] = time.split(':');
  return { hour: hour.trim(), minute: minute.trim() };
}

/**
 * Builds the cron expression(s) for a row, based on its `freq` column.
 * Blank/unrecognized freq defaults to "monthly" for backward compatibility
 * with rows written before this column existed.
 * @returns {string[]} cron expressions to schedule (usually one, empty if unschedulable)
 */
function buildCronExpressions(row) {
  const { hour, minute } = parseTime(row.time);
  const freq = (row.freq || 'monthly').toLowerCase();

  if (freq === 'daily') {
    return [`0 ${minute} ${hour} * * *`];
  }

  if (freq === 'weekly') {
    const codes = (row.byday || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    const dow = codes.map((c) => DOW_MAP[c]).filter((n) => n !== undefined);
    if (dow.length === 0) {
      console.warn(`Row ID=${row.id}: freq=weekly but no valid byday codes, skipping.`);
      return [];
    }
    return [`0 ${minute} ${hour} * * ${dow.join(',')}`];
  }

  if (freq === 'none') {
    // One-time send on a specific date. Cron has no "just once, ever" mode,
    // so this pins day-of-month AND month — it fires on that calendar date
    // every year the row stays active. For a true one-off, deactivate the
    // row after it sends (admin-api can do this; this bot only has read
    // access to the sheet via GOOGLE_API_KEY, so it can't write that back).
    if (!row.date_once) {
      console.warn(`Row ID=${row.id}: freq=none but no date_once, skipping.`);
      return [];
    }
    const [, month, day] = row.date_once.split('-');
    if (!month || !day) {
      console.warn(`Row ID=${row.id}: invalid date_once "${row.date_once}", skipping.`);
      return [];
    }
    return [`0 ${minute} ${hour} ${parseInt(day, 10)} ${parseInt(month, 10)} *`];
  }

  // monthly (default)
  if (!row.day) {
    console.warn(`Row ID=${row.id}: freq=monthly but no day, skipping.`);
    return [];
  }
  return [`0 ${minute} ${hour} ${row.day} * *`];
}

async function setupSchedules() {
  clearSchedules();

  const groupId = process.env.WHATSAPP_GROUP_JID;
  if (!groupId) {
    throw new Error('WHATSAPP_GROUP_JID must be set in .env');
  }

  let announcements;
  try {
    announcements = await fetchAnnouncements();
  } catch (err) {
    console.error('Failed to fetch announcements from Google Sheets:', err.message);
    return;
  }

  if (announcements.length === 0) {
    console.warn('No active announcements found. Scheduler will retry on next hourly sync.');
    return;
  }

  console.log(`Scheduling ${announcements.length} active announcement(s)...`);

  for (const row of announcements) {
    if (!row.time) {
      console.warn(`Skipping row ID=${row.id}: missing time.`);
      continue;
    }

    const cronExprs = buildCronExpressions(row);

    for (const cronExpr of cronExprs) {
      if (!cron.validate(cronExpr)) {
        console.warn(`Skipping row ID=${row.id}: invalid cron expression "${cronExpr}".`);
        continue;
      }

      const task = cron.schedule(cronExpr, async () => {
        console.log(`Firing announcement ID=${row.id} (${row.title})`);
        try {
          const fresh = (await fetchAnnouncements()).find((r) => r.id === row.id) || row;
          const text = formatMessage(fresh);
          await sendMessage(groupId, text);
          console.log(`Sent announcement ID=${row.id}`);
        } catch (err) {
          console.error(`Failed to send announcement ID=${row.id}:`, err.message);
        }
      }, { timezone: 'America/Los_Angeles' });

      activeTasks.push(task);
      console.log(`  Scheduled ID=${row.id} "${row.title}" (${row.freq || 'monthly'}) at cron: ${cronExpr}`);
    }
  }
}

function startPeriodicSync() {
  const syncTask = cron.schedule('0 * * * *', async () => {
    console.log('Re-syncing schedules from Google Sheets...');
    await setupSchedules();
  }, { timezone: 'America/Los_Angeles' });

  activeTasks.push(syncTask);
}

module.exports = { setupSchedules, startPeriodicSync, buildCronExpressions };
