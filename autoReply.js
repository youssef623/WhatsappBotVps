const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const START_TIME = Date.now(); // record the time when bot starts

const puppeteer = require('puppeteer-core');  // Use puppeteer-core to use system-installed Chromium

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "mainBot" }),
  puppeteer: { 
    headless: true,  // Run Chromium in headless mode
    executablePath: '/usr/bin/chromium-browser'  // Path to system-installed Chromium
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
  "حساب"
];

const COOLDOWN_HOURS = 720;
const STORE = "./lastReplied.json";
const SUBSCRIBED_FILE = "./subscribed.json";

let lastReplied = fs.existsSync(STORE)
  ? JSON.parse(fs.readFileSync(STORE))
  : {};

const saveStore = () =>
  fs.writeFileSync(STORE, JSON.stringify(lastReplied, null, 2));

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

// Show QR if first time
client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("📱 Scan the QR code above with WhatsApp Business.");
});

client.on("ready", () => {
  console.log("✅ Auto-reply bot connected and ready!");
});

client.on("disconnected", (reason) => {
  console.log("⚠️ Disconnected:", reason);
});

client.on("message", async (msg) => {
  const state = await client.getState();
  if (state !== "CONNECTED") return;

  if (msg.timestamp * 1000 < START_TIME) {
    return;
  }
  if (subscribed[msg.from]) {
    // log activity only (no auto-reply, no sendSeen)
    const today = new Date().toLocaleDateString("en-CA");

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
    saveSubscribedLog();

    return;
  }

  const text = (msg.body || "").toLowerCase();
  if (!TRIGGERS.some((w) => text.includes(w))) return;

  const now = Date.now();
  const last = lastReplied[msg.from] || 0;
  const hoursSince = (now - last) / (1000 * 60 * 60);
  if (hoursSince < COOLDOWN_HOURS) return;

  const chat = await msg.getChat();
  await chat.sendSeen();

  await client.sendMessage(
    msg.from,
    `اشترك في ChatGPT Plus – إصدار ChatGPT 5 بخصم 70٪
على التطبيق و الموقع الرسمي

-  شهر حساب مشترك مع ٥ اشخاص :
 ✅بسعر 229 جنية / الشهر

✨ ليه تختارنا عن باقي الصفحات؟

1️⃣ استمرارية بدون فقدان بيانات
بنجدّد ليك كل شهر على نفس الحساب، يعني شغلك وداتا المحادثات بتفضل موجودة زي ما هي.

2️⃣ أمان واستقرار الخدمة
إحنا ملتزمين بعدد المستخدمين المتفق عليه، وبالتالي مش هتواجه مشاكل زي Suspicious Activity أو توقف مفاجئ.

شرح الحساب المشترك👇`
  );
  await randomDelay(); // waits 1–5 seconds

  await client.sendMessage(
    msg.from,
    `شرح الحساب المشترك👇

✅229 جنية / الشهر
الحساب المشترك في ChatGPT Plus – إصدار ChatGPT 5 هو حساب و اشتراك واحد بيتقسم على 5 أشخاص تبعنا حضرتك واحد منهم (مش بتجيب انت ناس) 👥، وده بيخلي التكلفة أقل بكتير علي الفرد 229 جنية بس 💸، لكن من غير أي تأثير على المميزات أو السرعة ⚡️.

هتقدر تستمتع بكل حاجة موجودة في البلص🦾

‏١- GPT-5 بأقصى سرعة وبدون أي حدود 🚀
٢-تعديل وتصميم الصور بحد اقصي 30 صورة كل 3 ساعات للحساب 🎨
٣-فيديوهات Sora الجديدة 🎬
٤-رفع صور 🖼️ و فايلات 📁
٥-الليمت الوحيد علي ال Advanced voice Mode🎙️🚫 

اهم حاجة ⭐️ بدون أي حدود أو تقليل في الأداء ✅⭐️

يعني من الاخر بتوفر 💰وفي نفس الوقت بتاخد كل حاجة…..!🧠`
  );
  await randomDelay(); // waits 1–5 seconds

  await client.sendMessage(
    msg.from,
    "🌹 حضرتك حابب تشترك او عندك أي استفسار تاني ؟"
  );

  lastReplied[msg.from] = now;
  saveStore();
});

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

client.initialize();

function randomDelay(min = 1000, max = 5000) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((res) => setTimeout(res, ms));
}
