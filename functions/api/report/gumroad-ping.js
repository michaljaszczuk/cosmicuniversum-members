import { addAlert, findOrder, getJson, json, moveOrder, nowMs, outFetch, putOrder, safeEqual } from "../../_shared/shop.js";

// Gumroad's ping (form-encoded, unsigned). The ping is only a trigger: the sale is checked with
// the Gumroad API before anything changes. Gumroad retries on 499/500/502/503/504 only.
// Alert texts never hold birth data or an email address.
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
  let sale = null;
  try {
    const res = await outFetch(env)(`https://api.gumroad.com/v2/sales/${encodeURIComponent(saleId)}`, {
      headers: { authorization: `Bearer ${env.GUMROAD_ACCESS_TOKEN}` },
    });
    const data = res.ok ? await res.json() : null;
    if (data?.success && data.sale) sale = data.sale;
  } catch {
    sale = null;
  }
  if (!sale) {
    if (found?.status === "pending") await putOrder(bucket, { ...found.order, pingFailedAt: at });
    await addAlert(bucket, `Gumroad check failed for sale ${saleId} (order ${orderId || "none"}). Gumroad will retry.`, now);
    return json({ error: "sale check failed" }, 502);
  }

  if (sale.product_id !== env.GUMROAD_PRODUCT_ID) {
    await addAlert(bucket, `Ping for sale ${saleId} is for another product. Nothing changed.`, now);
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

  const order = found.order;
  const mail = (s) => String(s || "").trim().toLowerCase();
  const emailMismatch = ![sale.email, sale.purchase_email].some((e) => mail(e) && mail(e) === mail(order.email));
  await moveOrder(bucket, order, "paid", {
    sale_id: saleId, paidAt: at, test: isTest, beta: sale.price === 0, emailMismatch,
  });
  await bucket.put(`sales/${saleId}.json`, JSON.stringify({ id: order.id }));
  if (emailMismatch) {
    await addAlert(bucket, `Order ${order.id}: the Gumroad email differs from the form email. The report goes to the form email.`, now);
  }
  return json({ ok: true });
}
