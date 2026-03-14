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

module.exports = { sendMessage };
