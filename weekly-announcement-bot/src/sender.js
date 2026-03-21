'use strict';

const axios = require('axios');

/**
 * Sends a text message via the WhatsApp Gateway.
 *
 * @param {string} jid - Recipient JID (e.g. 120363XXXX@g.us)
 * @param {string} text - Message text
 */
async function sendMessage(jid, text) {
  const gatewayUrl = process.env.GATEWAY_URL;
  const token      = process.env.GATEWAY_TOKEN;

  if (!gatewayUrl) throw new Error('GATEWAY_URL must be set in .env');

  await axios.post(
    `${gatewayUrl}/send`,
    { jid, text },
    {
      timeout: 10000,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  );
}

module.exports = { sendMessage };
