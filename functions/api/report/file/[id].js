import { KEEP, findOrder, json, nowMs, putOrder, randomId, requireWorker } from "../../../_shared/shop.js";

// The worker uploads the finished PDF. Returns the customer's download link (valid 30 days).
export async function onRequestPut({ request, env, params }) {
  const denied = requireWorker(request, env);
  if (denied) return denied;
  const found = await findOrder(env.FILES, params.id);
  if (!found) return json({ error: "not found" }, 404);
  if (found.status !== "working") return json({ error: `order is ${found.status}` }, 409);
  const now = nowMs(env);
  const token = randomId(32);
  await env.FILES.put(`reports/${found.order.id}.pdf`, await request.arrayBuffer());
  await env.FILES.put(`tokens/${token}.json`, JSON.stringify({
    id: found.order.id, name: found.order.name, expiresAt: new Date(now + KEEP).toISOString(),
  }));
  await putOrder(env.FILES, { ...found.order, token });
  return json({ url: `${new URL(request.url).origin}/r/${token}` });
}
