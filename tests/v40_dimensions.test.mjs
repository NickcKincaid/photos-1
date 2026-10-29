import test from 'node:test';
import assert from 'node:assert/strict';
import {jpegDimensions, r2JpegDimensions} from '../admin-lib/jpeg-dimensions.js';
import {onRequestPost} from '../functions/api/admin/dimensions.js';

const SHA='a'.repeat(40), SHA2='b'.repeat(40);
const IMAGE='/media/demo/'+'1'.repeat(24)+'/demo-01.jpg';
const original={title:'Demo',published:true,cover:IMAGE,gallery:[],photo_details:[
  {image:IMAGE,storage:'r2',id:'1'.repeat(24),alt:'Description',iso:'ISO 100',shutter_speed:'1/125s'}
]};
// A minimal, structurally valid JPEG header containing a baseline SOF marker.
const bytes=Uint8Array.from([0xff,0xd8,0xff,0xe0,0,4,0,0,
  0xff,0xc0,0,11,8,0x0f,0xa0,0x17,0x70,3,1,0x11,0,
  0xff,0xd9]);
const req=(revision=SHA,slug='demo')=>new Request('https://nickckincaid.com/api/admin/dimensions',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({slug,revision})
});
const encoded=x=>Buffer.from(JSON.stringify(x)).toString('base64');

test('header parser reads dimensions without decoding full JPEG',()=>{
  assert.deepEqual(jpegDimensions(bytes),{width:6000,height:4000});
  assert.equal(jpegDimensions(bytes.subarray(0,15)),null);
  assert.equal(jpegDimensions(Uint8Array.of(0,1,2,3)),null);
  assert.equal(jpegDimensions(Uint8Array.from([0xff,0xd8,0xff,0xe0,0,0,0,0,0,0])),null);
});
test('R2 reader requests bounded prefixes only',async()=>{
  let range,called=0;
  const result=await r2JpegDimensions({async get(k,opt){
    assert.equal(k,IMAGE.slice(1));range=opt.range;called++;
    return {async arrayBuffer(){return bytes.buffer;}};
  }},IMAGE.slice(1));
  assert.deepEqual(result,{width:6000,height:4000});
  assert.deepEqual(range,{offset:0,length:131072});
  assert.equal(called,1);
});
test('legacy R2 images get dimensions without rewriting other metadata',async()=>{
  const old=globalThis.fetch;
  let saved;
  globalThis.fetch=async(url,opt)=>{
    if(opt.method==='GET')return Response.json({type:'file',sha:SHA,content:encoded(original)});
    const b=JSON.parse(opt.body);
    saved=JSON.parse(Buffer.from(b.content,'base64').toString());
    assert.equal(b.sha,SHA);
    return Response.json({content:{sha:SHA2}});
  };
  try {
    const out=await onRequestPost({request:req(),env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:{
      async get(){return {async arrayBuffer(){return bytes.buffer;}};}
    }}});
    assert.equal(out.status,200);
    const body=await out.json();
    assert.equal(body.updated,1);assert.equal(body.revision,SHA2);
    assert.deepEqual(body.dimensions,[{image:IMAGE,width:6000,height:4000}]);
    assert.equal(saved.photo_details[0].alt,'Description');
    assert.equal(saved.photo_details[0].iso,'ISO 100');
    assert.equal(saved.photo_details[0].width,6000);
    assert.equal(saved.photo_details[0].height,4000);
    assert.equal(saved.cover,original.cover);
  } finally {globalThis.fetch=old;}
});
test('stale revision is rejected without R2 reads or GitHub commits',async()=>{
  const old=globalThis.fetch;let reads=0,writes=0;
  globalThis.fetch=async(_url,opt)=>{if(opt.method==='PUT')writes++;return Response.json({sha:SHA,content:encoded(original)});};
  try{
    const out=await onRequestPost({request:req(SHA2),env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:{async get(){reads++;}}}});
    assert.equal(out.status,409);assert.equal(reads,0);assert.equal(writes,0);
  }finally{globalThis.fetch=old;}
});
test('no-op on already dimensioned project, preserving its revision',async()=>{
  const old=globalThis.fetch;let writes=0;
  const data=structuredClone(original);
  data.photo_details[0].width=6000;data.photo_details[0].height=4000;
  globalThis.fetch=async(_url,opt)=>{if(opt.method==='PUT')writes++;return Response.json({sha:SHA,content:encoded(data)});};
  try{
    const out=await onRequestPost({request:req(),env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:{}}});
    assert.deepEqual(await out.json(),{ok:true,updated:0,revision:SHA,dimensions:[]});
    assert.equal(writes,0);
  } finally {globalThis.fetch=old;}
});
test('invalid slug is rejected before fetching GitHub or R2',async()=>{
  const out=await onRequestPost({request:req(SHA,'../secrets'),env:{PHOTO_BUCKET:{}}});
  assert.equal(out.status,400);
});
