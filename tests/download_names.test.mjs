import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet, onRequestHead} from '../functions/media/[[all]].js';

function mockContext(url) {
  const observed = {reads: [], writes: 0};
  const object = {
    size: 3, etag: 'testetag', httpMetadata: {contentType:'image/jpeg'},
    body: new Uint8Array([0xff,0xd8,0xff]),
  };
  const bucket = {
    async get(key) {observed.reads.push(key); return object;},
    async head(key) {observed.reads.push(key); return object;},
    async put() {observed.writes++; throw Error('Should never copy or rename');},
    async delete() {observed.writes++; throw Error('Should never delete');},
  };
  return {observed, context:{request:new Request(url), env:{PHOTO_BUCKET:bucket,ASSETS:{fetch:async()=>new Response('fallback')}}}};
}

test('same permanent R2 key produces different download filenames after reordering', async () => {
  const key='/media/test/immutable-id/test-01.jpg';
  for (const filename of ['test-project-01.jpg','test-project-03.jpg']) {
    const {observed, context} = mockContext('https://nickckincaid.com'+key+'?download='+filename);
    const response=await onRequestGet(context);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-disposition'),`attachment; filename="${filename}"`);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.deepEqual(observed.reads,[key.slice(1)]);
    assert.equal(observed.writes,0);
  }
});

test('normal image requests remain inline with normal caching', async () => {
  const {context}=mockContext('https://nickckincaid.com/media/test/id/test-01.jpg?v=123');
  const response=await onRequestGet(context);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-disposition'),null);
  assert.equal(response.headers.get('cache-control'),'public, max-age=3600');
});

test('invalid Content-Disposition filenames are rejected before hitting R2', async()=>{
  const {context,observed}=mockContext('https://nickckincaid.com/media/test/id/test-01.jpg?download=%0D%0AX-Evil:1');
  const response=await onRequestGet(context);
  assert.equal(response.status,400);
  assert.equal(observed.reads.length,0);
});

test('HEAD downloads have the name and length without a body',async()=>{
  const {context}=mockContext('https://nickckincaid.com/media/test/id/test-01.jpg?download=test-project-02.jpg');
  const response=await onRequestHead(context);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-length'),'3');
  assert.equal(response.headers.get('content-disposition'),'attachment; filename="test-project-02.jpg"');
});
