const { ImapFlow } = require("imapflow");

(async () => {
  const client = new ImapFlow({
    host: "outlook.office365.com",
    port: 993,
    secure: true,
    auth: {
      user: "thornr9@outlook.com",
      pass: "vsjdowuvmprlhguh"   // your App Password
    }
  });

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    console.log("✅ Logged in and mailbox opened!");
  } catch (err) {
    console.error("❌ Login failed:", err.message);
  } finally {
    try { await client.logout(); } catch {}
  }
})();
