// Root middleware is required to protect static /admin/* assets on Pages.
// Static photo pages bypass this Function through dist/_routes.json.
import { verifySession, redirect } from '../admin-lib/session.js';
export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;
  if (path === '/admin' || path.startsWith('/admin/')) {
    const session = await verifySession(context);
    if (!session.ok) {
      if (session.status === 503) return new Response('Admin setup incomplete. See ADMIN_SETUP.md.', {
        status: 503, headers: { 'cache-control': 'no-store' }
      });
      return redirect('/api/auth/login');
    }
    // Private assets should not remain in intermediate or browser caches.
    const response = await context.next();
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store, private');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    return new Response(response.body, { status: response.status, headers });
  }
  return context.next();
}
