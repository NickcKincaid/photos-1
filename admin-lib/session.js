// Small, dependency-free GitHub OAuth session for this one-owner portfolio.
// Cookies are HttpOnly, Secure and signed with a dedicated Cloudflare secret.
const SITE_ORIGIN = 'https://nickckincaid.com';
// Override only for deliberate domain migrations; never derive OAuth redirects from Host headers.
export function oauthOrigin(env) {
  const origin = String(env.PUBLIC_SITE_ORIGIN || SITE_ORIGIN).replace(/\/$/, '');
  if (!/^https:\/\/[a-zA-Z0-9.-]+(?::443)?$/.test(origin)) throw Error('Invalid PUBLIC_SITE_ORIGIN');
  return origin;
}
const OWNER_LOGIN = 'nickckincaid';
const enc = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function un64(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw Error('Invalid cookie');
  const pad = value.replace(/-/g,'+').replace(/_/g,'/');
  return Uint8Array.from(atob(pad + '='.repeat((4-pad.length%4)%4)), c=>c.charCodeAt(0));
}
function cookies(request) {
  const result = {};
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) result[part.slice(0,i).trim()]=part.slice(i+1).trim();
  }
  return result;
}
export { SITE_ORIGIN, OWNER_LOGIN, cookies };
export const json = (obj, status=200) => new Response(JSON.stringify(obj), { status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'} });
export function configured(env) {
  return Boolean(env.GITHUB_TOKEN && env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET && String(env.ADMIN_SESSION_SECRET||'').length>=32);
}
async function hmacKey(secret) {
  return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
export async function makeSession(env, user) {
  const payload=b64(enc.encode(JSON.stringify({login:OWNER_LOGIN,id:user.id,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+86400})));
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC',await hmacKey(env.ADMIN_SESSION_SECRET),enc.encode(payload)));
  return `${payload}.${b64(signed)}`;
}
export async function verifySession(context) {
  if (!configured(context.env)) return { ok:false, status:503, error:'Admin setup incomplete. See ADMIN_SETUP.md.' };
  const cookie=cookies(context.request).photo_session;
  if (!cookie || cookie.length>4096) return {ok:false,status:401,error:'Please sign in with GitHub.'};
  try {
    const [part,signature,extra] = cookie.split('.');
    if (!part || !signature || extra) throw Error('Invalid cookie');
    const good = await crypto.subtle.verify('HMAC',await hmacKey(context.env.ADMIN_SESSION_SECRET),un64(signature),enc.encode(part));
    if (!good) throw Error('Invalid signature');
    const payload = JSON.parse(new TextDecoder().decode(un64(part)));
    const now=Math.floor(Date.now()/1000);
    if (payload.login !== OWNER_LOGIN || !Number.isSafeInteger(payload.id) ||
        !Number.isSafeInteger(payload.exp) || payload.exp<=now ||
        !Number.isSafeInteger(payload.iat) || payload.iat>now+30) throw Error('Invalid session');
    return {ok:true};
  } catch {return {ok:false,status:401,error:'Session expired. Please sign in again.'};}
}
export function checkOrigin(request) {
  const method=request.method;
  return method==='GET' || method==='HEAD' || (request.headers.get('origin')===new URL(request.url).origin);
}
export function redirect(url, cookies=[]){
  const headers=new Headers({'location':url,'cache-control':'no-store','referrer-policy':'no-referrer'});
  for(const c of cookies)headers.append('Set-Cookie',c);
  return new Response(null,{status:303,headers});
}

// Some clients omit Content-Length. Read at most maxBytes + 1, then abort.
// Unlike request.json()/arrayBuffer(), this bounds memory for hostile uploads.
export async function readLimited(request, maxBytes) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxBytes) {
    const error = Error('Request exceeds the upload size limit.'); error.status = 413; throw error;
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const parts = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        const error = Error('Request exceeds the upload size limit.'); error.status = 413; throw error;
      }
      parts.push(value);
    }
  } finally { if (total > maxBytes) { try { await reader.cancel(); } catch {} } }
  const data = new Uint8Array(total); let at = 0;
  for (const part of parts) { data.set(part, at); at += part.length; }
  return data;
}
