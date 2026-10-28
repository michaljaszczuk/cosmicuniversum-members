import { addAlert, json, nowMs, requireWorker } from "../../_shared/shop.js";

// The worker parks an owner alert it could not email (Sender down, wrong template id).
// It goes out with the inbox on a later run. Never put birth data or an email in `text`.
export async function onRequestPost({ request, env }) {
  const denied = requireWorker(request, env);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 500) : "";
  if (!text) return json({ error: "no text" }, 400);
  await addAlert(env.FILES, text, nowMs(env));
  return json({ ok: true });
}
