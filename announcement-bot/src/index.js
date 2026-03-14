'use strict';

require('dotenv').config();

const { setupSchedules, startPeriodicSync } = require('./scheduler');

async function main() {
  console.log('Starting Church Announcement Bot...');

  await setupSchedules();
  startPeriodicSync();

  console.log('Bot is running. Press Ctrl+C to stop.');
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
