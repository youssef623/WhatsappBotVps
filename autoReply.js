const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");

const puppeteer = require("puppeteer-core"); // Use puppeteer-core to use system-installed Chromium
const { Console } = require("console");

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "mainBot" }),
  puppeteer: {
    headless: true,
    executablePath: "/usr/bin/chromium-browser", // Path to system-installed Chromium
    args: ["--no-sandbox", "--disable-setuid-sandbox"], // Add --no-sandbox flag
  },
});

const TRIGGERS = [
  "الإشتراك",
  "اشتراك",
  "مدة",
  "ازاي",
  "الرسمي",
  "شرح",
  "الفرق",
  "المميزات",
  "info",
  "تفاصيل",
  "?",
  "؟",
  "كيف",
  "كيفية",
  "طريقة",
  "!",
  "details",
  "information",
  "حساب",
  "السلام",
  "عليكم",
];
const BOT_NUMBER = "201000062966@c.us";
const MY_NUMBER = "201002141264@c.us";
const Karam_NUMBER = "201098400086@c.us";

const COOLDOWN_HOURS = 720;
const STORE = "./lastReplied.json";
const SUBSCRIBED_FILE = "./subscribed.json";
const NOTIFICATION_FILE = "./notificationSent.json";
let notificationSent = fs.existsSync(NOTIFICATION_FILE)
  ? JSON.parse(fs.readFileSync(NOTIFICATION_FILE))
  : {};

let lastReplied = fs.existsSync(STORE)
  ? JSON.parse(fs.readFileSync(STORE))
  : {};

const saveStore = () =>
  fs.writeFileSync(STORE, JSON.stringify(lastReplied, null, 2));
const saveNotificationSent = () =>
  fs.writeFileSync(
    NOTIFICATION_FILE,
    JSON.stringify(notificationSent, null, 2)
  );

// Load subscribed numbers
let subscribed = {};
if (fs.existsSync(SUBSCRIBED_FILE)) {
  subscribed = JSON.parse(fs.readFileSync(SUBSCRIBED_FILE));
  console.log(
    `📂 Loaded ${Object.keys(subscribed).length} subscribed numbers.`
  );
}

const SUBSCRIBED_LOG_FILE = "./subscribedLog.json";

let subscribedLog = {};
if (fs.existsSync(SUBSCRIBED_LOG_FILE)) {
  subscribedLog = JSON.parse(fs.readFileSync(SUBSCRIBED_LOG_FILE));
  console.log(
    `📂 Loaded ${Object.keys(subscribedLog).length} subscribed log entries.`
  );
}

const saveSubscribedLog = () => {
  fs.writeFileSync(SUBSCRIBED_LOG_FILE, JSON.stringify(subscribedLog, null, 2));
};

// -------------------- [NEW] Daily stats persistence --------------------
const DAILY_STATS_FILE = "./dailyStats.json";
let dailyStats = fs.existsSync(DAILY_STATS_FILE)
  ? JSON.parse(fs.readFileSync(DAILY_STATS_FILE))
  : {};
const saveDailyStats = () =>
  fs.writeFileSync(DAILY_STATS_FILE, JSON.stringify(dailyStats, null, 2));

/** Returns YYYY-MM-DD for Cairo time (fixed GMT+3 like your quiet-hours) */
function todayKeyCairo(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(d)
    .reduce((a, p) => ((a[p.type] = p.value), a), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function ensureTodayStats() {
  const key = todayKeyCairo();
  if (!dailyStats[key]) {
    dailyStats[key] = {
      messagesTotal: 0,
      autoRepliedCount: 0,
      notificationsSentCount: 0,
      uniqueSenders: [], // store as arrays for persistence
      subscribedSenders: [],
      nonSubSenders: [],
      subscribedQuietHoursSenders: [],
    };
    saveDailyStats();
  }
  return key;
}

function addToUnique(listArr, id) {
  if (!listArr.includes(id)) listArr.push(id);
}

// Show QR if first time
client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("📱 Scan the QR code above with WhatsApp Business.");
});

client.on("ready", () => {
  console.log("✅ Auto-reply bot connected and ready!");
  startDailyReportTicker();
});

