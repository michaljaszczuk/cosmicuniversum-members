import { addAlert, findOrder, getJson, json, nowMs, putOrder, safeEqual } from "../../_shared/shop.js";
import { fetchSale, settle } from "../../_shared/sale.js";

// Gumroad's ping (form-encoded, unsigned). The ping is only a trigger: the sale is checked with
// the Gumroad API before anything changes. Gumroad retries on 499/500/502/503/504 only.
// A pending order is never left to the 24 h cleanup when a payment may exist: it is marked and
// the owner can run `worker.py recheck <id>`. Alert texts never hold birth data or an email.
export async function onRequestPost({ request, env }) {
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!env.PING_SECRET || !safeEqual(key, env.PING_SECRET)) return json({ error: "forbidden" }, 403);

  const form = await request.formData();
  const saleId = String(form.get("sale_id") || "");
  const orderId = String(form.get("url_params[order]") || "");
  const isTest = form.get("test") === "true";
  const now = nowMs(env);
  const at = new Date(now).toISOString();
  const bucket = env.FILES;
  if (!/^[A-Za-z0-9_=-]{1,100}$/.test(saleId)) return json({ error: "no sale_id" }, 400);

  const found = await findOrder(bucket, orderId);
  const keep = async (mark) => {
    if (found?.status === "pending") await putOrder(bucket, { ...found.order, [mark]: at, pingSaleId: saleId });
  };
  const sale = await fetchSale(env, saleId);
  if (!sale) {
    await keep("pingFailedAt");
    await addAlert(bucket, `Gumroad check failed for sale ${saleId} (order ${orderId || "none"}). Gumroad will retry.`, now);
    return json({ error: "sale check failed" }, 502);
  }

  if (sale.product_id !== env.GUMROAD_PRODUCT_ID) {
    await keep("productMismatchAt");
    await addAlert(bucket, `Sale ${saleId} has another product id. Check GUMROAD_PRODUCT_ID. Order ${orderId || "none"} `
      + `is kept; after the fix run worker.py recheck ${orderId || "<order id>"}.`, now);
    return json({ ok: true });
  }
  if (sale.refunded || sale.chargedback) {
    await addAlert(bucket, `Sale ${saleId} is refunded or disputed, order ${orderId || "none"}. Nothing was deleted.`, now);
    return json({ ok: true });
  }
  if (await getJson(bucket, `sales/${saleId}.json`)) return json({ ok: true }); // a retry

  if (!found || found.status !== "pending") {
    if (!found) {
      await bucket.put(`orders/orphan/${saleId}.json`, JSON.stringify({ sale_id: saleId, email: sale.email, at }));
      await addAlert(bucket, `Sale ${saleId} is paid but the order form data is missing. See orders/orphan/.`, now);
    } else {
      await addAlert(bucket, `Sale ${saleId} points at order ${orderId}, which is ${found.status}. Nothing changed.`, now);
    }
    return json({ ok: true });
  }

  await settle(env, found.order, sale, saleId, isTest, now);
  return json({ ok: true });
}
