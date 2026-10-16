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
 const webp=new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80,0,0]);
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
       cover_position:{x:73,y:12},photos:[{kind:'r2',path,meta:{iso:'100',storage:'r2'},variants:[{url:variant,width:640}]}]})});
   const resp=await save({request:req,env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:{async head(key){return {size:10}}}}});
   assert.equal(resp.status,200,await resp.clone().text());
   const entry=gh.trees[0].tree.find(t=>t.path==='content/projects/tokyo.json');
   const project=JSON.parse(entry.content);
   assert.equal(project.cover,path);
   assert.deepEqual(project.photo_details[0].variants,[{url:variant,width:640}]);
   assert.deepEqual(project.cover_position,{x:73,y:12});
 }finally{gh.restore();}
});
