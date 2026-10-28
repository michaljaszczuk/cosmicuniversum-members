import { findOrder, getJson, json, nowMs, requireWorker } from "../../../_shared/shop.js";
import { fetchSale, settle } from "../../../_shared/sale.js";

// Owner's "worker.py recheck <id>": a pending order kept after a failed Gumroad check
// (API down, wrong GUMROAD_PRODUCT_ID) is checked again and, if the sale is good, becomes PAID.
export async function onRequestPost({ request, env, params }) {
  const denied = requireWorker(request, env);
  if (denied) return denied;
  const found = await findOrder(env.FILES, params.id);
  if (!found) return json({ error: "not found" }, 404);
  if (found.status !== "pending") return json({ error: `order is ${found.status}` }, 409);
  const saleId = found.order.pingSaleId;
  if (!saleId) return json({ error: "no Gumroad sale is known for this order" }, 409);
  if (await getJson(env.FILES, `sales/${saleId}.json`)) return json({ error: "this sale already paid another order" }, 409);
  const sale = await fetchSale(env, saleId);
  if (!sale) return json({ error: "Gumroad check failed, try again later" }, 502);
  if (sale.product_id !== env.GUMROAD_PRODUCT_ID) return json({ error: "the sale has another product id: check GUMROAD_PRODUCT_ID" }, 409);
  if (sale.refunded || sale.chargedback) return json({ error: "the sale is refunded or disputed" }, 409);
  await settle(env, found.order, sale, saleId, false, nowMs(env));
  return json({ ok: true });
}
