import { getJson, json, listAll, requireWorker } from "../../_shared/shop.js";

// Owner alerts and waitlist emails wait here until the worker sends them on (it holds the
// Sender.net key, Cloudflare does not). Nothing is deleted here: the worker calls
// /api/report/inbox-ack with the keys it really sent, so an alert is never lost.
export async function onRequestPost({ request, env }) {
  const denied = requireWorker(request, env);
  if (denied) return denied;
  const read = async (prefix, pick) => {
    const out = [];
    for (const obj of await listAll(env.FILES, prefix)) {
      const v = await getJson(env.FILES, obj.key).catch(() => null);
      if (v) out.push({ key: obj.key, ...pick(v) });
    }
    return out;
  };
  return json({
    alerts: await read("alerts/", (a) => ({ text: a.text, at: a.at })),
    waitlist: await read("waitlist/", (w) => ({ email: w.email })),
  });
}
