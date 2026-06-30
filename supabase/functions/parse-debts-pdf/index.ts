// Supabase Edge Function: parse-debts-pdf
// ניתוח קובץ PDF של "חשבוניות שלא שולמו" (דוח Priority מהעמותה) בעזרת AI,
// וחילוץ רשימת חובות-חקלאים מובנית (שם לקוח, מס׳ לקוח, יתרת חוב, שנה).
//
// הדוח הוא קובץ סרוק (תמונות, ללא שכבת טקסט) ולכן הניתוח חייב מודל-ראייה.
// משתמשים ב-Google Gemini בחינם (מפתח חינמי מ-Google AI Studio).
//
// Secrets נדרשים:
//   GEMINI_API_KEY  — מפתח חינמי מ-https://aistudio.google.com/app/apikey
//   GEMINI_MODEL    — אופציונלי (ברירת מחדל: gemini-2.0-flash)
//   ADMIN_EMAILS    — אופציונלי; אם לא מוגדר, כל משתמש מחובר רשאי.
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

// סכמת הפלט שה-AI מחויב להחזיר.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          customerNumber: { type: "string" },
          total: { type: "number" },
          year: { type: "string" },
          invoiceCount: { type: "integer" },
        },
        required: ["name", "total"],
        propertyOrdering: ["name", "customerNumber", "total", "year", "invoiceCount"],
      },
    },
  },
  required: ["rows"],
};

const PROMPT = [
  "לפניך קובץ PDF סרוק של דוח הנהלת-חשבונות מתוכנת Priority בכותרת \"חשבוניות שלא שולמו\",",
  "עבור עמותת \"רוח הגולן\", מרכז רווח 11 \"רגבים בנימין\".",
  "הדוח מקובץ לפי לקוח. לכל לקוח יש מספר לקוח (מס. לקוח, לדוגמה 8000012020) ושם לקוח",
  "(שם לקוח, לדוגמה \"ארץ הצבי א.ש. בע\\\"מ\"), ואחריו שורת חשבונית אחת או יותר —",
  "כל שורה עם סכום, תאריך (dd/mm/yy) ומספר חשבונית (לדוגמה SI23007612).",
  "ייתכנו שורות \"תשלומים על חשבון\" (סכום שלילי), ושורת ביניים מודגשת \"סה\\\"כ\" =",
  "היתרה נטו לאותו לקוח.",
  "",
  "חלץ אובייקט אחד לכל לקוח:",
  "- name: שם הלקוח (שם לקוח) במדויק.",
  "- customerNumber: ספרות מספר הלקוח.",
  "- total: היתרה נטו = שורת ה\"סה\\\"כ\" המודגשת של אותו לקוח (מספר). אם אין שורת סה\"כ —",
  "  סכום שורות החשבונית כולל שורות התשלום השליליות.",
  "- year: שנת החשבונית האחרונה (4 ספרות, לדוגמה \"2026\"); גזור מתאריכי dd/mm/yy",
  "  (yy: 19→2019, 26→2026).",
  "- invoiceCount: מספר שורות החשבונית של הלקוח (לא כולל שורת סה\"כ ושורות תשלום).",
  "",
  "התעלם משורות כותרת/סיכום של מרכז הרווח. החזר רק לקוחות ממשיים.",
  "מספרים יהיו מספרים רגילים ללא פסיקים וללא סימן מטבע. החזר JSON לפי הסכמה בלבד.",
].join("\n");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "method not allowed" }, 405);

  const URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
  const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.0-flash";
  if (!GEMINI_KEY) {
    return reply({ error: "missing GEMINI_API_KEY — הגדירו מפתח חינמי מ-Google AI Studio ב-Secrets" }, 500);
  }

  // --- אימות: הקורא חייב להיות משתמש מחובר (ואדמין אם ADMIN_EMAILS מוגדר) ---
  let callerEmail = "";
  try {
    const asCaller = createClient(URL, ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await asCaller.auth.getUser();
    callerEmail = (user?.email ?? "").toLowerCase();
  } catch {
    return reply({ error: "unauthorized" }, 401);
  }
  if (!callerEmail) return reply({ error: "unauthorized" }, 401);

  const envAdmins = (Deno.env.get("ADMIN_EMAILS") ?? "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (envAdmins.length && !envAdmins.includes(callerEmail)) {
    return reply({ error: "forbidden" }, 403);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const pdfBase64 = String(body.pdfBase64 ?? "");
  const mimeType = String(body.mimeType ?? "application/pdf");
  if (!pdfBase64) return reply({ error: "חסר קובץ PDF" }, 400);
  // הגנת גודל גסה (base64 ~1.33x מהמקור) — עד ~15MB מקור.
  if (pdfBase64.length > 20_000_000) return reply({ error: "הקובץ גדול מדי (מקסימום ~15MB)" }, 413);

  const gReq = {
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType, data: pdfBase64 } },
        { text: PROMPT },
      ],
    }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  let gRes: Response;
  try {
    gRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(gReq) },
    );
  } catch (e) {
    return reply({ error: "כשל בקריאה ל-AI: " + String((e as Error)?.message ?? e) }, 502);
  }

  const gText = await gRes.text();
  if (!gRes.ok) {
    let msg = gText;
    try { msg = JSON.parse(gText)?.error?.message ?? gText; } catch { /* ignore */ }
    return reply({ error: "שגיאת AI (" + gRes.status + "): " + msg }, 502);
  }

  let parsed: any;
  try { parsed = JSON.parse(gText); } catch { return reply({ error: "תשובת AI לא תקינה" }, 502); }
  const partText = parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!partText) {
    const blocked = parsed?.promptFeedback?.blockReason || parsed?.candidates?.[0]?.finishReason;
    return reply({ error: "ה-AI לא החזיר נתונים" + (blocked ? " (" + blocked + ")" : "") }, 502);
  }

  let out: any;
  try { out = JSON.parse(partText); } catch { return reply({ error: "פלט AI לא ניתן לפענוח" }, 502); }
  const rows = Array.isArray(out?.rows) ? out.rows : [];
  return reply({ rows });
});
