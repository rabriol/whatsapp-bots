'use strict';

require('dotenv').config();

const { setupSchedule } = require('./scheduler');

console.log('Starting Church Announcement Bot...');
setupSchedule();
console.log('Bot is running. Press Ctrl+C to stop.');
