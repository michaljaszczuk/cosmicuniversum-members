// Send the old pages.dev host and www to the main domain (301, same path).
// Preview URLs like abc123.cosmicuniversum.pages.dev are left alone.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === 'cosmicuniversum.pages.dev' || url.hostname === 'www.cosmicuniversum.com') {
    url.hostname = 'cosmicuniversum.com';
    url.protocol = 'https:';
    url.port = '';
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}
