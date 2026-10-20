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
  // An optional download filename is deliberately a *presentation* detail:
  // the underlying R2 object key is not renamed when project order changes.
  const requestedName = url.searchParams.get('download');
  if (requestedName !== null &&
      !/^[a-z0-9](?:[a-z0-9-]{0,80})-[0-9]{2,4}\.(?:jpg|jpeg|png|webp|tif|tiff)$/.test(requestedName)) {
    return new Response('Invalid download filename', { status: 400 });
  }
  if (context.env.PHOTO_BUCKET) {
    // Conditional GETs can avoid fetching the image body from R2 entirely.
    // Only compare against a real R2 ETag; downloads always bypass this shortcut.
    const condition = !headOnly && !requestedName ? context.request.headers.get('if-none-match') : null;
    let cached = null;
    if (condition && condition.length <= 512) {
      cached = await context.env.PHOTO_BUCKET.head(key);
      if (cached?.etag) {
        const etag = `"${cached.etag.replace(/"/g, '')}"`;
        const matches = condition.split(',').some(tag => {
          const clean = tag.trim().replace(/^W\//, '');
          return clean === etag;
        });
        if (matches) return new Response(null, {status:304,headers:{
          'ETag':etag, 'Cache-Control':'public, max-age=3600',
          'X-Content-Type-Options':'nosniff'
        }});
      }
    }
    const object = headOnly
      ? await context.env.PHOTO_BUCKET.head(key)
      : await context.env.PHOTO_BUCKET.get(key);
    if (object) {
      const headers = new Headers({
        'Content-Type': object.httpMetadata?.contentType || serveType(key),
        'X-Content-Type-Options': 'nosniff',
        // Use a short TTL: migrated images may initially share URLs with static copies.
        'Cache-Control': requestedName ? 'private, no-store' : 'public, max-age=3600',
      });
      if (requestedName) {
        headers.set('Content-Disposition', `attachment; filename="${requestedName}"`);
      }
      const legacy = /^media\/([a-z0-9-]{1,65})\/\1-([0-9]{2,3})-[a-f0-9]{24}\.jpg$/i.exec(key);
      if (legacy && !requestedName) headers.set('Content-Disposition', `inline; filename="${legacy[1]}-${legacy[2]}.jpg"`);
      // New keys already end with a readable project-01.jpg filename.
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