client.on("disconnected", async (reason) => {
  console.log("⚠️ Disconnected:", reason);
    await client.initialize();

});

client.on("message", async (msg) => {
  const state = await client.getState();
  if (state !== "CONNECTED") return;

  if (msg.fromMe || msg.from === MY_NUMBER || msg.from === BOT_NUMBER) return;

  if (!msg.body || msg.body.trim() === "") {
    return;
  }
  const key = ensureTodayStats();
  dailyStats[key].messagesTotal += 1;
  addToUnique(dailyStats[key].uniqueSenders, msg.from);
  saveDailyStats(); // <--- add this line

  if (subscribed[msg.from]) {
    // log activity only (no auto-reply, no sendSeen)
    const today = todayKeyCairo();

    addToUnique(dailyStats[key].subscribedSenders, msg.from);
    saveDailyStats();

    if (!subscribedLog[msg.from]) {
      subscribedLog[msg.from] = {
        lastMessaged: today,
        messages: 1,
        days: 1,
      };

      console.log(
        `ℹ️ ${msg.from} is in subscribed.json, logged activity, skipping auto-reply.`
      );
    } else {
      if (subscribedLog[msg.from].lastMessaged !== today) {
        subscribedLog[msg.from].days += 1;

        console.log(
          `ℹ️ ${msg.from} is in subscribed.json, logged activity, skipping auto-reply.`
        );
      }

      subscribedLog[msg.from].lastMessaged = today;
      subscribedLog[msg.from].messages += 1;
    }
    
    await handleUnanswered(msg, "Subscriber", msg.body);
    saveSubscribedLog();

    return;
  }

  addToUnique(dailyStats[key].nonSubSenders, msg.from);
  saveDailyStats();
  const text = (msg.body || "").toLowerCase();
  const matched = TRIGGERS.some((w) => text.includes(w));

  if (!matched) {
    await handleUnanswered(msg, "Non-subscriber", msg.body);
    return;
  }

  const now = Date.now();
  const last = lastReplied[msg.from] || 0;
  const hoursSince = (now - last) / (1000 * 60 * 60);
  if (hoursSince < COOLDOWN_HOURS && msg.from !== Karam_NUMBER) {
    return;
  }

  const chat = await msg.getChat();
  await chat.sendSeen();

  await client.sendMessage(
    msg.from,`اشترك في ChatGPT Plus – إصدار ChatGPT 5 بخصم 70٪
على التطبيق و الموقع الرسمي

-  شهر حساب مشترك مع ٥ اشخاص :
 ✅بسعر 299 جنية / الشهر

✨ ليه تختارنا عن باقي الصفحات؟

1️⃣ استمرارية بدون فقدان بيانات
بنجدّد ليك كل شهر على نفس الحساب، يعني شغلك وداتا المحادثات بتفضل موجودة زي ما هي.

2️⃣ أمان واستقرار الخدمة
إحنا ملتزمين بعدد المستخدمين المتفق عليه، وبالتالي مش هتواجه مشاكل زي Suspicious Activity أو توقف مفاجئ.

شرح الحساب المشترك👇

✅299 جنية / الشهر
الحساب المشترك في ChatGPT Plus – إصدار ChatGPT 5 هو حساب و اشتراك واحد بيتقسم على 5 أشخاص تبعنا حضرتك واحد منهم (مش بتجيب انت ناس) 👥، وده بيخلي التكلفة أقل بكتير علي الفرد 299 جنية بس 💸، لكن من غير أي تأثير على المميزات أو السرعة ⚡️.

هتقدر تستمتع بكل حاجة موجودة في البلص🦾

١- GPT-5 بأقصى سرعة وبدون أي حدود 🚀
٢-تعديل وتصميم الصور بحد اقصي 30 صورة كل 3 ساعات للحساب 🎨
٣-فيديوهات Sora الجديدة 🎬
٤-رفع صور 🖼️ و فايلات 📁
٥-الليمت الوحيد علي ال Advanced voice Mode🎙️🚫 

اهم حاجة ⭐️ بدون أي حدود أو تقليل في الأداء ✅⭐️

يعني من الاخر بتوفر 💰وفي نفس الوقت بتاخد كل حاجة…..!🧠`
  );

  await delay(2000);

  await client.sendMessage(
    msg.from,
    "🌹 حضرتك حابب تشترك او عندك أي استفسار تاني ؟"
  );
  dailyStats[key].autoRepliedCount += 1;
  saveDailyStats();

  lastReplied[msg.from] = now;
  saveStore();
});

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

