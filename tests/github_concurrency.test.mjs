import test from 'node:test';
import assert from 'node:assert/strict';
import {gh, mapInBatches} from '../admin-lib/github.js';
import {onRequestGet as listProjects} from '../functions/api/admin/projects.js';
import {onRequestGet as listNotes} from '../functions/api/admin/notes.js';

const SHA='a'.repeat(40);
const enc=value=>Buffer.from(JSON.stringify(value)).toString('base64');
const context={env:{GITHUB_TOKEN:'test'},request:new Request('https://nickckincaid.com/api/admin/projects')};

test('batch helper never exceeds the specified concurrency',async()=>{
  let active=0,maxActive=0;
  const result=await mapInBatches(Array.from({length:23},(_,i)=>i),5,async i=>{
    active++;maxActive=Math.max(active,maxActive);
    await new Promise(resolve=>setTimeout(resolve,1));
    active--;return i*2;
  });
  assert.equal(maxActive,5);
  assert.deepEqual(result,Array.from({length:23},(_,i)=>i*2));
});

test('project and note listings limit simultaneous requests to GitHub',async()=>{
  const original=globalThis.fetch;
  let active=0,maxActive=0;
  globalThis.fetch=async (uri)=>{
    const path=new URL(uri).pathname;
    if(path.endsWith('/content/projects'))return Response.json(Array.from({length:19},(_,i)=>({type:'file',name:`project-${i}.json`})));
    if(path.endsWith('/content/notes'))return Response.json(Array.from({length:19},(_,i)=>({type:'file',name:`note-${i}.json`})));
    active++;maxActive=Math.max(maxActive,active);
    await new Promise(resolve=>setTimeout(resolve,1));
    active--;
    if(path.includes('/projects/'))return Response.json({sha:SHA,content:enc({title:'Project',published:true,order:1})});
    if(path.includes('/notes/'))return Response.json({sha:SHA,content:enc({title:'Note',body:'A note',published:true,published_at:'2026-10-15T20:00:00Z'})});
    return Response.json({message:'Not found'},{status:404});
  };
  try {
    const projects=await listProjects(context);assert.equal(projects.status,200);
    assert.equal((await projects.json()).projects.length,19);
    const notes=await listNotes(context);assert.equal(notes.status,200);
    assert.equal((await notes.json()).notes.length,19);
    assert.ok(maxActive<=6,`saw ${maxActive} in flight`);
  } finally {globalThis.fetch=original;}
});

test('GitHub outages report a retryable 503 instead of an input error',async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async()=>Response.json({message:'unavailable'},{status:503});
    await assert.rejects(gh(context,'/contents/content/projects'),e=>e.status===503 && /temporarily unavailable/.test(e.message));
    globalThis.fetch=async()=>{throw Error('offline');};
    await assert.rejects(gh(context,'/contents/content/projects'),e=>e.status===502 && /reach GitHub/.test(e.message));
  } finally {globalThis.fetch=original;}
});
