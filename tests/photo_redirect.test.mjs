import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/projects/[[path]].js';

test('legacy photo query links redirect to a client-only fragment', async () => {
  const id='c48f117ebe1c41a29b0711c2';
  const response=await onRequest({request:new Request('https://nickckincaid.com/projects/test/?photo='+id)});
  assert.equal(response.status,302);
  assert.equal(response.headers.get('location'),'/projects/test/#photo='+id);
  assert.equal(response.headers.get('cache-control'),'no-store');
});

test('normal project requests pass through to static assets', async () => {
  let continued=false;
  const result=await onRequest({request:new Request('https://nickckincaid.com/projects/test/'),next:async()=>{continued=true;return new Response('ok');}});
  assert.equal(result.status,200);
  assert.equal(continued,true);
});

test('malformed identifiers do not redirect', async () => {
  let continued=false;
  const result=await onRequest({request:new Request('https://nickckincaid.com/projects/test/?photo=javascript:alert(1)'),next:async()=>{continued=true;return new Response('ok');}});
  assert.equal(result.status,200);
  assert.equal(continued,true);
});
