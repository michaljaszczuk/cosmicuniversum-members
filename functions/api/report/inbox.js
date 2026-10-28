import { getJson, json, listAll, requireWorker } from "../../_shared/shop.js";

// Owner alerts and waitlist emails wait here until the worker sends them on (it holds the
// Sender.net key, Cloudflare does not). Returned items are deleted.
export async function onRequestPost({ request, env }) {
  const denied = requireWorker(request, env);
  if (denied) return denied;
  const take = async (prefix, pick) => {
    const out = [];
    for (const obj of await listAll(env.FILES, prefix)) {
      const v = await getJson(env.FILES, obj.key);
      if (v) out.push(pick(v));
      await env.FILES.delete(obj.key);
    }
    return out;
  };
  return json({
    alerts: await take("alerts/", (a) => ({ text: a.text, at: a.at })),
    waitlist: await take("waitlist/", (w) => ({ email: w.email })),
  });
}
