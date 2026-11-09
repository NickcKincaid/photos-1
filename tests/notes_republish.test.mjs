import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestPost} from '../functions/api/admin/notes.js';

const SHA='a'.repeat(40);
const firstPublished='2026-10-12T10:15:00.000Z';

test('republishing preserves the original first-published timestamp',async()=>{
  const originalFetch=globalThis.fetch;
  let record={title:'A note',body:'The text',published:false,
    created_at:'2026-10-01T09:00:00.000Z',published_at:firstPublished,date_mode:'published'};
  globalThis.fetch=async (url, options={})=>{
    if((options.method||'GET')==='GET')return Response.json({sha:SHA,content:Buffer.from(JSON.stringify(record)).toString('base64')});
    const body=JSON.parse(options.body);
    record=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));
    return Response.json({content:{sha:'b'.repeat(40)}});
  };
  try {
    const request=new Request('https://nickckincaid.com/api/admin/notes',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        slug:'a-note-12345678',revision:SHA,title:'A note',body:'Updated text',
        published:true,date_mode:'published'
      })});
    const res=await onRequestPost({request,env:{GITHUB_TOKEN:'test'}});
    assert.equal(res.status,200);
    assert.equal(record.published,true);
    assert.equal(record.published_at,firstPublished);
  } finally {globalThis.fetch=originalFetch;}
});
