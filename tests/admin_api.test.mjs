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
 assert.match(result.path,/^\/media\/test\/[a-f0-9]{24}\/test-01\.jpg$/);
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
 const b=bucket(); const source='media/test/'+ 'a'.repeat(24)+'/test-01.jpg';
 b.saved.set(source,new Uint8Array([255,216,255]));
 const req = new Request('https://nickckincaid.com/api/admin/upload',{method:'POST',headers:{'content-type':'image/webp',
   'X-Photo-Project':'test','X-Photo-Variant':'640','X-Photo-Source':source},body:new Uint8Array(25)});
 const response=await upload({request:req,env:{PHOTO_BUCKET:b}});
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


test('two uploads in the same slot get clean names without overwriting each other',async()=>{
 const b=bucket();const bytes=new Uint8Array([255,216,255,224,0,2,255,217]);
 const results=[];
 for(let i=0;i<2;i++){
   const resp=await upload({request:photoRequest('image/jpeg',bytes),env:{PHOTO_BUCKET:b}});
   assert.equal(resp.status,200);results.push((await resp.json()).path);
 }
 assert.notEqual(results[0],results[1]);
 for(const path of results)assert.match(path,/^\/media\/test\/[a-f0-9]{24}\/test-01\.jpg$/);
 assert.equal(b.saved.size,2);
});

test('new-style thumbnails are accepted and stored alongside their original',async()=>{
 const b=bucket();const jpeg=new Uint8Array([255,216,255,224,0,2,255,217]);
 const resp=await upload({request:photoRequest('image/jpeg',jpeg),env:{PHOTO_BUCKET:b}});
 const original=(await resp.json()).path.slice(1);
 const webp=new Uint8Array([82,73,70,70,22,0,0,0,87,69,66,80,86,80,56,88,10,0,0,0,0,0,0,0,0,0,0,0,0,0]);
 const req=new Request('https://nickckincaid.com/api/admin/upload',{method:'POST',headers:{
   'content-type':'image/webp','X-Photo-Project':'test','X-Photo-Variant':'640',
   'X-Photo-Source':original},body:webp});
 const result=await upload({request:req,env:{PHOTO_BUCKET:b}});
 assert.equal(result.status,200);const parsed=await result.json();
 assert.equal(parsed.path,'/'+original.replace(/\.jpg$/,'-640.webp'));
});

test('saved project retains a validated homepage crop',async()=>{
 const gh=mockGithub();try{
   const req=new Request('https://nickckincaid.com/api/admin/save',{method:'POST',headers:{'content-type':'application/json'},
     body:JSON.stringify({slug:'tokyo',revision:SHA,title:'Tokyo',published:false,order:1,
       cover_position:{x:28,y:74},photos:[]})});
   const result=await save({request:req,env:{GITHUB_TOKEN:'test'}});
   assert.equal(result.status,200);
   const entry=gh.trees[0].tree.find(i=>i.path==='content/projects/tokyo.json');
   assert.deepEqual(JSON.parse(entry.content).cover_position,{x:28,y:74});
 }finally{gh.restore();}
});

test('unsafe crop values are rejected before GitHub writes',async()=>{
 for(const value of [{x:-1,y:50},{x:101,y:50},{x:'0; background:red',y:55},{x:50.5,y:50},null]){
   if(value===null)continue; // omitted crop is a backwards-compatible default.
   const gh=mockGithub();try{
     const req=new Request('https://nickckincaid.com/api/admin/save',{method:'POST',headers:{'content-type':'application/json'},
       body:JSON.stringify({slug:'tokyo',revision:SHA,title:'Tokyo',published:false,order:1,
         cover_position:value,photos:[]})});
     assert.equal((await save({request:req,env:{GITHUB_TOKEN:'test'}})).status,400);
     assert.equal(gh.trees.length,0);
   }finally{gh.restore();}
 }
});

test('old R2 keys download with clean basename without renaming stored objects',async()=>{
 const {onRequestGet}=await import('../functions/media/[[all]].js');
 const key='media/test/test-01-'+ 'c'.repeat(24)+'.jpg';
 const resp=await onRequestGet({request:new Request('https://nickckincaid.com/'+key),env:{PHOTO_BUCKET:{
   async get(k){assert.equal(k,key);return {body:new Response(new Uint8Array([255,216,255])).body,
    httpMetadata:{contentType:'image/jpeg'}};}
 }}});
 assert.equal(resp.headers.get('content-disposition'),'inline; filename="test-01.jpg"');
});

