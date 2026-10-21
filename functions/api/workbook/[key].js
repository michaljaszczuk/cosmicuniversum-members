import { FILES, SECURITY_HEADERS } from "../../_shared/lib.js";

// Public download for the free workbook page. Only keys in FILES resolve to an R2 object.
export async function onRequestGet({ env, params }) {
  const key = String(params.key);
  if (!Object.hasOwn(FILES, key)) return new Response("Not found", { status: 404, headers: SECURITY_HEADERS });
  const file = FILES[key];
  const object = await env.FILES.get(file.r2Key);
  if (!object) return new Response("Not found", { status: 404, headers: SECURITY_HEADERS });
  return new Response(object.body, {
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${file.downloadName}"`,
      "Content-Length": String(object.size),
    },
  });
}
