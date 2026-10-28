import { LEASE, MAX_LEASES, addAlert, getJson, json, listAll, moveOrder, nowMs, requireWorker } from "../../_shared/shop.js";

// The VPS worker asks here every minute. First, orders whose lease ran out go back to the queue
// (or to FAILED after MAX_LEASES, so a crashing order cannot loop forever). Then the oldest
// PAID order is leased for 30 minutes and returned. 204 when the queue is empty.
export async function onRequestPost({ request, env }) {
  const denied = requireWorker(request, env);
  if (denied) return denied;
  const bucket = env.FILES;
  const now = nowMs(env);

  for (const obj of await listAll(bucket, "orders/working/")) {
    if (Date.parse(obj.customMetadata?.at) >= now) continue;
    const order = await getJson(bucket, obj.key);
    if (!order) continue;
    const leases = (order.leases || 0) + 1;
    if (leases >= MAX_LEASES) {
      await moveOrder(bucket, order, "failed", {
        leases, failedAt: new Date(now).toISOString(), failReason: `lease expired ${MAX_LEASES} times`,
      });
      await addAlert(bucket, `Order ${order.id} needs a look: lease expired ${MAX_LEASES} times.`, now);
    } else {
      await moveOrder(bucket, order, "paid", { leases });
    }
  }

  const queue = (await listAll(bucket, "orders/paid/"))
    .sort((a, b) => (a.customMetadata?.at || "").localeCompare(b.customMetadata?.at || ""));
  for (const obj of queue) {
    const order = await getJson(bucket, obj.key);
    if (!order) continue;
    const working = await moveOrder(bucket, order, "working", { leaseUntil: new Date(now + LEASE).toISOString() });
    return json({ order: working });
  }
  return json(null, 204);
}
