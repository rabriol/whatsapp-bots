'use strict';

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const express = require('express');
const path = require('path');

const AUTH_DIR = path.resolve(__dirname, '..', 'auth');
const PORT = 3000;

const app = express();
app.use(express.json());

// Tracks the active socket. null = not connected yet.
let sock = null;
let connectionStatus = 'connecting';

// ── WhatsApp connection ─────────────────────────────────────────────────────

async function connect() {
  connectionStatus = 'connecting';
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'warn' }),
    printQRInTerminal: false,
  });

  socket.ev.on('creds.update', saveCreds);

  socket.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\nScan this QR code with WhatsApp:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('WhatsApp connection established.');
      sock = socket;
      connectionStatus = 'connected';

      if (process.env.NOTIFICATION_JID) {
        const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Los_Angeles' });
        socket.sendMessage(process.env.NOTIFICATION_JID, {
          text: `✅ WhatsApp Gateway conectado em ${now}`,
        }).catch((err) => console.error('Failed to send startup notification:', err.message));
      }
    }

    if (connection === 'close') {
      sock = null;
      connectionStatus = 'disconnected';
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        console.error('WhatsApp logged out. Delete auth/ folder and restart.');
      } else {
        console.log('Connection closed. Reconnecting...');
        connect();
      }
    }
  });
}

// ── Routes ──────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: connectionStatus });
});

app.post('/send', async (req, res) => {
  const { jid, text } = req.body;

  if (!jid || !text) {
    return res.status(400).json({ error: 'Missing jid or text' });
  }

  if (connectionStatus !== 'connected' || !sock) {
    return res.status(503).json({ error: 'WhatsApp not connected', status: connectionStatus });
  }

  try {
    await sock.sendMessage(jid, { text });
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to send message:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Boot ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`WhatsApp Gateway listening on port ${PORT}`);
});

connect().catch((err) => {
  console.error('Fatal error during connect:', err.message);
  process.exit(1);
});