client.initialize();

async function handleUnanswered(msg, type, body) {
  const now = Date.now();
  const last = notificationSent[msg.from] || 0;
  const minsSince = (now - last) / (1000 * 60);

  if (minsSince < 5 && msg.from !== Karam_NUMBER) return;
  if (isQuietHoursCairo()) {
    console.log(`⏰ Quiet hours: skipped notification for ${msg.from}`);
    return;
  }
  const formattedNumber = msg.from.replace("@c.us", "");
  if (body != "") {
    await client.sendMessage(
      MY_NUMBER,
      `*${type}* \n\n  ${formattedNumber}\n\n "${body}"`
    );
  } else {
    await client.sendMessage(
      MY_NUMBER,
      `*${type}* \n\n  ${formattedNumber}\n\n "error body empty!"`
    );
  }

  const key = ensureTodayStats();
  dailyStats[key].notificationsSentCount += 1;
  saveDailyStats();

  notificationSent[msg.from] = now;
  saveNotificationSent();
}

function isQuietHoursCairo(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(d)
    .reduce((a, p) => ((a[p.type] = p.value), a), {});
  const h = parseInt(parts.hour, 10);
  const QUIET_START = 3; // inclusive
  const QUIET_END = 12; // exclusive
  return QUIET_START <= QUIET_END
    ? h >= QUIET_START && h < QUIET_END
    : h >= QUIET_START || h < QUIET_END;
}

function randomDelay(min = 1000, max = 5000) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((res) => setTimeout(res, ms));
}

// ---- DST-safe 23:59 Africa/Cairo scheduler ----
let lastReportKey = null;
function startDailyReportTicker() {
  setInterval(async () => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .reduce((a, p) => ((a[p.type] = p.value), a), {});

    const key = `${parts.year}-${parts.month}-${parts.day}`; // Cairo date
    // Fire once at 23:59 each Cairo day
    if (parts.hour === "23" && parts.minute === "59" && lastReportKey !== key) {
      try {
        await sendDailyReport(key);
      } catch (e) {
        console.error(e);
      }
      lastReportKey = key;
    }
  }, 30 * 1000); // check every 30s
}

async function sendDailyReport(key = todayKeyCairo()) {
  ensureTodayStats(); // makes sure key exists
  const s = dailyStats[key] || {};
  const messagesTotal = s.messagesTotal || 0;
  const autoRepliedCount = s.autoRepliedCount || 0;
  const notificationsSentCount = s.notificationsSentCount || 0;
  const uniquePeople = Array.isArray(s.uniqueSenders)
    ? s.uniqueSenders.length
    : 0;
  const subs = Array.isArray(s.subscribedSenders)
    ? s.subscribedSenders.length
    : 0;
  const nonSubs = Array.isArray(s.nonSubSenders) ? s.nonSubSenders.length : 0;
  const subsQuiet = Array.isArray(s.subscribedQuietHoursSenders)
    ? s.subscribedQuietHoursSenders.length
    : 0;

  const report = [
    `📊 *Daily Stats* (${key} – Cairo)`,
    `• Auto-replies sent: *${autoRepliedCount}*`,
    `• Unique people contacted: *${uniquePeople}*`,
    `• Total messages received: *${messagesTotal}*`,
    `• Non-subscribers who contacted: *${nonSubs}*`,
    `• Subscribed people messaged: *${subs}*`,
    `• Subscribed messaged during quiet hours: *${subsQuiet}*`,
    `• Notifications sent: *${notificationsSentCount}*`,
  ].join("\n");

  await client.sendMessage(MY_NUMBER, report);
  saveDailyStats();
}
