'use strict';

const cron = require('node-cron');
const { fetchAnnouncements } = require('./sheets');
const { formatMessage } = require('./messages');
const { sendMessage } = require('./whatsapp');

let activeTasks = [];

function clearSchedules() {
  activeTasks.forEach((task) => task.stop());
  activeTasks = [];
}

function parseTime(time) {
  const [hour, minute] = time.split(':');
  return { hour: hour.trim(), minute: minute.trim() };
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
    const { day, time } = row;

    if (!day || !time) {
      console.warn(`Skipping row ID=${row.id}: missing day or time.`);
      continue;
    }

    const { hour, minute } = parseTime(time);
    const cronExpr = `0 ${minute} ${hour} ${day} * *`;

    if (!cron.validate(cronExpr)) {
      console.warn(`Skipping row ID=${row.id}: invalid cron expression "${cronExpr}".`);
      continue;
    }

    const task = cron.schedule(cronExpr, async () => {
      console.log(`Firing announcement ID=${row.id} (${row.title})`);
      try {
        const fresh = await fetchAnnouncements();
        const freshRow = fresh.find((r) => r.id === row.id) || row;
        const text = formatMessage(freshRow);
        await sendMessage(groupId, text);
        console.log(`Sent announcement ID=${row.id}`);
      } catch (err) {
        console.error(`Failed to send announcement ID=${row.id}:`, err.message);
      }
    }, { timezone: 'America/Los_Angeles' });

    activeTasks.push(task);
    console.log(`  Scheduled ID=${row.id} "${row.title}" at cron: ${cronExpr}`);
  }
}

function startPeriodicSync() {
  const syncTask = cron.schedule('0 * * * *', async () => {
    console.log('Re-syncing schedules from Google Sheets...');
    await setupSchedules();
  }, { timezone: 'America/Los_Angeles' });

  activeTasks.push(syncTask);
}

module.exports = { setupSchedules, startPeriodicSync };
