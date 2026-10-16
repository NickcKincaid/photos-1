import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {onRequestPost as standardize} from '../functions/api/admin/standardize.js';
import {onRequestPost as saveProject} from '../functions/api/admin/save.js';

const slug = 'handmade-watusi-horn-table';
const hash = '00232f36de234e2c905d50cb';
const original = `/media/${slug}/${slug}-01-${hash}.jpg`;
const newName = `/media/${slug}/${hash}/${slug}-01.jpg`;
const oldThumb = original.slice(0,-4) + '-640.webp';
const newThumb = newName.slice(0,-4) + '-640.webp';
const SHA='a'.repeat(40), HEAD='b'.repeat(40), TREE='c'.repeat(40);
const initial = {
  title: 'Handmade Watusi Horn Table', published: true, order:1,
  cover: original, gallery:[],photo_details:[{
    image:original,id:'e'.repeat(24),storage:'r2',
    iso:'220',focal_length:'120 mm',
    variants:[{url:oldThumb,width:640}]
  }],
};

function mockBucket() {
  const objects = new Map();
  function putSource(key, body, type){
    const value=Uint8Array.from(body),etag=createHash('md5').update(value).digest('hex');
    objects.set(key,{body:value,etag,httpMetadata:{contentType:type},customMetadata:{copyright:'Nicholas Kincaid'}});
  }
  putSource(original.slice(1), [255,216,255,0,217],'image/jpeg');
  putSource(oldThumb.slice(1), [82,73,70,70,0,0,0,0,87,69,66,80],'image/webp');
  const metadata = key => {
    const o=objects.get(key);
    return o?{size:o.body.length,etag:o.etag,httpMetadata:o.httpMetadata,customMetadata:o.customMetadata}:null;
  };
  return {objects,
    async head(key){return metadata(key);},
    async get(key){const o=objects.get(key);return o?{...metadata(key),async arrayBuffer(){return Uint8Array.from(o.body).buffer;}}:null;},
    async put(key,raw,{httpMetadata,customMetadata}){
      const body=Uint8Array.from(new Uint8Array(raw));
      objects.set(key,{body,etag:createHash('md5').update(body).digest('hex'),httpMetadata,customMetadata});
      return metadata(key);
    }
  };
}
function mockGitHub(document = initial) {
  const writes = [];
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts={}) => {
    const p=new URL(url).pathname;
    const respond = (json,status=200) => new Response(JSON.stringify(json),{status,headers:{'content-type':'application/json'}});
    if(p.endsWith('/contents/content/projects')) return respond([{type:'file',name:slug+'.json'}]);
    if(p.endsWith(`/contents/content/projects/${slug}.json`))
      return respond({sha:SHA,content:Buffer.from(JSON.stringify(document)).toString('base64')});
    if(p.endsWith('/git/ref/heads/main')) return respond({object:{sha:HEAD}});
    if(p.endsWith('/git/commits/'+HEAD)) return respond({tree:{sha:TREE}});
    if(p.endsWith('/git/trees')) { writes.push(JSON.parse(opts.body));return respond({sha:TREE}); }
    if(p.endsWith('/git/commits')) return respond({sha:HEAD});
    if(p.endsWith('/git/refs/heads/main')) return respond({object:{sha:HEAD}});
    throw Error('Unexpected GitHub operation '+p);
  };
  return {writes, restore(){globalThis.fetch=savedFetch;}};
}
function req(action,data={}) {
  return new Request('https://nickckincaid.com/api/admin/standardize',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({action,slug,revision:SHA,...data})
  });
}

test('prepares legacy photo and variant with clean names without deleting originals',async()=>{
  const r2=mockBucket(), gh=mockGitHub();
  try {
    const response=await standardize({request:req('prepare',{oldPath:original}),env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:r2}});
    assert.equal(response.status,200,await response.clone().text());
    const data=await response.json();
    assert.equal(data.newPath,newName);
    assert.deepEqual(data.variants,[{url:newThumb,width:640}]);
    assert.ok(r2.objects.has(original.slice(1)));
    assert.ok(r2.objects.has(newName.slice(1)));
    assert.equal(r2.objects.get(newName.slice(1)).customMetadata.migrationSource,original.slice(1));
    assert.equal(gh.writes.length,0);
  } finally {gh.restore();}
});