test('project save accepts new clean-name R2 original and thumbnail paths',async()=>{
 const gh=mockGithub();try{
   const uuid='7'.repeat(24);
   const path=`/media/tokyo/${uuid}/tokyo-01.jpg`;
   const variant=`/media/tokyo/${uuid}/tokyo-01-640.webp`;
   const req=new Request('https://nickckincaid.com/api/admin/save',{method:'POST',headers:{'content-type':'application/json'},
     body:JSON.stringify({slug:'tokyo',revision:SHA,title:'Tokyo',published:true,order:1,
       cover_position:{x:73,y:12},photos:[{kind:'r2',path,meta:{focal_length:'35 mm',aperture:'f/8',shutter_speed:'1/125 s',iso:'100',storage:'r2'},variants:[{url:variant,width:640}]}]})});
   const resp=await save({request:req,env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:{async head(key){return {size:10}}}}});
   assert.equal(resp.status,200,await resp.clone().text());
   const entry=gh.trees[0].tree.find(t=>t.path==='content/projects/tokyo.json');
   const project=JSON.parse(entry.content);
   assert.equal(project.cover,path);
   assert.deepEqual(project.photo_details[0].variants,[{url:variant,width:640}]);
   assert.deepEqual(project.cover_position,{x:73,y:12});
 }finally{gh.restore();}
});

const EXPOSURE = {focal_length:'35 mm',aperture:'f/8',shutter_speed:'1/250 s',iso:'400'};
function requestWithPhoto(meta, published=false, kind='r2') {
 const path='/media/tokyo/'+'7'.repeat(24)+'/tokyo-01.jpg';
 const photo=kind==='r2' ? {kind,path,meta} : {kind:'existing',path,meta};
 return new Request('https://nickckincaid.com/api/admin/save', {
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({slug:'tokyo',revision:SHA,title:'Tokyo',order:1,published,photos:[photo]})
 });
}

test('saving a project or draft requires every exposure field; whitespace is not enough',async()=>{
 for(const published of [false,true]) {
   for(const field of Object.keys(EXPOSURE)) {
     for(const missing of [undefined, '  ']) {
       const gh=mockGithub();let headCalls=0;
       try {
         const meta={...EXPOSURE};
         if(missing===undefined) delete meta[field]; else meta[field]=missing;
         const resp=await save({request:requestWithPhoto(meta,published),env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:{async head(){headCalls++;return {};}}}});
         assert.equal(resp.status,400);
         assert.match((await resp.json()).error,/Photo 1:.*required before saving/);
         assert.equal(gh.trees.length,0);
         assert.equal(headCalls,0,'Reject missing EXIF before touching R2');
       }finally{gh.restore();}
     }
   }
 }
});

test('complete exposure fields save successfully and check each R2 original once',async()=>{
 const gh=mockGithub();let headCalls=0;
 try {
   const res=await save({request:requestWithPhoto(EXPOSURE,true),env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:{async head(){headCalls++;return {size:512}}}}});
   assert.equal(res.status,200,await res.clone().text());
   assert.equal(headCalls,1,'Only one HEAD request should be needed per uploaded photo');
   const doc=gh.trees[0].tree.find(e=>e.path==='content/projects/tokyo.json');
   const saved=JSON.parse(doc.content);
   assert.deepEqual(Object.fromEntries(Object.keys(EXPOSURE).map(k=>[k,saved.photo_details[0][k]])),
     {focal_length:'35mm',aperture:'f/8',shutter_speed:'1/250s',iso:'ISO 400'});
 }finally{gh.restore();}
});

test('existing photograph missing exposure settings must be completed on next save',async()=>{
 const old='/media/tokyo/'+'7'.repeat(24)+'/tokyo-01.jpg';
 const gh=mockGithub({title:'Tokyo',published:true,order:1,cover:old,gallery:[],photo_details:[{image:old,storage:'r2',...EXPOSURE}]});
 try {
   const meta={...EXPOSURE,shutter_speed:''};
   const resp=await save({request:requestWithPhoto(meta,false,'existing'),env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:{async head(){return {size:512}}}}});
   assert.equal(resp.status,400);
   assert.match((await resp.json()).error,/Shutter speed/);
   assert.equal(gh.trees.length,0);
 }finally{gh.restore();}
});


