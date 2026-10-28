import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet as getStorage} from '../functions/api/admin/storage.js';
import {onRequestPost as saveProject} from '../functions/api/admin/save.js';

const SHA='a'.repeat(40);
const IMAGE='/media/tokyo/'+'a'.repeat(24)+'/tokyo-01.jpg';
const META={focal_length:'35mm',aperture:'f/8',shutter_speed:'1/250s',iso:'400',storage:'r2'};

test('storage counts actual photos separately from generated sharing cards',async()=>{
  const objects=[
    {key:'media/tokyo/'+ 'a'.repeat(24) +'/tokyo-01.jpg',size:2e6},
    {key:'media/tokyo/'+ 'a'.repeat(24) +'/tokyo-01-640.webp',size:5e4},
    {key:'media/tokyo/'+ 'b'.repeat(24) +'/sharing-1200x630.jpg',size:1e5}
  ];
  const resp=await getStorage({env:{PHOTO_BUCKET:{async list(){return {objects,truncated:false};}}}});
  assert.equal(resp.status,200);
  const summary=await resp.json();
  assert.equal(summary.objects,3);
  assert.equal(summary.photographs,1,'share cards are images but not gallery photographs');
  assert.equal(summary.bytes,2150000);
});

test('saving rejects duplicates spanning existing and R2 photo types',async()=>{
  const prev={title:'Tokyo',cover:IMAGE,gallery:[],published:true,photo_details:[{image:IMAGE,storage:'r2',...META}],order:1};
  const oldFetch=globalThis.fetch;
  let wrote=false;
  globalThis.fetch=async (url)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/content/projects/tokyo.json'))return Response.json({type:'file',sha:SHA,content:Buffer.from(JSON.stringify(prev)).toString('base64')});
    wrote=true; throw Error('Unexpected GitHub write');
  };
  try {
    const request=new Request('https://nickckincaid.com/api/admin/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({slug:'tokyo',revision:SHA,title:'Tokyo',order:1,published:true,photos:[
      {kind:'existing',path:IMAGE,meta:META},
      {kind:'r2',path:IMAGE,meta:META}
    ]})});
    const resp=await saveProject({request,env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:{async head(){return {size:200000}}}}});
    assert.equal(resp.status,400);
    assert.match((await resp.json()).error,/duplicate|already included/i);
    assert.equal(wrote,false);
  } finally {globalThis.fetch=oldFetch;}
});

test('OAuth fetch deadline aborts stalled external requests',async()=>{
  const {fetchWithDeadline}=await import('../admin-lib/session.js');
  const oldFetch=globalThis.fetch;
  let signalSeen=false;
  globalThis.fetch=async (_url,options)=>new Promise((_resolve,reject)=>{
    signalSeen=Boolean(options?.signal);
    options.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
  });
  try {
    await assert.rejects(fetchWithDeadline('https://github.com/',{},15),error=>error.status===504);
    assert.equal(signalSeen,true);
  } finally {globalThis.fetch=oldFetch;}
});
