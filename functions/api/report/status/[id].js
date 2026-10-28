import { findOrder, json, moveOrder, nowMs, putOrder, requireWorker } from "../../../_shared/shop.js";

// The worker reports the end of an order: DELIVERED (birth data is removed now) or FAILED.
// A body with only flags (delayMailSent, feedbackSent) updates the record where it is.
export async function onRequestPost({ request, env, params }) {
  const denied = requireWorker(request, env);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const found = await findOrder(env.FILES, params.id);
  if (!found) return json({ error: "not found" }, 404);
  const flags = {};
  for (const f of ["delayMailSent", "feedbackSent"]) if (body[f] === true) flags[f] = true;
  const at = new Date(nowMs(env)).toISOString();

  if (body.status === "delivered" || body.status === "failed") {
    if (found.status !== "working") return json({ error: `order is ${found.status}` }, 409);
    if (body.status === "delivered") {
      const { birth, leaseUntil, ...kept } = found.order;
      await moveOrder(env.FILES, { ...kept, status: "working" }, "delivered", { ...flags, deliveredAt: at });
    } else {
      await moveOrder(env.FILES, found.order, "failed", {
        ...flags, failedAt: at, failReason: String(body.reason || "unknown").slice(0, 200),
      });
    }
    return json({ ok: true });
  }
  if (body.status !== undefined) return json({ error: "bad status" }, 400);
  await putOrder(env.FILES, { ...found.order, ...flags });
  return json({ ok: true });
}
