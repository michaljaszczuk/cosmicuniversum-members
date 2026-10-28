// Shared by the report shop functions (functions/api/report/*, functions/r/*).
// Orders live in R2 as orders/<status>/<id>.json; see docs/superpowers/plans/2026-10-28-report-shop.md.
import { SECURITY_HEADERS } from "./lib.js";

export const DAY = 86400000;
export const PENDING_TTL = DAY;
export const KEEP = 30 * DAY;
export const LEASE = 30 * 60000;
export const MAX_LEASES = 3;
export const STATUSES = ["pending", "paid", "working", "delivered", "failed"];

// The time each status sorts and expires by, saved as customMetadata.at.
const TIME_FIELD = { pending: "createdAt", paid: "paidAt", working: "leaseUntil", delivered: "deliveredAt", failed: "failedAt" };

// Test hooks: tests set env.__now and env.__fetch; production never does.
export const nowMs = (env) => (env.__now ? env.__now() : Date.now());
export const outFetch = (env) => env.__fetch ?? fetch;

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** n random characters a-z0-9 (rejection sampling, so every character is equally likely). */
export function randomId(n = 20) {
  let out = "";
  const buf = new Uint8Array(n * 2);
  while (out.length < n) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < 252 && out.length < n) out += ALPHABET[b % 36];
    }
  }
  return out;
}

/** Compare two secrets without leaking where they differ. */
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function json(data, status = 200) {
  return new Response(data === null ? null : JSON.stringify(data), {
    status,
    headers: { ...SECURITY_HEADERS, ...(data === null ? {} : { "Content-Type": "application/json" }) },
  });
}

export const orderKey = (status, id) => `orders/${status}/${id}.json`;

export async function getJson(bucket, key) {
  const o = await bucket.get(key);
  return o ? o.json() : null;
}

export function putOrder(bucket, order) {
  return bucket.put(orderKey(order.status, order.id), JSON.stringify(order), {
    customMetadata: { at: String(order[TIME_FIELD[order.status]] ?? "") },
  });
}

/** Move an order to another status folder, with changes merged in. Returns the new record. */
export async function moveOrder(bucket, order, toStatus, changes = {}) {
  const next = { ...order, ...changes, status: toStatus };
  await putOrder(bucket, next);
  if (toStatus !== order.status) await bucket.delete(orderKey(order.status, order.id));
  return next;
}

export async function findOrder(bucket, id) {
  if (!/^[a-z0-9]{20}$/.test(String(id))) return null;
  for (const status of STATUSES) {
    const order = await getJson(bucket, orderKey(status, id));
    if (order) return { order, status };
  }
  return null;
}

export async function listAll(bucket, prefix) {
  const out = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, cursor, include: ["customMetadata"] });
    out.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}

/** null when the request carries the worker secret, else a 401 response. */
export function requireWorker(request, env) {
  const m = /^Bearer (.+)$/.exec(request.headers.get("authorization") || "");
  if (m && env.WORKER_SECRET && safeEqual(m[1], env.WORKER_SECRET)) return null;
  return json({ error: "unauthorized" }, 401);
}

/** A note for the owner. The VPS worker emails it on its next run. Never put birth data in `text`. */
export function addAlert(bucket, text, now) {
  return bucket.put(`alerts/${now}-${randomId(6)}.json`, JSON.stringify({ text, at: new Date(now).toISOString() }));
}

export async function verifyTurnstile(token, secret, ip, fetchFn = fetch) {
  if (!token) return false;
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set("remoteip", ip);
  const res = await fetchFn("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  if (!res.ok) return false;
  return (await res.json()).success === true;
}
