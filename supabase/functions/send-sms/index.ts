// Supabase Edge Function: send-sms
// שולח SMS אישי לרשימת נמענים דרך ה-API של 019.
// סודות (Secrets) להגדיר ב-Supabase: SMS019_TOKEN, SMS019_USER, SMS019_SENDER
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ORIGIN = "https://chaklaut.rgvb.org.il";
const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "method not allowed" }, 405);

  // רק משתמש מחובר (לא אנונימי) רשאי לשלוח
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return reply({ error: "unauthorized" }, 401);
  } catch {
    return reply({ error: "unauthorized" }, 401);
  }

  const TOKEN = Deno.env.get("SMS019_TOKEN");
  const USER = Deno.env.get("SMS019_USER");
  const SENDER = Deno.env.get("SMS019_SENDER") ?? "Regavim";
  if (!TOKEN || !USER) return reply({ error: "missing SMS019_TOKEN / SMS019_USER secrets" }, 500);

  let messages: { phone: string; text: string }[] = [];
  try { messages = (await req.json())?.messages ?? []; } catch { /* ignore */ }
  if (!Array.isArray(messages) || !messages.length) return reply({ error: "no messages" }, 400);

  let sent = 0, failed = 0;
  const errors: string[] = [];
  for (const m of messages) {
    const phone = String(m?.phone ?? "").replace(/\D/g, "");
    const text = String(m?.text ?? "");
    if (!phone || !text) { failed++; continue; }
    try {
      const r = await fetch("https://019sms.co.il/api", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${TOKEN}` },
        body: JSON.stringify({
          username: USER,
          source: SENDER,
          message: text,
          destinations: { phone: [{ number: phone }] },
        }),
      });
      const body = await r.text();
      if (r.ok && /"status"\s*:\s*"?0"?/.test(body)) sent++;
      else { failed++; if (errors.length < 3) errors.push(body.slice(0, 300)); }
    } catch (e) {
      failed++; if (errors.length < 3) errors.push(String(e));
    }
  }
  return reply({ sent, failed, errors });
});
