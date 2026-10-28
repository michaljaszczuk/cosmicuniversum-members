import { findOrder, json, moveOrder, nowMs, requireWorker } from "../../../_shared/shop.js";

// Owner's "worker.py retry <id>": a FAILED order goes back to the queue.
export async function onRequestPost({ request, env, params }) {
  const denied = requireWorker(request, env);
  if (denied) return denied;
  const found = await findOrder(env.FILES, params.id);
  if (!found) return json({ error: "not found" }, 404);
  if (found.status !== "failed") return json({ error: `order is ${found.status}` }, 409);
  const { failReason, failedAt, ...order } = found.order;
  await moveOrder(env.FILES, order, "paid", { leases: 0, paidAt: order.paidAt || new Date(nowMs(env)).toISOString() });
  return json({ ok: true });
}
