import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = globalThis;
await import('../static/admin-exposure.js');
await import('../static/admin-tools.js');
const tools=window.PortfolioTools;
const path=n=>`/media/cdmx/${'a'.repeat(24)}/cdmx-0${n}.jpg`;
test('project completeness counts all four fields on each referenced photo',()=>{
  const photos=[path(1),path(2)];
  assert.deepEqual(tools.metadataReport({cover:photos[0],gallery:[photos[1]],photo_details:[
    {image:photos[0],focal_length:'35 mm',aperture:'f/5.6',shutter_speed:'1/250 s',iso:'400'},
    {image:photos[1],focal_length:'50 mm',aperture:'',shutter_speed:'1/80 s',iso:'200'}
  ]}),{total:2,missing:1});
  assert.deepEqual(tools.metadataReport({cover:'',gallery:[],photo_details:[]}),{total:0,missing:0});
});
test('bulk ordering preserves relative order of selected and unselected photos',()=>{
  const photos=[1,2,3,4].map(n=>({path:path(n)}));
  const selected=new Set([path(2),path(4)]);
  assert.deepEqual(tools.reorderedPhotos(photos,selected,'first').map(p=>p.path),[path(2),path(4),path(1),path(3)]);
  assert.deepEqual(tools.reorderedPhotos(photos,selected,'last').map(p=>p.path),[path(1),path(3),path(2),path(4)]);
  assert.deepEqual(photos.map(p=>p.path),[path(1),path(2),path(3),path(4)]);
});
test('image checker includes persisted thumbnails and never accepts traversal paths',()=>{
  const assets=tools.imageLinks([
    {path:path(1),meta:{variants:[{url:path(1).replace('.jpg','-640.webp'),width:640}]}},
    {path:'/media/../internal.jpg'}
  ]);
  assert.equal(assets.length,2);
  assert.equal(assets[1].variant,'640px thumbnail');
  assert.equal(assets[0].path,path(1));
});
test('integrity checking limits concurrent HEAD requests to four and reports errors',async()=>{
  const assets=Array.from({length:12},(_,i)=>({path:path(1)+'?test='+i,number:i+1,variant:'Original'}));
  let active=0,maximum=0,finished=0;
  const results=await tools.checkImages(assets,{
    fetcher:async(path,options)=>{
      assert.equal(options.method,'HEAD');
      active++;maximum=Math.max(maximum,active);
      await new Promise(resolve=>setTimeout(resolve,4));
      active--;
      if(path.endsWith('=4'))throw Error('disconnected');
      return {ok:!path.endsWith('=5'),status:path.endsWith('=5')?404:200};
    },onProgress:n=>{finished=n;}
  });
  assert.ok(maximum<=4);
  assert.equal(results.length,12);assert.equal(finished,12);
  assert.equal(results.filter(r=>!r.ok).length,2);
});

test('completeness checker flags invalid nonempty camera values',()=>{
 const p=path(1);
 assert.deepEqual(tools.metadataReport({cover:p,gallery:[],photo_details:[{
  image:p,focal_length:'35mm',aperture:'f0',shutter_speed:'1/250s',iso:'ISO 400'
 }]}),{total:1,missing:1});
});
