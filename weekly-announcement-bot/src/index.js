'use strict';

require('dotenv').config();

const { setupSchedule } = require('./scheduler');

async function main() {
  console.log('Starting Weekly Announcement Bot...');
  setupSchedule();
  console.log('Bot is running. Press Ctrl+C to stop.');
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
