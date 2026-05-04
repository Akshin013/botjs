const TOKEN = "8649973945:AAHsaN1YZ1Vt_rtPTqjNKefLKvpAKHJEASI";
const API = `https://api.telegram.org/bot${TOKEN}`;

const API_URL = "https://api2.bybit.com/fiat/otc/item/online";

let running = false;
let seen = new Set();

let SETTINGS = {
  amount: "2500",
  mode: "exact",
  maxPrice: 82,
  blacklist: true,
  priceFilter: false
};

const BLACKLIST = ["тбанк", "т банк", "тинькофф", "tinkoff"];

export default {
  async fetch(request, env, ctx) {

    // 📩 TELEGRAM WEBHOOK
    if (request.method === "POST") {
      const update = await request.json();

      if (update.message) {
        const chatId = update.message.chat.id;

        // 🔘 КНОПКИ
        if (update.message.text === "/start") {
          await sendMessage(chatId, "🚀 Бот готов", {
            keyboard: [[{ text: "📱 Открыть панель", web_app: { url: "https://akshin013.github.io/P2P-Helper/index/app.html" } }]],
            resize_keyboard: true
          });
        }

        // 📲 ДАННЫЕ ИЗ WEBAPP
        if (update.message.web_app_data) {
          const data = JSON.parse(update.message.web_app_data.data);

          SETTINGS = { ...SETTINGS, ...data };

          if (data.running && !running) {
            running = true;
            ctx.waitUntil(scanner(chatId));
          }

          if (!data.running) {
            running = false;
          }
        }
      }

      return new Response("ok");
    }

    return new Response("Bot running 🚀");
  }
};

// ───── СКАНЕР ─────
async function scanner(chatId) {
  while (running) {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: "USDT",
          currencyId: "RUB",
          side: "1",
          size: "50",
          page: "1"
        })
      });

      const data = await res.json();
      const ads = data?.result?.items || [];

      for (const ad of ads) {
        if (!isValid(ad)) continue;

        const id = ad.id;
        if (seen.has(id)) continue;
        seen.add(id);

        const msg = formatOrder(ad);

        await sendMessage(chatId, msg);

        // 📤 отправка в WebApp
        await sendWebAppEvent(chatId, ad);
      }

    } catch (e) {
      console.log("error:", e);
    }

    await sleep(2000);
  }
}

// ───── ПРОВЕРКИ ─────
function isValid(ad) {
  const text = (ad.remark || "").toLowerCase();

  if (SETTINGS.mode === "exact" && !text.includes(SETTINGS.amount)) {
    return false;
  }

  if (SETTINGS.blacklist && BLACKLIST.some(b => text.includes(b))) {
    return false;
  }

  if (SETTINGS.priceFilter && Number(ad.price) > SETTINGS.maxPrice) {
    return false;
  }

  return true;
}

// ───── ФОРМАТ ─────
function formatOrder(ad) {
  return `🔥 НАЙДЕН ОРДЕР
👤 ${ad.nickName}
💰 ${ad.price} RUB
📝 ${ad.remark || "-"}
🔗 https://www.bybit.com/fiat/trade/otc?tab=buy&id=${ad.id}`;
}

// ───── TELEGRAM ─────
async function sendMessage(chatId, text, reply_markup = null) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup
    })
  });
}

// ───── WEBAPP PUSH ─────
async function sendWebAppEvent(chatId, ad) {
  const payload = {
    type: "new_order",
    order: {
      nick: ad.nickName,
      price: ad.price,
      min: ad.minAmount,
      max: ad.maxAmount,
      remark: ad.remark,
      link: `https://www.bybit.com/fiat/trade/otc?tab=buy&id=${ad.id}`,
      time: new Date().toLocaleTimeString()
    }
  };

  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: "📦",
      reply_markup: {
        inline_keyboard: [[{
          text: "Открыть",
          web_app: { url: `https://akshin013.github.io/P2P-Helper/index/app.html?order=${encodeURIComponent(JSON.stringify(payload.order))}` }
        }]]
      }
    })
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
