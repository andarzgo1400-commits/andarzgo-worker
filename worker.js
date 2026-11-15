export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // ============================================================
      // 1. تست اتصال
      // ============================================================
      if (path === "/api/test") {
        let msg = "✅ تست موفقیت‌آمیز! اتصال ربات‌ها برقرار است.";
        if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
          await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: msg })
          });
        }
        if (env.BALE_BOT_TOKEN && env.BALE_CHAT_ID) {
          await fetch(`https://tapi.bale.ai/bot${env.BALE_BOT_TOKEN}/sendMessage`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: env.BALE_CHAT_ID, text: msg })
          });
        }
        return new Response("تست ارسال شد به ربات‌ها.", { headers: corsHeaders });
      }

      // ============================================================
      // 2. پاسخ به پیام‌های ربات‌ها (Webhook)
      // ============================================================
      if (request.method === "POST" && (path.includes("telegram") || path.includes("bale"))) {
        const update = await request.json();
        const isBale = path.includes("bale");

        if (update.message && update.message.text) {
          const chatId = update.message.chat.id;
          const text = update.message.text.toLowerCase();
          
          let reply = "سلام! به ربات تاسیسات اندرزگو خوش آمدید. 👋\n\nبرای ثبت درخواست، لطفاً از طریق وب‌سایت اقدام کنید.";
          if (text !== "/start" && text !== "سلام") {
             reply = "پیام شما دریافت شد. برای ثبت درخواست به سایت ما مراجعه کنید.";
          }
          
          const token = isBale ? env.BALE_BOT_TOKEN : env.TELEGRAM_BOT_TOKEN;
          const apiUrl = isBale ? `https://tapi.bale.ai/bot${token}/sendMessage` : `https://api.telegram.org/bot${token}/sendMessage`;
          
          if(token) {
             await fetch(apiUrl, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, text: reply })
             });
          }
        }
        return new Response("OK", { status: 200 });
      }

      // ============================================================
      // 3. ثبت سفارش جدید (از سمت سایت)
      // ============================================================
      if (request.method === "POST" && path === "/api/order") {
        const data = await request.json();
        data.id = Date.now().toString();
        
        // ذخیره در دیتابیس کلادفلر
        await env.ORDERS_DB.put(data.id, JSON.stringify(data));
        
        // ارسال پیام به تلگرام و بله
        const msg = `🔔 درخواست جدید!\n👤 نام: ${data.name || data.custName || '---'}\n📞 شماره: ${data.phone || data.custPhone || '---'}`;
        
        if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
          await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: msg })
          });
        }
        if (env.BALE_BOT_TOKEN && env.BALE_CHAT_ID) {
          await fetch(`https://tapi.bale.ai/bot${env.BALE_BOT_TOKEN}/sendMessage`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: env.BALE_CHAT_ID, text: msg })
          });
        }
        
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // ============================================================
      // 4. دریافت لیست سفارش‌ها (برای پنل ادمین)
      // ============================================================
      if (request.method === "GET" && path === "/api/orders") {
        const list = await env.ORDERS_DB.list();
        const orders = [];
        for (const key of list.keys) {
          const val = await env.ORDERS_DB.get(key.name);
          if (val) {
             try { orders.push(JSON.parse(val)); } catch(e) {}
          }
        }
        return new Response(JSON.stringify(orders), { headers: corsHeaders });
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
  }
};
