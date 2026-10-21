import test from 'node:test';
import assert from 'node:assert/strict';
import {gh} from '../admin-lib/github.js';
import {onRequestGet as photoGet, onRequestHead as photoHead} from '../functions/media/[[all]].js';
const context={env:{GITHUB_TOKEN:'fake'}};

test('GitHub requests carry a deadline via AbortController signal',async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=async (_uri,options)=>{
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted,false);
    return Response.json({ok:true});
  };
  try {assert.deepEqual(await gh(context,'/test'),{ok:true});}
  finally {globalThis.fetch=previous;}
});

test('R2 media uses sanitized extension-based content type rather than stored arbitrary MIME metadata',async()=>{
  const object={body:new Blob(['abc']).stream(),etag:'abc',size:3,httpMetadata:{contentType:'text/html'}};
  const env={PHOTO_BUCKET:{get:async()=>object,head:async()=>object},ASSETS:{fetch:async()=>new Response('fallback')}};
  const get=await photoGet({request:new Request('https://nickckincaid.com/media/street/street-01.jpg'),env});
  assert.equal(get.status,200);
  assert.equal(get.headers.get('content-type'),'image/jpeg');
  assert.equal(get.headers.get('x-content-type-options'),'nosniff');
  const head=await photoHead({request:new Request('https://nickckincaid.com/media/street/street-01.webp',{method:'HEAD'}),env});
  assert.equal(head.headers.get('content-type'),'image/webp');
  assert.equal(head.body,null);
});

test('unsafe media keys are rejected before reaching R2',async()=>{
  let queried=0;
  const env={PHOTO_BUCKET:{get:async()=>{queried++;return null;}},ASSETS:{fetch:async()=>new Response('fallback')}};
  const result=await photoGet({request:new Request('https://nickckincaid.com/media/gallery/test.html'),env});
  assert.equal(result.status,404);
  assert.equal(queried,0);
});
