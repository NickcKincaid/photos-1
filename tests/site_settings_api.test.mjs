import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet, onRequestPost} from '../functions/api/admin/site-settings.js';

const SHA1='a'.repeat(40), SHA2='b'.repeat(40);
function withFakeGitHub(initial, task) {
  const old=globalThis.fetch;
  let data=structuredClone(initial), sha=SHA1, writes=0;
  globalThis.fetch=async (uri, options={})=>{
    const method=options.method||'GET';
    assert.match(String(uri),/\/contents\/content\/site\.json/);
    if(method==='GET')return Response.json({content:Buffer.from(JSON.stringify(data)).toString('base64'),sha});
    assert.equal(method,'PUT');
    const body=JSON.parse(options.body);
    if(body.sha!==sha)return Response.json({message:'Conflict'},{status:409});
    data=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));
    sha=SHA2;writes++;
    return Response.json({content:{sha}});
  };
  return Promise.resolve().then(()=>task({getData:()=>data,getWrites:()=>writes})).finally(()=>{globalThis.fetch=old;});
}
const ctx=(method='GET', input)=>({env:{GITHUB_TOKEN:'unused-in-tests'},request:new Request('https://nickckincaid.com/api/admin/site-settings',{
  method,...(input!==undefined?{headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{})
})});

test('Notes tab defaults to visible without mutating existing site metadata', async()=>{
  await withFakeGitHub({name:'Nicholas Kincaid',image_license_url:'https://example.com/license'},async db=>{
    const res=await onRequestGet(ctx());assert.equal(res.status,200);
    assert.deepEqual(await res.json(),{show_notes_tab:true,revision:SHA1});
    assert.equal(db.getWrites(),0);
  });
});

test('Hide Notes link preserves unrelated site settings and does not delete Notes',async()=>{
  await withFakeGitHub({name:'Nicholas Kincaid',intro:'Photography',image_license_url:'https://example.com/license'},async db=>{
    const res=await onRequestPost(ctx('POST',{revision:SHA1,show_notes_tab:false}));
    assert.equal(res.status,200);assert.equal(db.getWrites(),1);
    assert.deepEqual(db.getData(),{name:'Nicholas Kincaid',intro:'Photography',image_license_url:'https://example.com/license',show_notes_tab:false});
    assert.equal((await onRequestGet(ctx())).status,200);
    const ok=await onRequestPost(ctx('POST',{revision:SHA2,show_notes_tab:true}));
    assert.equal(ok.status,200);
    assert.equal(db.getData().show_notes_tab,true);
  });
});

test('Reject stale revision, invalid input and unrelated setting updates',async()=>{
  await withFakeGitHub({name:'Nicholas Kincaid'},async db=>{
    for(const input of [
      {revision:SHA2,show_notes_tab:false},
      {revision:SHA1,show_notes_tab:'false'},
      {revision:SHA1,show_notes_tab:false,name:'Overwrite'},
      {revision:SHA1,show_notes_tab:0},
      {revision:SHA1,show_notes_tab:false,extra:{huge:'x'.repeat(5000)}}
    ]) {
      const res=await onRequestPost(ctx('POST',input));
      assert.ok(res.status>=400);
    }
    assert.equal(db.getWrites(),0);
  });
});

test('No-op setting avoids creating needless GitHub commits',async()=>{
  await withFakeGitHub({name:'Nicholas Kincaid'},async db=>{
    const res=await onRequestPost(ctx('POST',{revision:SHA1,show_notes_tab:true}));
    assert.equal(res.status,200);assert.equal((await res.json()).unchanged,true);
    assert.equal(db.getWrites(),0);
  });
});
