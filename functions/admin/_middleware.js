import { verifySession, redirect } from '../../admin-lib/session.js';
export async function onRequest(context) {
  const session = await verifySession(context);
  if (session.ok) return context.next();
  if (session.status===503) return new Response('Admin setup incomplete. See ADMIN_SETUP.md.',{status:503});
  return redirect('/api/auth/login');
}
