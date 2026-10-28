import { KEEP, getJson, json, listAll, nowMs, requireWorker } from "../../_shared/shop.js";

// Owner's "worker.py resend <email>": delivered orders of this email from the last 30 days.
export async function onRequestGet({ request, env }) {
  const denied = requireWorker(request, env);
  if (denied) return denied;
  const url = new URL(request.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const now = nowMs(env);
  const out = [];
  for (const obj of await listAll(env.FILES, "orders/delivered/")) {
    if (now - Date.parse(obj.customMetadata?.at) > KEEP) continue;
    const o = await getJson(env.FILES, obj.key);
    if (o && o.token && String(o.email).toLowerCase() === email) {
      out.push({ id: o.id, name: o.name, url: `${url.origin}/r/${o.token}` });
    }
  }
  return json(out);
}
