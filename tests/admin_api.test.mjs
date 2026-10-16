import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestPost as upload} from '../functions/api/admin/upload.js';
import {onRequestPost as save} from '../functions/api/admin/save.js';
import {onRequestPost as reorder} from '../functions/api/admin/reorder.js';

function jsonResponse(value,status=200) {
  return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
}
const SHA = 'a'.repeat(40), ANOTHER = 'b'.repeat(40);
function photoRequest(type,bytes,variant=false) {
  const headers = {'content-type':type,'X-Photo-Project':'test','X-Photo-Position':'1'};
  if(variant){ headers['X-Photo-Variant']='640';headers['X-Photo-Source']='media/test/test-01-'+ 'a'.repeat(24)+'.jpg'; }
  return new Request('https://nickckincaid.com/api/admin/upload',{method:'POST',headers,body:bytes});
}
function bucket() {
 const saved=new Map();
 return {saved, async put(key,data){
   if (data instanceof ReadableStream) throw Error('Provided readable stream must have a known length');
   saved.set(key,new Uint8Array(await new Response(data).arrayBuffer()));
 },
   async head(key){return saved.has(key)?{size:saved.get(key).length}:null;},
   async delete(key){saved.delete(key);}};
}

test('upload accepts an actual JPEG and writes to R2',async()=>{
 const b=bucket(); const bytes=new Uint8Array([255,216,255,224,0,2,255,217]);
 const response=await upload({request:photoRequest('image/jpeg',bytes),env:{PHOTO_BUCKET:b}});
 assert.equal(response.status,200);
 const result=await response.json();
 assert.match(result.path,/^\/media\/test\/test-01-[a-f0-9]{24}\.jpg$/);
 assert.deepEqual([...b.saved.values()][0],bytes);
});

test('upload stays within the 3 MB limit even when no Content-Length is provided',async()=>{
 const b=bucket();
 const bytes=new Uint8Array(3_000_001);
 bytes.set([255,216,255]);
 const response=await upload({request:photoRequest('image/jpeg',bytes),env:{PHOTO_BUCKET:b}});
 assert.equal(response.status,413);
 assert.equal(b.saved.size,0);
});

test('upload rejects an empty body instead of creating a zero-byte R2 file',async()=>{
 const b=bucket();
 const response=await upload({request:photoRequest('image/jpeg',new Uint8Array()),env:{PHOTO_BUCKET:b}});
 assert.equal(response.status,400);
 assert.equal(b.saved.size,0);
});

test('upload reports a missing R2 binding without a generic 502',async()=>{
 const response=await upload({request:photoRequest('image/jpeg',new Uint8Array([255,216,255])),env:{}});
 assert.equal(response.status,503);
 assert.match((await response.json()).error,/PHOTO_BUCKET/);
});

test('upload rejects misleading MIME type without persisting an object',async()=>{
 const b=bucket(); const bytes=new TextEncoder().encode('<html>');
 const response=await upload({request:photoRequest('image/jpeg',bytes),env:{PHOTO_BUCKET:b}});
 assert.equal(response.status,415);
 assert.equal(b.saved.size,0);
});

test('upload rejects WebP that is not actually a RIFF/WEBP',async()=>{
 const b=bucket(); const source='media/test/test-01-'+ 'a'.repeat(24)+'.jpg';
 b.saved.set(source,new Uint8Array([255,216,255]));
 const response=await upload({request:photoRequest('image/webp',new Uint8Array(25),true),env:{PHOTO_BUCKET:b}});
 assert.equal(response.status,415);
 assert.equal(b.saved.size,1);
});

function mockGithub(project={title:'Tokyo',published:false,cover:'',gallery:[],photo_details:[],order:1}) {
 const calls=[];
 const trees=[];
 const original=globalThis.fetch;
 globalThis.fetch=async function(url,opts={}) {
   calls.push([new URL(url).pathname,opts.method||'GET']);
   const u=new URL(url),path=u.pathname;
   if(path.endsWith('/contents/content/projects/tokyo.json'))
     return jsonResponse({type:'file',sha:SHA,content:Buffer.from(JSON.stringify(project)).toString('base64')});
   if(path.endsWith('/contents/content/projects'))
     return jsonResponse([{type:'file',name:'tokyo.json',sha:SHA}]);
   if(path.endsWith('/git/ref/heads/main'))return jsonResponse({object:{sha:ANOTHER}});
   if(path.endsWith('/git/commits/'+ANOTHER))return jsonResponse({tree:{sha:SHA}});
   if(path.endsWith('/git/trees')) { trees.push(JSON.parse(opts.body)); return jsonResponse({sha:ANOTHER}); }
   if(path.endsWith('/git/commits'))return jsonResponse({sha:ANOTHER});
   if(path.endsWith('/git/refs/heads/main'))return jsonResponse({object:{sha:ANOTHER}});
   throw Error('Unexpected mock call '+path);
 };
 return {calls,trees,restore:()=>{globalThis.fetch=original;}};
}
function saveRequest(revision){return new Request('https://nickckincaid.com/api/admin/save',{
 method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({slug:'tokyo',revision,title:'Tokyo',photos:[],published:false,order:1})});}

