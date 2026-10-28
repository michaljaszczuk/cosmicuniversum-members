// Test context for Cloudflare Pages Functions: a fake env (R2, secrets, static assets) and a request.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeR2 } from './fake-r2.mjs';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'public');
export const WORKER = 'test-worker-secret';
export const PING = 'test-ping-secret';

export function makeEnv(overrides = {}) {
  let now = Date.parse('2026-11-01T12:00:00Z');
  return {
    FILES: new FakeR2(),
    WORKER_SECRET: WORKER,
    PING_SECRET: PING,
    TURNSTILE_SECRET: 'test-turnstile',
    GUMROAD_ACCESS_TOKEN: 'test-gumroad-token',
    GUMROAD_PRODUCT_ID: 'prod-1',
    GUMROAD_PRODUCT_URL: 'https://example.gumroad.com/l/report',
    ASSETS: {
      async fetch(req) {
        const p = decodeURIComponent(new URL(req.url ?? req).pathname);
        try {
          return new Response(await readFile(path.join(publicDir, p)), { status: 200 });
        } catch {
          return new Response('Not found', { status: 404 });
        }
      },
    },
    __now: () => now,
    __setNow: (ms) => { now = ms; },
    __fetch: async () => { throw new Error('no outside fetch in this test'); },
    ...overrides,
  };
}

export function makeCtx({ method = 'GET', url = 'https://cosmicuniversum.com/', body, headers = {}, env = makeEnv(), params = {} } = {}) {
  const init = { method, headers: { 'cf-connecting-ip': '203.0.113.9', ...headers } };
  if (body !== undefined) {
    if (typeof body === 'string' || body instanceof Uint8Array || body instanceof URLSearchParams) init.body = body;
    else { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
  }
  return { request: new Request(url, init), env, params };
}

export const bearer = (secret = WORKER) => ({ authorization: `Bearer ${secret}` });
