const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

const TOKEN = "8649973945:AAHsaN1YZ1Vt_rtPTqjNKefLKvpAKHJEASI";
const WEBAPP_URL = "https://akshin013.github.io/P2P-Helper/index/app.html";

const bot = new TelegramBot(TOKEN, { polling: true });

// ───── настройки ─────
let running = false;
let SEARCH_AMOUNT = "3000";
let MAX_PRICE = 82;

let USE_PRICE_FILTER = false;
let USE_BLACKLIST = true;

const BLACKLIST = ["тбанк", "тинькофф", "tinkoff"];

let totalChecked = 0;
let totalFound = 0;

let lastStatusMsg = null;
let seen = new Set();

// ───── клавиатура ─────
const keyboard = {
  reply_markup: {
    keyboard: [
      [{ text: "📱 Открыть панель", web_app: { url: WEBAPP_URL } }],
      ["▶️ Старт", "⛔ Стоп", "📊 Статус"]
    ],
    resize_keyboard: true
  }
};

// ───── старт ─────
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "🚀 Запусти сканер", keyboard);
});

// ───── сообщения ─────
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  // 📱 WebApp данные
  if (msg.web_app_data) {
    const data = JSON.parse(msg.web_app_data.data);

    SEARCH_AMOUNT = data.amount || SEARCH_AMOUNT;
    USE_BLACKLIST = data.blacklist;
    USE_PRICE_FILTER = data.priceFilter;
    MAX_PRICE = Number(data.maxPrice || MAX_PRICE);

    if (data.running && !running) startScanner(chatId);
    if (!data.running && running) stopScanner(chatId);

    return;
  }

  if (msg.text === "▶️ Старт") {
    if (!running) startScanner(chatId);
  }

  if (msg.text === "⛔ Стоп") {
    stopScanner(chatId);
  }

  if (msg.text === "📊 Статус") {
    bot.sendMessage(chatId,
      `📊 СТАТУС\n🤖 ${running ? "Работает" : "Стоп"}\n🔍 ${SEARCH_AMOUNT}\n📦 ${totalChecked}\n🔥 ${totalFound}`
    );
  }
});

// ───── фильтр ─────
function isValid(ad) {
  const text = (ad.remark || "").toLowerCase();

  if (!text.includes(SEARCH_AMOUNT)) return false;

  if (USE_BLACKLIST && BLACKLIST.some(b => text.includes(b))) return false;

  if (USE_PRICE_FILTER && Number(ad.price) > MAX_PRICE) return false;

  return true;
}

// ───── управление ─────
function startScanner(chatId) {
  running = true;
  totalChecked = 0;
  totalFound = 0;
  seen.clear();

  bot.sendMessage(chatId, `✅ Запуск\n🔍 ${SEARCH_AMOUNT}`, keyboard);
  scanner(chatId);
}

function stopScanner(chatId) {
  running = false;
  bot.sendMessage(chatId, "⛔ Остановлен", keyboard);
}

// ───── сканер ─────
async function scanner(chatId) {
  while (running) {
    try {
      const res = await axios.post("https://api2.bybit.com/fiat/otc/item/online", {
        tokenId: "USDT",
        currencyId: "RUB",
        side: "1",
        size: "50",
        page: "1"
      });

      const ads = res.data?.result?.items || [];
      totalChecked += ads.length;

      for (const ad of ads) {
        if (!isValid(ad)) continue;
        if (seen.has(ad.id)) continue;

        seen.add(ad.id);
        totalFound++;

        const link = `https://www.bybit.com/fiat/trade/otc?tab=buy&id=${ad.id}`;

        const order = {
          id: ad.id,
          nick: ad.nickName,
          price: ad.price,
          min: ad.minAmount,
          max: ad.maxAmount,
          remark: ad.remark,
          link,
          time: new Date().toLocaleTimeString()
        };

        const encoded = encodeURIComponent(JSON.stringify(order));

        await bot.sendMessage(chatId,
          `🔥 ОРДЕР\n👤 ${order.nick}\n💰 ${order.price}\n📝 ${order.remark}`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: "🔗 Открыть", url: link },
                { text: "📱 Панель", web_app: { url: WEBAPP_URL + "?order=" + encoded } }
              ]]
            }
          }
        );
      }

      // 🧹 удаляем старый статус
      if (lastStatusMsg) {
        try { await bot.deleteMessage(chatId, lastStatusMsg); } catch {}
      }

      const msg = await bot.sendMessage(chatId,
        `⏳ Сканирую...\n📦 ${totalChecked}\n🔥 ${totalFound}`
      );

      lastStatusMsg = msg.message_id;

    } catch (e) {
      console.log("ERROR:", e.message);
    }

    await new Promise(r => setTimeout(r, 2000));
  }
}