test('stale project revision is rejected without writing to GitHub',async()=>{
 const gh=mockGithub();try{
 const response=await save({request:saveRequest('0'.repeat(40)),env:{GITHUB_TOKEN:'test'}});
 assert.equal(response.status,409);
 assert.equal(gh.calls.some(([path])=>path.endsWith('/git/trees')),false);
 }finally{gh.restore();}
});

test('current revision allows saving project data',async()=>{
 const gh=mockGithub();try{
 const response=await save({request:saveRequest(SHA),env:{GITHUB_TOKEN:'test'}});
 assert.equal(response.status,200);
 assert.equal((await response.json()).ok,true);
 assert.equal(gh.calls.some(([path])=>path.endsWith('/git/trees')),true);
 }finally{gh.restore();}
});

test('optional project blurb is saved independently of legacy descriptions',async()=>{
 const gh=mockGithub({title:'Tokyo',description:'Older hidden description',published:false,cover:'',gallery:[],photo_details:[],order:1});
 try {
   const response=await save({request:new Request('https://nickckincaid.com/api/admin/save', {
     method:'POST',headers:{'content-type':'application/json'},
     body:JSON.stringify({slug:'tokyo',revision:SHA,title:'Tokyo',published:false,order:1,
        blurb:'A handmade project.\n\nMaterials and process.',photos:[]})}),
     env:{GITHUB_TOKEN:'test'}});
   assert.equal(response.status,200);
   const entry=gh.trees[0].tree.find(item=>item.path==='content/projects/tokyo.json');
   const saved=JSON.parse(entry.content);
   assert.equal(saved.blurb,'A handmade project.\n\nMaterials and process.');
   assert.equal(saved.description,'Older hidden description');
 } finally { gh.restore(); }
});

test('invalid or oversized project blurb is rejected before committing',async()=>{
 for (const blurb of ['a'.repeat(1001), {html:'<script>'}]) {
   const gh=mockGithub();
   try {
     const response=await save({request:new Request('https://nickckincaid.com/api/admin/save', {
       method:'POST',headers:{'content-type':'application/json'},
       body:JSON.stringify({slug:'tokyo',revision:SHA,title:'Tokyo',published:false,order:1,
         blurb,photos:[]})}),env:{GITHUB_TOKEN:'test'}});
     assert.equal(response.status,400);
     assert.equal(gh.trees.length,0);
   } finally { gh.restore(); }
 }
});

test('reorder refuses stale project revisions',async()=>{
 const gh=mockGithub();try{
 const request=new Request('https://nickckincaid.com/api/admin/reorder',{method:'POST',
 headers:{'content-type':'application/json'},body:JSON.stringify({slugs:['tokyo'],revisions:{tokyo:'0'.repeat(40)}})});
 const response=await reorder({request,env:{GITHUB_TOKEN:'test'}});
 assert.equal(response.status,409);
 assert.equal(gh.calls.some(([path])=>path.endsWith('/git/trees')),false);
 }finally{gh.restore();}
});

test('R2 media handler serves valid objects with correct MIME type',async()=>{
 const {onRequestGet} = await import('../functions/media/[[all]].js');
 const response = await onRequestGet({
   request:new Request('https://nickckincaid.com/media/test/example.jpg'),
   env:{PHOTO_BUCKET:{async get(key){ assert.equal(key,'media/test/example.jpg');return {
     body:new Response(new Uint8Array([255,216,255])).body,size:3,etag:'abc',
     httpMetadata:{contentType:'image/jpeg'}
   };}}}
 });
 assert.equal(response.status,200);
 assert.equal(response.headers.get('content-type'),'image/jpeg');
 assert.equal((await response.arrayBuffer()).byteLength,3);
});

test('media handler blocks non-image paths before touching bucket',async()=>{
 const {onRequestGet} = await import('../functions/media/[[all]].js');
 const response = await onRequestGet({
   request:new Request('https://nickckincaid.com/media/test/example.html'),
   env:{PHOTO_BUCKET:{async get(){throw Error('Unexpected R2 call');}}}
 });
 assert.equal(response.status,404);
});