test('API normalizes abbreviated exposure values and rejects invalid input before any R2 activity',async()=>{
 const gh=mockGithub();let headCalls=0;
 try {
   const meta={focal_length:'50',aperture:'f8',shutter_speed:'1/125',iso:'iso200'};
   const good=await save({request:requestWithPhoto(meta,true),env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:{async head(){headCalls++;return {size:5}}}}});
   assert.equal(good.status,200,await good.clone().text());
   const doc=gh.trees.at(-1).tree.find(x=>x.path==='content/projects/tokyo.json');
   const exposure=JSON.parse(doc.content).photo_details[0];
   assert.equal(exposure.focal_length,'50mm');
   assert.equal(exposure.aperture,'f/8');
   assert.equal(exposure.shutter_speed,'1/125s');
   assert.equal(exposure.iso,'ISO 200');
   assert.equal(headCalls,1);
 } finally {gh.restore();}
 for(const meta of [{...EXPOSURE,aperture:'f/0'},{...EXPOSURE,iso:'ISO nope'},{...EXPOSURE,shutter_speed:'1/0'}]) {
   const gh=mockGithub();let headCalls=0;
   try {
     const response=await save({request:requestWithPhoto(meta),env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:{async head(){headCalls++;return {};}}}});
     assert.equal(response.status,400);
     assert.equal(gh.trees.length,0);
     assert.equal(headCalls,0);
   } finally {gh.restore();}
 }
});


test('R2 refuses truncated JPEG and inconsistent WebP sizes before writing',async()=>{
 const b=bucket();
 const short=new Uint8Array([255,216,255]);
 const a=await upload({request:photoRequest('image/jpeg',short),env:{PHOTO_BUCKET:b}});
 assert.equal(a.status,415);
 assert.equal(b.saved.size,0);
 const source='media/test/'+'c'.repeat(24)+'/test-01.jpg';
 b.saved.set(source,new Uint8Array([255,216,255,224,0,2,255,217]));
 const webp=new Uint8Array([82,73,70,70,80,0,0,0,87,69,66,80,86,80,56,88,2,0,0,0,0,0]);
 const req=new Request('https://nickckincaid.com/api/admin/upload',{method:'POST',headers:{
   'content-type':'image/webp','X-Photo-Project':'test','X-Photo-Variant':'640','X-Photo-Source':source},body:webp});
 const response=await upload({request:req,env:{PHOTO_BUCKET:b}});
 assert.equal(response.status,415);
 assert.equal(b.saved.size,1);
});

test('already-published R2 images do not require redundant HEAD requests when editing captions',async()=>{
 const path='/media/tokyo/'+'7'.repeat(24)+'/tokyo-01.jpg';
 const previous={title:'Tokyo',published:true,order:1,cover:path,gallery:[],
   photo_details:[{image:path,storage:'r2',...EXPOSURE}]};
 const gh=mockGithub(previous);let headCalls=0;
 try {
   const response=await save({request:requestWithPhoto({...EXPOSURE,alt:'Updated caption'},true,'existing'),
     env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:{async head(){headCalls++;return {size:256}}}}});
   assert.equal(response.status,200,await response.clone().text());
   assert.equal(headCalls,0);
   const doc=gh.trees[0].tree.find(x=>x.path==='content/projects/tokyo.json');
   assert.equal(JSON.parse(doc.content).photo_details[0].alt,'Updated caption');
 }finally{gh.restore();}
});

test('R2 handler returns 304 from metadata without fetching the full image',async()=>{
 const {onRequestGet}=await import('../functions/media/[[all]].js');
 const path='media/cdmx/example.jpg';let heads=0,gets=0;
 const b={async head(){heads++;return {etag:'abc123',size:12345}},async get(){gets++;throw Error('R2 should not fetch full image on ETag match');}};
 const response=await onRequestGet({request:new Request('https://nickckincaid.com/'+path,{headers:{'If-None-Match':'W/"abc123"'}}),env:{PHOTO_BUCKET:b}});
 assert.equal(response.status,304);
 assert.equal(heads,1);assert.equal(gets,0);
 assert.equal(response.headers.get('etag'),'"abc123"');
});

test('R2 download requests ignore conditional image cache and preserve attachment',async()=>{
 const {onRequestGet}=await import('../functions/media/[[all]].js');let gets=0,heads=0;
 const b={async head(){heads++;return {etag:'abc123'}},async get(){gets++;return {
  etag:'abc123',body:new Response('image').body,httpMetadata:{contentType:'image/jpeg'}};}};
 const url='https://nickckincaid.com/media/cdmx/example.jpg?download=cdmx-01.jpg';
 const response=await onRequestGet({request:new Request(url,{headers:{'If-None-Match':'"abc123"'}}),env:{PHOTO_BUCKET:b}});
 assert.equal(response.status,200);assert.equal(gets,1);assert.equal(heads,0);
 assert.match(response.headers.get('content-disposition'),/attachment/);
});
