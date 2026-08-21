'use strict';

require('dotenv').config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

module.exports = {
  port: process.env.PORT || 3000,
  googleSheetsId: requireEnv('GOOGLE_SHEETS_ID'),
  announcementSheetName: process.env.ANNOUNCEMENT_SHEET_NAME || 'Announcements',
  birthdaySheetName: process.env.BIRTHDAY_SHEET_NAME || 'Sheet1',
  settingsSheetName: process.env.SETTINGS_SHEET_NAME || 'Settings',
  credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account.json',
};
