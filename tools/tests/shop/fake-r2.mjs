// In-memory stand-in for a Cloudflare R2 bucket binding (only what the shop uses).
// list() pages 2 keys at a time by default, so callers must follow the cursor.
export class FakeR2 {
  constructor() { this.store = new Map(); }

  async put(key, value, { customMetadata = {} } = {}) {
    const bytes = new Uint8Array(await new Response(value).arrayBuffer());
    this.store.set(key, { bytes, customMetadata: { ...customMetadata }, uploaded: new Date() });
  }

  async get(key) {
    const o = this.store.get(key);
    if (!o) return null;
    const bytes = o.bytes;
    return {
      key, size: bytes.length, customMetadata: { ...o.customMetadata }, uploaded: o.uploaded,
      body: new Response(bytes).body,
      text: async () => new TextDecoder().decode(bytes),
      json: async () => JSON.parse(new TextDecoder().decode(bytes)),
      arrayBuffer: async () => bytes.slice().buffer,
    };
  }

  async delete(keys) {
    for (const k of [].concat(keys)) this.store.delete(k);
  }

  async list({ prefix = '', cursor, limit = 2, include = [] } = {}) {
    const all = [...this.store.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? +cursor : 0;
    const page = all.slice(start, start + limit);
    const truncated = start + limit < all.length;
    return {
      objects: page.map((key) => {
        const o = this.store.get(key);
        return { key, size: o.bytes.length, uploaded: o.uploaded,
          ...(include.includes('customMetadata') ? { customMetadata: { ...o.customMetadata } } : {}) };
      }),
      truncated,
      ...(truncated ? { cursor: String(start + limit) } : {}),
    };
  }

  keys(prefix = '') { return [...this.store.keys()].filter((k) => k.startsWith(prefix)).sort(); }
}
