import { SECURITY_HEADERS } from "../_shared/lib.js";
import { getJson, nowMs } from "../_shared/shop.js";

const EXTRA = { "ł": "l", "Ł": "L", "ø": "o", "Ø": "O", "đ": "d", "ß": "ss", "æ": "ae", "œ": "oe" };

/** "Zoë O'Brien/x" -> "Zoe-O-Brien-x"; nothing left -> "Your". */
export function safeName(name) {
  const s = String(name || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[łŁøØđßæœ]/g, (c) => EXTRA[c]).replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "Your";
}

// Customer download link from the "report ready" email. Works 30 days.
export async function onRequestGet({ env, params }) {
  const notFound = () => new Response("This link has expired or does not exist.", { status: 404, headers: SECURITY_HEADERS });
  const token = String(params.token);
  if (!/^[a-z0-9]{32}$/.test(token)) return notFound();
  const t = await getJson(env.FILES, `tokens/${token}.json`);
  if (!t || Date.parse(t.expiresAt) < nowMs(env)) return notFound();
  const pdf = await env.FILES.get(`reports/${t.id}.pdf`);
  if (!pdf) return notFound();
  const ascii = `${safeName(t.name)}_birth-chart.pdf`;
  const utf = `${encodeURIComponent(String(t.name || "Your").replace(/[\\/]/g, "-"))}_birth-chart.pdf`;
  return new Response(pdf.body, {
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${utf}`,
      "Content-Length": String(pdf.size),
    },
  });
}
