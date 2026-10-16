import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet as storage} from '../functions/api/admin/storage.js';
import {onRequestGet as backup} from '../functions/api/admin/backup.js';

test('storage counts original photographs and optimized variants without exposing keys', async()=>{
  const pages=[
    {objects:[{key:'media/a/a-01.jpg',size:2000000},{key:'media/a/a-01-640.webp',size:90000}],truncated:true,cursor:'page2'},
    {objects:[{key:'media/a/a-02.jpg',size:3000000}],truncated:false}
  ];
  const cursors=[];
  const response=await storage({env:{PHOTO_BUCKET:{async list(opts){cursors.push(opts.cursor||'');return pages[cursors.length-1];}}}});
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.objects,3);
  assert.equal(result.photographs,2);
  assert.equal(result.bytes,5090000);
  assert.equal(result.incomplete,false);
  assert.deepEqual(cursors,['','page2']);
  assert.doesNotMatch(JSON.stringify(result),/media\/a\/a-01/);
});

test('storage gives an actionable error when R2 is not configured',async()=>{
  const response=await storage({env:{}});
  assert.equal(response.status,503);
  assert.match((await response.json()).error,/PHOTO_BUCKET/);
});

test('metadata export includes site projects and notes but not credentials',async()=>{
  const original=globalThis.fetch;
  const data={
    '/contents/content/site.json':{content:Buffer.from(JSON.stringify({name:'Nicholas Kincaid'})).toString('base64')},
    '/contents/content/projects':[{type:'file',name:'sample.json'}],
    '/contents/content/projects/sample.json':{content:Buffer.from(JSON.stringify({title:'Sample',published:true})).toString('base64')},
    '/contents/content/notes':[{type:'file',name:'entry.json'}],
    '/contents/content/notes/entry.json':{content:Buffer.from(JSON.stringify({title:'Note',published:false})).toString('base64')}
  };
  globalThis.fetch=async url=>{
    const path=new URL(url).pathname.replace(/^\/repos\/[^/]+\/[^/]+/,'').replace(/\?ref=main$/,'');
    const value=data[path];if(!value)throw Error('Unexpected mock URL '+path);
    return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
  };
  try {
    const response=await backup({env:{GITHUB_TOKEN:'test-secret'}});
    assert.equal(response.status,200);
    const content=await response.text();
    assert.doesNotMatch(content,/test-secret/);
    const snapshot=JSON.parse(content);
    assert.equal(snapshot.site.name,'Nicholas Kincaid');
    assert.equal(snapshot.projects['sample.json'].title,'Sample');
    assert.equal(snapshot.notes['entry.json'].published,false);
    assert.match(snapshot.warning,/NOT included/);
  }finally{globalThis.fetch=original;}
});
