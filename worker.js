const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });

function genToken() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

async function notify(env, text) {
  if (env.TELEGRAM_BOT_TOKEN) fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }) });
  if (env.BALE_BOT_TOKEN) fetch(`https://tapi.bale.ai/bot${env.BALE_BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: env.BALE_CHAT_ID, text }) });
}

async function checkAuth(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;
  const session = await env.ORDERS_DB.get("session_" + token);
  return !!session;
}

const RESOURCES = {
  orders: "order",
  invoices: "invoice",
  contacts: "contact",
  hamyars: "hamyar",
  magazine: "magazine",
  ads: "ad"
};
const PUBLIC_READ = ["magazine", "ads"]; // خواندن این دو بدون رمز عبور (برای پنل مشتری)

export default {
  async fetch(r, e) {
    const h = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
    if (r.method === "OPTIONS") return new Response(null, { headers: h });
    const u = new URL(r.url), parts = u.pathname.split("/").filter(Boolean);

    try {
      if (parts[0] === "api" && parts[1] === "test") {
        await notify(e, "✅ تست موفقیت‌آمیز!");
        return json({ ok: true }, 200, h);
      }

      if (r.method === "POST" && (u.pathname.includes("bale") || u.pathname.includes("telegram"))) {
        const a = await r.json(), c = a.message?.chat?.id, t = a.message?.text?.toLowerCase(), isB = u.pathname.includes("bale");
        const rep = (t === "/start" || t === "سلام") ? "سلام! به ربات تاسیسات اندرزگو خوش آمدید. 👋\n\nبرای ثبت درخواست، از سایت استفاده کنید." : "پیام دریافت شد.";
        const tok = isB ? e.BALE_BOT_TOKEN : e.TELEGRAM_BOT_TOKEN;
        const api = isB ? `https://tapi.bale.ai/bot${tok}/sendMessage` : `https://api.telegram.org/bot${tok}/sendMessage`;
        if (c && tok) await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: c, text: rep }) });
        return new Response("ok", { headers: h });
      }

      if (r.method === "POST" && parts[0] === "api" && parts[1] === "order") {
        const d = await r.json();
        d.id = Date.now().toString();
        await e.ORDERS_DB.put("order_" + d.id, JSON.stringify(d));
        await notify(e, `🔔 درخواست جدید!\n👤 نام: ${d.name || d.custName || '---'}\n📞 شماره: ${d.phone || d.custPhone || '---'}`);
        return json({ ok: true, id: d.id }, 200, h);
      }

      if (r.method === "POST" && parts[0] === "api" && parts[1] === "login") {
        const body = await r.json();
        if (body.password !== e.ADMIN_PASSWORD) return json({ ok: false, error: "رمز عبور اشتباه است" }, 401, h);
        const token = genToken();
        await e.ORDERS_DB.put("session_" + token, "1", { expirationTtl: 60 * 60 * 24 * 7 });
        return json({ ok: true, token }, 200, h);
      }

      if (r.method === "GET" && parts[0] === "api" && parts[1] === "check-auth") {
        const valid = await checkAuth(r, e);
        return json({ ok: valid }, valid ? 200 : 401, h);
      }

      if (parts[0] === "api" && RESOURCES[parts[1]]) {
        const resource = parts[1], prefix = RESOURCES[resource], id = parts[2];
        const isPublicRead = PUBLIC_READ.includes(resource) && r.method === "GET";

        if (!isPublicRead) {
          const authed = await checkAuth(r, e);
          if (!authed) return json({ ok: false, error: "دسترسی غیرمجاز - لطفاً دوباره وارد شوید" }, 401, h);
        }

        if (r.method === "GET" && !id) {
          const list = await e.ORDERS_DB.list({ prefix: prefix + "_" });
          const items = [];
          for (const k of list.keys) {
            const v = await e.ORDERS_DB.get(k.name);
            if (v) try { items.push(JSON.parse(v)); } catch (x) {}
          }
          return json(items, 200, h);
        }

        if (r.method === "POST" && !id) {
          const d = await r.json();
          d.id = Date.now().toString();
          await e.ORDERS_DB.put(prefix + "_" + d.id, JSON.stringify(d));
          return json({ ok: true, id: d.id }, 200, h);
        }

        if (r.method === "PUT" && id) {
          const existing = await e.ORDERS_DB.get(prefix + "_" + id);
          if (!existing) return json({ ok: false, error: "یافت نشد" }, 404, h);
          const updates = await r.json();
          const merged = { ...JSON.parse(existing), ...updates, id };
          await e.ORDERS_DB.put(prefix + "_" + id, JSON.stringify(merged));
          return json({ ok: true }, 200, h);
        }

        if (r.method === "DELETE" && id) {
          await e.ORDERS_DB.delete(prefix + "_" + id);
          return json({ ok: true }, 200, h);
        }
      }

      return json({ ok: false, error: "Not Found" }, 404, h);
    } catch (x) {
      return json({ ok: false, error: x.message }, 500, h);
    }
  }
};
