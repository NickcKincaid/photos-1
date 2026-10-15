// Backwards compatibility: turn old ?photo= links into client-only #photo=
// links before serving the static project page. Never redirect external hosts.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('photo');
  if (!id) return context.next();
  if (!/^(?:[a-f0-9]{16}|[a-f0-9]{24}|[1-9][0-9]{0,3})$/i.test(id)) return context.next();
  url.searchParams.delete('photo');
  url.hash = 'photo=' + encodeURIComponent(id);
  return new Response(null, {status:302, headers: {'Location': url.pathname + url.search + url.hash, 'Cache-Control':'no-store'}});
}
