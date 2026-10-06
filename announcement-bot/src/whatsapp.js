'use strict';

const axios = require('axios');

const GATEWAY_URL = process.env.GATEWAY_URL;

/**
 * Sends a text message via the WhatsApp Gateway.
 * @param {string} jid - Recipient JID (e.g. 120363XXXX@g.us)
 * @param {string} text - Message text
 */
async function sendMessage(jid, text) {
  if (!GATEWAY_URL) {
    throw new Error('GATEWAY_URL must be set in .env');
  }
  await axios.post(`${GATEWAY_URL}/send`, { jid, text }, { timeout: 10000 });
}

/**
 * Posts to the same group the gateway uses for its own health messages.
 * Never throws: an alert that fails must not replace the error it reports.
 * @param {string} text
 */
async function sendAlert(text) {
  const notificationJid = process.env.NOTIFICATION_JID;
  if (!notificationJid) {
    console.warn(`NOTIFICATION_JID not set, alert not delivered: ${text}`);
    return;
  }

  try {
    await sendMessage(notificationJid, `⚠️ *announcement-bot*\n\n${text}`);
  } catch (err) {
    console.error('Failed to deliver alert:', err.message);
  }
}

module.exports = { sendMessage, sendAlert };
