import test from 'node:test';
import assert from 'node:assert/strict';
import {readStaticImageLimited,onRequestPost} from '../functions/api/admin/migrate.js';

const src = '/media/example/example-01.jpg';

test('legacy migration reads a bounded, known-length Uint8Array for R2', async () => {
  const oldFetch=globalThis.fetch;
  let uploaded;
  let staticUrl='';
  globalThis.fetch = async () => Response.json({
    type:'file',content:Buffer.from(JSON.stringify({cover:src,gallery:[]})).toString('base64')
  });
  try {
    const request=new Request('https://nickckincaid.com/api/admin/migrate',{
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({slug:'example',path:src})
    });
    const result=await onRequestPost({request,env:{GITHUB_TOKEN:'test',
      PHOTO_BUCKET:{ async head(){return null;}, async put(key,bytes,meta){uploaded={key,bytes,meta};}},
      ASSETS:{ async fetch(request){staticUrl=request.url;return new Response(Uint8Array.of(0xff,0xd8,0xff,0xd9),{headers:{'content-type':'image/jpeg'}});}}
    }});
    assert.equal(result.status,200);
    assert.equal((await result.json()).migrated,true);
    assert.equal(staticUrl,'https://nickckincaid.com'+src);
    assert.equal(uploaded.key,'media/example/example-01.jpg');
    assert(uploaded.bytes instanceof Uint8Array,'R2 put must receive known-length bytes, not an unknown-length stream');
    assert.deepEqual([...uploaded.bytes],[0xff,0xd8,0xff,0xd9]);
    assert.equal(uploaded.meta.httpMetadata.contentType,'image/jpeg');
  } finally { globalThis.fetch=oldFetch; }
});

test('migration reader rejects missing bodies and zero-byte images', async () => {
  await assert.rejects(readStaticImageLimited(new Response(null)),/no response body/i);
  await assert.rejects(readStaticImageLimited(new Response('')),/empty/i);
});

test('migration reader enforces declared and streamed byte limits', async () => {
  const declared=new Response(Uint8Array.of(1,2,3),{headers:{'content-length':'100'}});
  await assert.rejects(readStaticImageLimited(declared,5),/too large/i);
  const actual=new Response(Uint8Array.of(1,2,3,4,5,6));
  await assert.rejects(readStaticImageLimited(actual,5),/migration limit/i);
});
