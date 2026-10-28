import { json, requireWorker } from "../../_shared/shop.js";

const ACKABLE = /^(alerts|waitlist)\/[A-Za-z0-9-]+\.json$/;

// The worker confirms which inbox items it sent on. Only alerts/ and waitlist/ keys are deleted.
export async function onRequestPost({ request, env }) {
  const denied = requireWorker(request, env);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const keys = (Array.isArray(body.keys) ? body.keys : []).filter((k) => typeof k === "string" && ACKABLE.test(k));
  if (keys.length) await env.FILES.delete(keys);
  return json({ deleted: keys.length });
}
