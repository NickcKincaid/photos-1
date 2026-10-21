import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet, summarizeDeployment} from '../functions/api/admin/deployment.js';
import {onRequestPost, cleanAlt} from '../functions/api/admin/describe.js';

test('deployment mapping distinguishes complete, queued, active and failure stages',()=>{
  const base={deployment_trigger:{metadata:{commit_hash:'a'.repeat(40)}},environment:'production'};
  assert.equal(summarizeDeployment({...base,latest_stage:{name:'deploy',status:'success'}}).status,'success');
  assert.equal(summarizeDeployment({...base,latest_stage:{name:'build',status:'active'}}).status,'building');
  assert.equal(summarizeDeployment({...base,latest_stage:{name:'queued',status:'idle'}}).status,'queued');
  assert.equal(summarizeDeployment({...base,latest_stage:{name:'build',status:'failure'}}).status,'failed');
  assert.equal(summarizeDeployment({...base,latest_stage:{name:'build',status:'success'}}).status,'building');
  assert.equal(summarizeDeployment(base).commit,'a'.repeat(12));
});

test('deployment endpoint requires a server-only token',async()=>{
  const res=await onRequestGet({env:{CF_ACCOUNT_ID:'f'.repeat(32),CF_PAGES_PROJECT:'photos-1'}});
  assert.equal(res.status,503);
  const body=await res.json();assert.match(body.error,/CF_PAGES_READ_TOKEN/);
});

test('deployment endpoint sends credentials only upstream and does not expose token',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async(url,opts)=>{
    assert.match(url,/env=production/);
    assert.equal(opts.headers.Authorization,'Bearer private-value');
    return Response.json({success:true,result:[{environment:'production',id:'abc',latest_stage:{name:'deploy',status:'success'},deployment_trigger:{metadata:{commit_hash:'1234567890abcdef'}}}]});
  };
  try{
    const res=await onRequestGet({env:{CF_ACCOUNT_ID:'f'.repeat(32),CF_PAGES_PROJECT:'photos-1',CF_PAGES_READ_TOKEN:'private-value'}});
    assert.equal(res.status,200);
    const text=await res.text();
    assert.equal(JSON.parse(text).status,'success');
    assert.equal(text.includes('private-value'),false);
  }finally{globalThis.fetch=original;}
});

test('AI endpoint explicitly fails when AI binding is not enabled',async()=>{
  const res=await onRequestPost({request:new Request('https://nickckincaid.com/api/admin/describe',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:new Uint8Array([255,216,255,217])}),env:{}});
  assert.equal(res.status,503);
});

test('AI endpoint checks JPEG file content and size before sending images',async()=>{
  let called=false;const env={AI:{run:async()=>{called=true;return {response:'A close view of weathered wooden planks beside a stone wall.'};}}};
  const request=new Request('https://nickckincaid.com/api/admin/describe',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:new Uint8Array(120)});
  const res=await onRequestPost({request,env});
  assert.equal(res.status,400);assert.equal(called,false);
});

test('AI caption returns sanitized text and sends only resized image data',async()=>{
  const bytes=new Uint8Array(120).fill(8);bytes.set([255,216],0);bytes.set([255,217],118);
  let received=false;
  const env={AI:{run:async(model,input)=>{
    assert.equal(model,'@cf/moondream/moondream3.1-9B-A2B');
    assert.match(input.image,/^data:image\/jpeg;base64,/);
    assert.equal(input.task,'query');
    assert.match(input.question,/visually grounded/i);
    received=true;
    return {response:'"An old brick building beneath a cloudy sky, with a metal railing in front."'};
  }}};
  const request=new Request('https://nickckincaid.com/api/admin/describe',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:bytes});
  const res=await onRequestPost({request,env});
  assert.equal(res.status,200);assert.equal(received,true);
  assert.equal((await res.json()).alt,'An old brick building beneath a cloudy sky, with a metal railing in front.');
  assert.equal(cleanAlt('Photo of a tree beside a white house.'),'a tree beside a white house.');
});
