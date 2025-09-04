// imap_watch.js
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function withClient(cfg, fn) {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure !== false,
    auth: { user: cfg.user, pass: cfg.pass }
  });
  await client.connect();
  try {
    await client.mailboxOpen('INBOX');
    return await fn(client);
  } finally {
    try { await client.logout(); } catch {}
  }
}

/**
 * Watch a mailbox until a code is found or we hit the deadline.
 * - cfg: {host,port,secure,user,pass}
 * - options: { codeRegex: RegExp, deadlineTs: number, markSeen: boolean }
 * Returns { code, meta } or null if timeout/no match.
 */
async function watchForCode(cfg, options, onStatus=()=>{}) {
  const { codeRegex, deadlineTs, markSeen } = options;

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure !== false,
    auth: { user: cfg.user, pass: cfg.pass }
  });

  await client.connect();
  let closed = false;
  const closeClient = async () => { if (!closed) { closed = true; try { await client.logout(); } catch {} } };

  try {
    await client.mailboxOpen('INBOX');

    // Helper: parse one message by UID and try to extract code
    const tryMessage = async (uid) => {
      const msg = await client.fetchOne(uid, { source: true, envelope: true, flags: true, internalDate: true });
      if (!msg || !msg.source) return null;
      const parsed = await simpleParser(msg.source);
      const blob = [parsed.subject || '', parsed.text || '', parsed.html || ''].join('\n');
      const m = blob.match(codeRegex);
      if (m) {
        // mark seen if requested
        if (markSeen && !(msg.flags || []).includes('\\Seen')) {
          try { await client.messageFlagsAdd({ uid }, ['\\Seen']); } catch {}
        }
        return {
          code: m[1],
          meta: {
            subject: parsed.subject || '',
            from: parsed.from?.text || '',
            date: parsed.date ? new Date(parsed.date).toISOString() : ''
          }
        };
      }
      return null;
    };

    // 1) First, scan recent UNSEEN (catch emails that arrived just before we started)
    const unseen = await client.search({ seen: false });
    unseen.sort((a,b)=>a-b); // ascending by UID
    for (const uid of unseen.slice(-10)) {
      const res = await tryMessage(uid);
      if (res) return res;
    }

    // 2) Realtime: listen for new arrivals
    onStatus('idling');
    // Track the highest UID we've seen to avoid duplicates
    let lastUid = client.mailbox.exists || 0;

    while (Date.now() < deadlineTs) {
      // Enter IDLE; it returns once something changes or server pushes an event
      await client.idle({ timeout: 15000 }); // wake up at least every 15s

      // New messages?
      const exists = client.mailbox.exists || 0;
      if (exists > lastUid) {
        for (let uid = lastUid + 1; uid <= exists; uid++) {
          const res = await tryMessage(uid);
          if (res) return res;
        }
        lastUid = exists;
      }

      // Short nap to avoid tight loops
      await sleep(300);
    }

    return null; // timeout
  } finally {
    await closeClient();
  }
}

module.exports = { watchForCode, withClient };
