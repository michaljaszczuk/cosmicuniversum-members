import { json, nowMs, outFetch, randomId, verifyTurnstile } from "../../_shared/shop.js";

// "Tell me when a version without a birth time exists." The email waits in R2 until the
// VPS worker adds it to the Sender.net list (Cloudflare holds no Sender key).
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Something went wrong. Please reload the page and try again." }, 400);
  }
  if (!(await verifyTurnstile(body?.turnstile, env.TURNSTILE_SECRET, request.headers.get("cf-connecting-ip"), outFetch(env)))) {
    return json({ error: "The robot check failed. Please try again." }, 403);
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "Enter a working email address." }, 400);
  }
  if (body.consent !== true) return json({ error: "Please tick the box so we may email you." }, 400);
  const now = nowMs(env);
  await env.FILES.put(`waitlist/${now}-${randomId(8)}.json`, JSON.stringify({ email, at: new Date(now).toISOString() }));
  return json({ ok: true });
}
