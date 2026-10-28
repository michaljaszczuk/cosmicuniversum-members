import { LEASE, MAX_LEASES, addAlert, getJson, json, listAll, moveOrder, nowMs, randomId, requireWorker } from "../../_shared/shop.js";

// A file that is not valid JSON must not block the queue: move it aside and tell the owner.
async function readOrSetAside(bucket, key, now) {
  try {
    return await getJson(bucket, key);
  } catch {
    const raw = await (await bucket.get(key))?.text();
    await bucket.put(`orders/broken/${now}-${randomId(6)}.json`, raw ?? "");
    await bucket.delete(key);
    await addAlert(bucket, `A broken order file (${key}) was moved to orders/broken/.`, now);
    return null;
  }
}

// The VPS worker asks here every minute. First, orders whose lease ran out go back to the queue
// (or to FAILED after MAX_LEASES, so a crashing order cannot loop forever). Then the oldest
// PAID order is leased for 30 minutes and returned. 204 when there is nothing to do.
// Orders that failed here are listed in `failedNow`, so the worker sends the customer the
// "being finished by hand" email (only the worker holds the Sender.net key).
export async function onRequestPost({ request, env }) {
  const denied = requireWorker(request, env);
  if (denied) return denied;
  const bucket = env.FILES;
  const now = nowMs(env);
  const failedNow = [];

  for (const obj of await listAll(bucket, "orders/working/")) {
    if (Date.parse(obj.customMetadata?.at) >= now) continue;
    const order = await readOrSetAside(bucket, obj.key, now);
    if (!order) continue;
    const leases = (order.leases || 0) + 1;
    if (leases >= MAX_LEASES) {
      await moveOrder(bucket, order, "failed", {
        leases, failedAt: new Date(now).toISOString(), failReason: `lease expired ${MAX_LEASES} times`,
      });
      await addAlert(bucket, `Order ${order.id} needs a look: lease expired ${MAX_LEASES} times.`, now);
      if (!order.delayMailSent) failedNow.push({ id: order.id, email: order.email, name: order.name });
    } else {
      await moveOrder(bucket, order, "paid", { leases });
    }
  }

  const queue = (await listAll(bucket, "orders/paid/"))
    .sort((a, b) => (a.customMetadata?.at || "").localeCompare(b.customMetadata?.at || ""));
  for (const obj of queue) {
    const order = await readOrSetAside(bucket, obj.key, now);
    if (!order) continue;
    const working = await moveOrder(bucket, order, "working", { leaseUntil: new Date(now + LEASE).toISOString() });
    return json({ order: working, ...(failedNow.length ? { failedNow } : {}) });
  }
  return failedNow.length ? json({ order: null, failedNow }) : json(null, 204);
}
