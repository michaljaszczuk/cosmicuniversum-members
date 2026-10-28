import { DAY, getJson, json, listAll, nowMs, requireWorker } from "../../_shared/shop.js";

// Beta testers whose report was delivered 3 or more days ago and who have not had the feedback email.
export async function onRequestGet({ request, env }) {
  const denied = requireWorker(request, env);
  if (denied) return denied;
  const now = nowMs(env);
  const out = [];
  for (const obj of await listAll(env.FILES, "orders/delivered/")) {
    if (now - Date.parse(obj.customMetadata?.at) < 3 * DAY) continue;
    const o = await getJson(env.FILES, obj.key);
    if (o && o.beta && !o.feedbackSent) out.push({ id: o.id, email: o.email, name: o.name });
  }
  return json(out);
}
