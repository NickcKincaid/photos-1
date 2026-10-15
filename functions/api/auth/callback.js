import { oauthOrigin, OWNER_LOGIN, cookies, configured, makeSession, redirect } from '../../../admin-lib/session.js';
const clearState='photo_oauth_state=; Path=/api/auth/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';
export async function onRequestGet(context) {
  if (!configured(context.env)) return new Response('Admin setup incomplete.',{status:503});
  const origin = oauthOrigin(context.env);
  if (new URL(context.request.url).origin !== origin) return new Response('Use the configured photography domain to sign in.', {status:400});
  const url=new URL(context.request.url),state=url.searchParams.get('state'),code=url.searchParams.get('code');
  const expected=cookies(context.request).photo_oauth_state;
  if (!code || !state || !expected || !/^[0-9a-f]{48}$/.test(state) || state!==expected) return new Response('GitHub sign-in failed. Please try again.',{status:403});
  try {
    const params=new URLSearchParams({client_id:context.env.GITHUB_OAUTH_CLIENT_ID,client_secret:context.env.GITHUB_OAUTH_CLIENT_SECRET,code,redirect_uri:origin+'/api/auth/callback'});
    const exchange=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:params});
    if (!exchange.ok) throw Error('GitHub OAuth token exchange failed');
    const granted=await exchange.json();
    if (!granted.access_token || granted.error) throw Error('GitHub declined authentication');
    const response=await fetch('https://api.github.com/user',{headers:{Authorization:`Bearer ${granted.access_token}`,Accept:'application/vnd.github+json','User-Agent':'photography-portfolio-auth'}});
    if (!response.ok) throw Error('Could not verify GitHub account');
    const user=await response.json();
    if (String(user.login || '').toLowerCase()!==OWNER_LOGIN || !Number.isSafeInteger(user.id)) return new Response('This GitHub account is not authorized to edit this portfolio.',{status:403,headers:{'Set-Cookie':clearState}});
    const session=await makeSession(context.env,user);
    return redirect('/admin/',[
      clearState,
      `photo_session=${session}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax`,
    ]);
  } catch(_error) {return new Response('GitHub sign-in failed. Please try again.',{status:502,headers:{'Set-Cookie':clearState}});}
}
