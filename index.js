// install once: npm i express dotenv
require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.json({ limit: '1mb' }));

const FLOW_SECRET = process.env.FLOW_SECRET || 'dev-secret'; // set the same in the Flow header

app.post('/webhook', (req, res) => {
  // optional shared-secret check
  if (req.get('X-Flow-Secret') !== FLOW_SECRET) {
    return res.status(403).send('Forbidden');
  }

  const { from, to, subject, body, bodyPreview, emailAddress } = req.body || {};
  const text = String(bodyPreview || body || '');

  // simple 4–8 digit code regex — tweak if your codes differ
  const m = text.match(/\b(\d{4,8})\b/);

  console.log('📩 Webhook payload:', { from, to, subject, preview: text.slice(0, 120) });
  if (m) {
    console.log(`✅ Extracted code ${m[1]} for ${emailAddress || to || 'unknown mailbox'}`);
    // TODO: send with whatsapp-web.js to the waiting chat
  } else {
    console.log('⚠️ No code found in message');
  }

  res.sendStatus(200);
});

app.listen(3000, () => console.log('Webhook listening on http://localhost:3000/webhook'));

require('dotenv').config();
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { watchForCode } = require('./imap_watch');

const CODE_REGEX = new RegExp(process.env.CODE_REGEX || '\\b(\\d{4,8})\\b', 'i');
const WATCH_WINDOW_SECONDS = parseInt(process.env.WATCH_WINDOW_SECONDS || '600', 10);
const MARK_AS_SEEN = (process.env.MARK_AS_SEEN || 'true').toLowerCase() === 'true';
const NO_CODE_MESSAGE = process.env.NO_CODE_MESSAGE || 'No code received in time. Try again or resend the email.';

const accounts = JSON.parse(fs.readFileSync('./accounts.json', 'utf-8'));

const wa = new Client({
  authStrategy: new LocalAuth(), // persists QR session on disk
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
});

wa.on('qr', qr => {
  console.log('Scan this QR with your WhatsApp Business app:');
  qrcode.generate(qr, { small: true });
});
wa.on('ready', () => console.log('✅ WhatsApp is ready'));
wa.on('auth_failure', (m) => console.error('WhatsApp auth failure:', m));
wa.initialize();

// Simple email extractor
function extractEmail(text) {
  const m = (text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : null;
}

// Track active watchers to avoid duplicates per chat
const active = new Map(); // chatId -> { email, cancel:Function }

async function handleEmailRequest(chatId, email) {
  // prevent duplicate watcher for same chat
  if (active.has(chatId)) {
    try { active.get(chatId).cancel(); } catch {}
    active.delete(chatId);
  }

  const cfg = accounts[email.toLowerCase()];
  if (!cfg) {
    await wa.sendMessage(chatId, `I don't have IMAP credentials for ${email}. Add it to accounts.json and restart.`);
    return;
  }

  const until = Date.now() + WATCH_WINDOW_SECONDS * 1000;
  let canceled = false;
  const cancel = () => { canceled = true; };
  active.set(chatId, { email, cancel });

  await wa.sendMessage(chatId, `Watching ${email} for ${Math.round(WATCH_WINDOW_SECONDS/60)} min. I’ll send the first code I see.`);

  try {
    const res = await watchForCode(cfg, {
      codeRegex: CODE_REGEX,
      deadlineTs: until,
      markSeen: MARK_AS_SEEN
    }, (status) => {
      // optional: console.log('Status:', status);
    });

    if (canceled) return; // user issued a new request

    if (res && res.code) {
      await wa.sendMessage(chatId, `Code for ${email}: *${res.code}*`);
    } else {
      await wa.sendMessage(chatId, NO_CODE_MESSAGE);
    }
  } catch (e) {
    await wa.sendMessage(chatId, `Error watching ${email}: ${e.message || e}`);
  } finally {
    active.delete(chatId);
  }
}

wa.on('message', async (msg) => {
  const chatId = msg.from;
  const email = extractEmail(msg.body);
  if (!email) return; // ignore non-email messages

  handleEmailRequest(chatId, email).catch(async (e) => {
    await wa.sendMessage(chatId, `Failed: ${e.message || e}`);
  });
});
