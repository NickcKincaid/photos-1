import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet as backup} from '../functions/api/admin/backup.js';

const sha1='a'.repeat(40),sha2='b'.repeat(40);
const wrap=value=>({type:'file',content:Buffer.from(JSON.stringify(value)).toString('base64')});

test('backup uses one immutable commit, even when main advances during export',async()=>{
  const previous=globalThis.fetch;
  const requested=[];
  let mainAdvanced=false;
  globalThis.fetch=async url=>{
    const u=new URL(url),p=u.pathname.replace(/^\/repos\/[^/]+\/[^/]+/,'');
    if(p==='/git/ref/heads/main')return Response.json({object:{sha:sha1}});
    requested.push(u.searchParams.get('ref'));
    if(u.searchParams.get('ref')!==sha1)throw Error('Requested moving or wrong Git revision');
    if(p==='/contents/content/site.json'){mainAdvanced=true;return Response.json(wrap({name:'Nicholas Kincaid'}));}
    if(p==='/contents/content/projects')return Response.json([{type:'file',name:'cdmx.json'}]);
    if(p==='/contents/content/projects/cdmx.json')return Response.json(wrap({title:'CDMX',published:true}));
    if(p==='/contents/content/notes')return Response.json([{type:'file',name:'entry.json'}]);
    if(p==='/contents/content/notes/entry.json')return Response.json(wrap({title:'Entry',published:true}));
    throw Error('Unexpected GitHub route '+p);
  };
  try {
    const response=await backup({env:{GITHUB_TOKEN:'test'}});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.sourceCommit,sha1);
    assert.equal(body.projects['cdmx.json'].title,'CDMX');
    assert.equal(body.notes['entry.json'].title,'Entry');
    assert.equal(mainAdvanced,true);
    assert.equal(requested.length,5);
    assert(requested.every(ref=>ref===sha1));
  }finally{globalThis.fetch=previous;}
});

test('backup refuses to download inconsistent snapshot when no immutable commit exists',async()=>{
  const previous=globalThis.fetch;
  const routes=[];
  globalThis.fetch=async url=>{
    routes.push(String(url));
    return Response.json({object:{sha:sha2.slice(1)}});
  };
  try {
    const response=await backup({env:{GITHUB_TOKEN:'test'}});
    assert.notEqual(response.status,200);
    assert.match((await response.json()).error,/stable GitHub backup revision/);
    assert.equal(routes.length,1);
  }finally{globalThis.fetch=previous;}
});
