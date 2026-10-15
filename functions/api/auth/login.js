import { SITE_ORIGIN, configured, redirect } from '../../../admin-lib/session.js';
export function onRequestGet(context) {
  if (!configured(context.env)) return new Response('Admin setup incomplete. See ADMIN_SETUP.md.',{status:503});
  const nonce=new Uint8Array(24);crypto.getRandomValues(nonce);
  const state=Array.from(nonce,x=>x.toString(16).padStart(2,'0')).join('');
  const query=new URLSearchParams({client_id:context.env.GITHUB_OAUTH_CLIENT_ID,redirect_uri:SITE_ORIGIN+'/api/auth/callback',scope:'read:user',state});
  const url='https://github.com/login/oauth/authorize?'+query;
  return redirect(url,[`photo_oauth_state=${state}; Path=/api/auth/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`]);
}
