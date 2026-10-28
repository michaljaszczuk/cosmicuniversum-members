import { json, nowMs, outFetch, putOrder, randomId, verifyTurnstile } from "../../_shared/shop.js";
import { checkOrder } from "../../_shared/order-check.js";
import { findPlace } from "../../../public/report/js/places.js";

// The order form posts here. Checks everything again, saves a PENDING order in R2 and
// returns the Gumroad link with the order id. Unpaid orders are deleted after 24 hours (cleanup).
export async function onRequestPost({ request, env }) {
  if (!env.GUMROAD_PRODUCT_URL || !env.GUMROAD_PRODUCT_ID) {
    return json({ field: "", error: "Orders are not open yet. Please try again later." }, 503);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ field: "", error: "Something went wrong. Please reload the page and try again." }, 400);
  }
  const ip = request.headers.get("cf-connecting-ip");
  if (!(await verifyTurnstile(body?.turnstile, env.TURNSTILE_SECRET, ip, outFetch(env)))) {
    return json({ field: "turnstile", error: "The robot check failed. Please try again." }, 403);
  }
  const now = nowMs(env);
  const assets = (u) => env.ASSETS.fetch(new URL(u, request.url));
  const r = await checkOrder(body, { findPlace: (p) => findPlace(p, { fetch: assets }), now });
  if (!r.ok) return json({ field: r.field, error: r.error }, 400);

  const order = { id: randomId(), status: "pending", createdAt: new Date(now).toISOString(), ...r.order };
  await putOrder(env.FILES, order);
  const pay = new URL(env.GUMROAD_PRODUCT_URL);
  pay.searchParams.set("order", order.id);
  pay.searchParams.set("email", order.email);
  return json({ pay: pay.toString() });
}
