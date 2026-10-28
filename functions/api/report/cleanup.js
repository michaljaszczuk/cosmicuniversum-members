import { KEEP, PENDING_TTL, getJson, json, listAll, nowMs, requireWorker } from "../../_shared/shop.js";

// Daily. Unpaid orders go after 24 hours (unless a Gumroad check failed for them: then the
// customer may have paid). Delivered records, PDFs and tokens go 30 days after delivery.
export async function onRequestPost({ request, env }) {
  const denied = requireWorker(request, env);
  if (denied) return denied;
  const bucket = env.FILES;
  const now = nowMs(env);
  const counts = { pending: 0, delivered: 0, tokens: 0 };

  for (const obj of await listAll(bucket, "orders/pending/")) {
    if (now - Date.parse(obj.customMetadata?.at) <= PENDING_TTL) continue;
    const o = await getJson(bucket, obj.key);
    if (o?.pingFailedAt) continue;
    await bucket.delete(obj.key);
    counts.pending++;
  }
  for (const obj of await listAll(bucket, "orders/delivered/")) {
    if (now - Date.parse(obj.customMetadata?.at) <= KEEP) continue;
    const o = await getJson(bucket, obj.key);
    if (!o) continue;
    await bucket.delete([obj.key, `reports/${o.id}.pdf`, ...(o.sale_id ? [`sales/${o.sale_id}.json`] : [])]);
    counts.delivered++;
    if (o.token) {
      await bucket.delete(`tokens/${o.token}.json`);
      counts.tokens++;
    }
  }
  for (const obj of await listAll(bucket, "tokens/")) {
    const t = await getJson(bucket, obj.key);
    if (t && Date.parse(t.expiresAt) < now) {
      await bucket.delete(obj.key);
      counts.tokens++;
    }
  }
  return json(counts);
}