test('commit changes all references in one GitHub tree while preserving permanent photo ID and EXIF',async()=>{
  const r2=mockBucket(), gh=mockGitHub();
  try {
    const first=await standardize({request:req('prepare',{oldPath:original}),env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:r2}});
    const mapping=await first.json();
    const response=await standardize({request:req('commit',{mappings:[mapping]}),env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:r2}});
    assert.equal(response.status,200,await response.clone().text());
    assert.equal((await response.json()).oldCopiesRetained,true);
    assert.equal(gh.writes.length,1);
    const entry=gh.writes[0].tree.find(x=>x.path===`content/projects/${slug}.json`);
    const doc=JSON.parse(entry.content);
    assert.equal(doc.cover,newName);
    assert.equal(doc.photo_details[0].image,newName);
    assert.equal(doc.photo_details[0].id,'e'.repeat(24));
    assert.equal(doc.photo_details[0].iso,'220');
    assert.deepEqual(doc.photo_details[0].variants,[{url:newThumb,width:640}]);
    assert.ok(r2.objects.has(original.slice(1)));
    assert.ok(r2.objects.has(oldThumb.slice(1)));
  } finally {gh.restore();}
});

test('stale revisions refuse to copy or commit',async()=>{
  const r2=mockBucket(),gh=mockGitHub();
  try {
    const response=await standardize({request:new Request('https://nickckincaid.com/api/admin/standardize',{method:'POST',body:JSON.stringify({action:'prepare',slug,oldPath:original,revision:'f'.repeat(40)})}),env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:r2}});
    assert.equal(response.status,409);
    assert.equal(r2.objects.size,2);
    assert.equal(gh.writes.length,0);
  } finally {gh.restore();}
});

test('partial copy or incorrect mapping cannot update project JSON',async()=>{
  const r2=mockBucket(),gh=mockGitHub();
  try {
    for(const mapping of [{oldPath:original,newPath:newName,variants:[]},
      {oldPath:original,newPath:`/media/${slug}/bad/${slug}-01.jpg`,variants:[]}]) {
      const response=await standardize({request:req('commit',{mappings:[mapping]}),env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:r2}});
      assert.equal(response.status,400);
    }
    assert.equal(gh.writes.length,0);
  } finally {gh.restore();}
});

test('preparing twice safely reuses verified copies',async()=>{
  const r2=mockBucket(),gh=mockGitHub();
  try {
    for(let i=0;i<2;i++) {
      const response=await standardize({request:req('prepare',{oldPath:original}),env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:r2}});
      assert.equal(response.status,200,await response.clone().text());
    }
    assert.equal(r2.objects.size,4);
  } finally {gh.restore();}
});

test('migration rejects a photo not belonging to the selected project',async()=>{
  const r2=mockBucket(),gh=mockGitHub();
  try {
    const response=await standardize({request:req('prepare',{oldPath:'/media/other/other-01-'+hash+'.jpg'}),env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:r2}});
    assert.equal(response.status,400);
    assert.equal(gh.writes.length,0);
  } finally {gh.restore();}
});


test('removing a newer folder-based R2 photograph cleans up its thumbnails too', async()=>{
  const doc={...initial, cover:newName, photo_details:[{
    image:newName, storage:'r2', id:'e'.repeat(24), variants:[{url:newThumb,width:640}]
  }]};
  const gh=mockGitHub(doc);
  let removed=[];
  try {
    const response=await saveProject({
      request:new Request('https://nickckincaid.com/api/admin/save', {method:'POST',
        headers:{'content-type':'application/json'},body:JSON.stringify({
          slug,revision:SHA,title:doc.title,published:false,order:1,photos:[]
        })}),
      env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:{async delete(keys){removed=keys;}}}
    });
    assert.equal(response.status,200,await response.clone().text());
    assert.deepEqual(new Set(removed),new Set([newName.slice(1),newThumb.slice(1)]));
  } finally {gh.restore();}
});
