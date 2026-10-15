// Serve media from the private R2 bucket first and retain old GitHub Pages
// assets as a fallback. URLs remain /media/... across the migration.
const KEY = /^media\/(?!_unused\/)[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*\.(?:jpe?g|png|webp|tiff?)$/i;
function serveType(key) {
  if (/\.webp$/i.test(key)) return 'image/webp';
  if (/\.png$/i.test(key)) return 'image/png';
  if (/\.tiff?$/i.test(key)) return 'image/tiff';
  return 'image/jpeg';
}
async function handle(context, headOnly) {
  const url = new URL(context.request.url);
  const key = url.pathname.replace(/^\//, '');
  // No path traversal, hidden internals, arbitrary file types, or URL-decoding surprises.
  if (!KEY.test(key) || key.includes('..') || key.includes('//')) {
    return new Response('Not found', {status:404});
  }
  if (context.env.PHOTO_BUCKET) {
    const object = headOnly
      ? await context.env.PHOTO_BUCKET.head(key)
      : await context.env.PHOTO_BUCKET.get(key);
    if (object) {
      const headers = new Headers({
        'Content-Type': object.httpMetadata?.contentType || serveType(key),
        'X-Content-Type-Options': 'nosniff',
        // Use a short TTL: migrated images may initially share URLs with static copies.
        'Cache-Control': 'public, max-age=3600',
      });
      if (object.etag) headers.set('ETag', `"${object.etag.replace(/"/g, '')}"`);
      if (typeof object.size === 'number') headers.set('Content-Length', String(object.size));
      return new Response(headOnly ? null : object.body, {status:200,headers});
    }
  }
  // Pages' static asset service still contains the pre-migration photographs.
  return context.env.ASSETS.fetch(context.request);
}
export const onRequestGet = context => handle(context, false);
export const onRequestHead = context => handle(context, true);
