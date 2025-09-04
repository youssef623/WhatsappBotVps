// bulkSender.js
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const readline = require("readline");

// Helper for asking user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true }
});

client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
    console.log("📱 Scan the QR code with your WhatsApp Business.");
});

client.on("ready", async () => {
    console.log("✅ WhatsApp bot is ready!");

    // Ask for confirmation before sending
    const answer = await askQuestion("⚠️ Do you want to start sending messages now? (yes/no): ");
    if (answer.toLowerCase() !== "yes") {
        console.log("❌ Sending cancelled by user.");
        rl.close();
        process.exit();
    }

    // List of numbers (MUST include country code, without +)
    const numbers = ["201015043965","201094280909","201007739722","201147817382","249968128546","201211905073","201223401966","201003939355","201097530759","201115442342","201154240794","201156598456","201009889011","201004957269","201116836029","201096727333","201121824724","201061239491","201559153442","201006233738","201204957896","201288823179"];


    // Message you want to send
    const message1 = `السلام عليكم، بفكّر حضرتك إن ميعاد التجديد كمان 5 ايام إن شاء الله. 

يوم :  8/9/2025

🎁 التجديد بسعر 229

✅ عروض التجديد:
•⁠  ⁠٣ شهور – بسعر 597 (يوازي 199 بس شهري)

🟠 تحب تجدد لمدة شهر ولا نستفيد من خصم الفترة الأطول؟

ممكن ندفع instapay علي ده:
https://ipn.eg/S/youssefyasseribrahim1/instapay/5O4rbX
او من خلال اي محفظة علي الرقم دة:

01002141264

بعد التجديد📩:
تبعت صورة تأكيد التحويل`;

const message2 = `معلش بنفكر حضرتك لاخر مرة بتجديد الاشتراك❤️

ممكن ندفع instapay علي ده:
https://ipn.eg/S/youssefyasseribrahim1/instapay/5O4rbX
او من خلال اي محفظة علي الرقم دة:

01002141264

بعد التجديد📩:
تبعت صورة تأكيد التحويل.`;

    for (const number of numbers) {
        const chatId = number + "@c.us";
        try {
            await client.sendMessage(chatId, message2);
            console.log(`📤 Sent to ${number}`);
        } catch (err) {
            console.error(`❌ Failed to send to ${number}:`, err.message);
        }
        await delay(5000); // wait 5 seconds before next message
    }

    console.log("✅ All messages processed!");
    rl.close();
});

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

client.initialize();
