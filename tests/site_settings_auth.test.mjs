import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/admin/_middleware.js';
import {makeSession} from '../admin-lib/session.js';

const env={GITHUB_TOKEN:'test',GITHUB_OAUTH_CLIENT_ID:'test',GITHUB_OAUTH_CLIENT_SECRET:'test',ADMIN_SESSION_SECRET:'a'.repeat(64)};
const ctx=async (cookie, origin)=>({
  env,
  request:new Request('https://nickckincaid.com/api/admin/site-settings',{
    method:'POST',headers:{'cookie':cookie,...(origin?{'origin':origin}:{})},body:'{}'
  }),
  next:async()=>new Response('ok')
});

test('site settings reject unsigned or missing admin session',async()=>{
  const res=await onRequest(await ctx('', 'https://nickckincaid.com'));
  assert.equal(res.status,401);
});

test('site settings reject cross-origin writes even with valid session',async()=>{
  const token=await makeSession(env,{id:1234});
  const res=await onRequest(await ctx('photo_session='+token,'https://evil.example'));
  assert.equal(res.status,403);
  const allowed=await onRequest(await ctx('photo_session='+token,'https://nickckincaid.com'));
  assert.equal(allowed.status,200);
});
