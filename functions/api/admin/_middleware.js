import { verifySession, checkOrigin, json } from '../../../admin-lib/session.js';
export async function onRequest(context) {
  const session = await verifySession(context);
  if (!session.ok) return json({error:session.error}, session.status);
  if (!checkOrigin(context.request)) return json({error:'Cross-site requests are not permitted.'},403);
  return context.next();
}
