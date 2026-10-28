// Gumroad sale check and "order is paid" step, shared by the ping and the owner's recheck.
import { addAlert, moveOrder, outFetch } from "./shop.js";

/** The sale from the Gumroad API, or null when the API fails or does not know it. */
export async function fetchSale(env, saleId) {
  try {
    const res = await outFetch(env)(`https://api.gumroad.com/v2/sales/${encodeURIComponent(saleId)}`, {
      headers: { authorization: `Bearer ${env.GUMROAD_ACCESS_TOKEN}` },
    });
    const data = res.ok ? await res.json() : null;
    return data?.success && data.sale ? data.sale : null;
  } catch {
    return null;
  }
}

/** Move a pending order to PAID for a checked sale. Alerts the owner when the emails differ. */
export async function settle(env, order, sale, saleId, isTest, now) {
  const mail = (s) => String(s || "").trim().toLowerCase();
  const emailMismatch = ![sale.email, sale.purchase_email].some((e) => mail(e) && mail(e) === mail(order.email));
  const { pingFailedAt, productMismatchAt, pingSaleId, ...rest } = order;
  await moveOrder(env.FILES, { ...rest, status: order.status }, "paid", {
    sale_id: saleId, paidAt: new Date(now).toISOString(), test: isTest, beta: sale.price === 0, emailMismatch,
  });
  await env.FILES.put(`sales/${saleId}.json`, JSON.stringify({ id: order.id }));
  if (emailMismatch) {
    await addAlert(env.FILES, `Order ${order.id}: the Gumroad email differs from the form email. The report goes to the form email.`, now);
  }
}
