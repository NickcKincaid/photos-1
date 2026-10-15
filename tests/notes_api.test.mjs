import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost, onRequestDelete } from '../functions/api/admin/notes.js';

const encode = data => Buffer.from(JSON.stringify(data)).toString('base64');
const NAME = 'content/notes';
const SHA1 = 'a'.repeat(40), SHA2 = 'b'.repeat(40);
function githubMock(initial={}) {
  const original = globalThis.fetch;
  const db = new Map(Object.entries(initial).map(([key, value]) => [key, {note:value, sha:SHA1}]));
  const calls = [];
  globalThis.fetch = async (url,options={}) => {
    const method = options.method || 'GET';
    const parsed = new URL(url), path = decodeURIComponent(parsed.pathname);
    calls.push({path,method});
    const base = path.match(/\/contents\/content\/notes(?:\/(.+))?$/);
    if (!base) throw Error('Unexpected GitHub request: ' + path);
    if (!base[1]) return Response.json([...db.keys()].map(key => ({name:key+'.json',type:'file'})));
    const slug = base[1].replace(/\.json$/, '');
    if (method === 'GET') return db.has(slug)
      ? Response.json({type:'file',sha:db.get(slug).sha,content:encode(db.get(slug).note)})
      : Response.json({message:'Not Found'},{status:404});
    const input = JSON.parse(options.body);
    if (method === 'PUT') {
      if ((db.has(slug) && input.sha !== db.get(slug).sha) || (!db.has(slug) && input.sha))
        return Response.json({message:'conflict'},{status:409});
      const note = JSON.parse(Buffer.from(input.content,'base64').toString('utf8'));
      db.set(slug,{note,sha:SHA2});
      return Response.json({content:{sha:SHA2}});
    }
    if (method === 'DELETE') {
      if (!db.has(slug) || input.sha !== db.get(slug).sha)
        return Response.json({message:'conflict'},{status:409});
      db.delete(slug);
      return Response.json({commit:{sha:SHA2}});
    }
    throw Error('Unexpected method');
  };
  return {db,calls,restore(){globalThis.fetch=original;}};
}
const context = (method='GET', data) => ({request:new Request('https://nickckincaid.com/api/admin/notes',
  {method,...(data?{headers:{'content-type':'application/json'},body:JSON.stringify(data)}:{})}),env:{GITHUB_TOKEN:'test'}});

test('create a published note, store server timestamp and list it', async () => {
  const mock=githubMock();
  try {
    const res=await onRequestPost(context('POST',{slug:null,revision:null,title:'Morning / Street',body:'First line\n\nSecond',published:true}));
    assert.equal(res.status,200);
    const result=await res.json();
    assert.match(result.slug,/^morning-street-[a-f0-9]{8}$/);
    assert.equal(mock.db.get(result.slug).note.published,true);
    assert.match(mock.db.get(result.slug).note.published_at,/^\d{4}-\d{2}-\d{2}T/);
    const list=await onRequestGet(context());
    const data=await list.json();
    assert.equal(data.notes[0].title,'Morning / Street');
    assert.equal(data.notes[0].revision,SHA2);
  } finally {mock.restore();}
});

test('draft has no publication time and cannot be overwritten by stale tab', async () => {
  const mock=githubMock({draft:{title:'Draft',body:'Original',published:false,published_at:null}});
  try {
    const stale=await onRequestPost(context('POST',{slug:'draft',revision:SHA2,title:'Edited',body:'Oops',published:true}));
    assert.equal(stale.status,409);
    assert.equal(mock.db.get('draft').note.body,'Original');
    const edited=await onRequestPost(context('POST',{slug:'draft',revision:SHA1,title:'Edited',body:'Good text',published:false}));
    assert.equal(edited.status,200);
    assert.equal(mock.db.get('draft').note.published_at,null);
  } finally {mock.restore();}
});

test('delete requires current revision and matching confirmation',async () => {
  const mock=githubMock({test:{title:'A note',body:'Stuff',published:true,published_at:'2026-10-15T20:00:00Z'}});
  try {
    const wrong=await onRequestDelete(context('DELETE',{slug:'test',revision:SHA1,confirmTitle:'wrong'}));
    assert.equal(wrong.status,400);
    assert.equal(mock.db.size,1);
    const ok=await onRequestDelete(context('DELETE',{slug:'test',revision:SHA1,confirmTitle:'A note'}));
    assert.equal(ok.status,200);
    assert.equal(mock.db.size,0);
  } finally {mock.restore();}
});

test('limit note text and reject empty posts', async () => {
  const mock=githubMock();
  try {
    assert.equal((await onRequestPost(context('POST',{title:'',body:'Hello',published:true}))).status,400);
    assert.equal((await onRequestPost(context('POST',{title:'Hello',body:'x'.repeat(12001),published:true}))).status,400);
    assert.equal(mock.db.size,0);
  } finally {mock.restore();}
});


test('non-ASCII notes within character limit save without false request size failure',async () => {
  const mock=githubMock();
  try {
    const body='写真'.repeat(4200);
    const res=await onRequestPost(context('POST',{title:'Japanese note',body,published:false}));
    assert.equal(res.status,200);
    const data=await res.json();
    assert.equal(mock.db.get(data.slug).note.body,body);
  } finally {mock.restore();}
});
