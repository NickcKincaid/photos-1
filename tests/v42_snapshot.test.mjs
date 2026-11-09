import test from 'node:test';
import assert from 'node:assert/strict';
import {assertProjectSnapshot} from '../admin-lib/github.js';
import {onRequestPost as save} from '../functions/api/admin/save.js';
import {onRequestPost as deleteProject} from '../functions/api/admin/delete.js';
import {onRequestPost as reorder} from '../functions/api/admin/reorder.js';

const OLD = 'a'.repeat(40), NEW = 'b'.repeat(40), HEAD = 'c'.repeat(40);
const encode = obj => Buffer.from(JSON.stringify(obj)).toString('base64');
const project = {title:'Tokyo', published:false, order:1, cover:'', gallery:[], photo_details:[]};
const response = (data,status=200) => Response.json(data,{status});
const body = data => new Request('https://nickckincaid.com/api/admin/example',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)
});
function mocked(handler) {
  const previous = globalThis.fetch;
  const writes=[];
  globalThis.fetch = (url,opt={}) => {
    const parsed = new URL(url);
    const method = opt.method||'GET';
    if(method!=='GET') writes.push(parsed.pathname);
    return handler(parsed.pathname,parsed.searchParams,method,opt);
  };
  return {writes,reset(){globalThis.fetch=previous;}};
}

test('pinned project tree accepts a consistent snapshot and rejects stale or additional projects',()=>{
  const tree={truncated:false,tree:[{type:'blob',path:'content/projects/tokyo.json',sha:OLD}]};
  assert.equal(assertProjectSnapshot(tree,{tokyo:OLD},true),true);
  assert.throws(()=>assertProjectSnapshot(tree,{tokyo:NEW},true),{status:409});
  assert.throws(()=>assertProjectSnapshot(tree,{tokyo:OLD,cdmx:OLD},true),{status:409});
  assert.throws(()=>assertProjectSnapshot({truncated:true,tree:[]},{tokyo:OLD},true),{status:503});
});

test('project save refuses a stale snapshot even if the first revision check passed',async()=>{
  const gh=mocked((path,search,method)=>{
    if(path.endsWith('/contents/content/projects/tokyo.json'))
      return response({sha:search.get('ref')===HEAD?NEW:OLD,content:encode(project)});
    if(path.endsWith('/git/ref/heads/main'))return response({object:{sha:HEAD}});
    if(path.endsWith('/git/commits/'+HEAD))return response({tree:{sha:OLD}});
    throw Error('Unexpected GitHub access: '+path);
  });
  try {
    const result = await save({request:body({slug:'tokyo',revision:OLD,title:'Tokyo',published:false,order:1,photos:[]}),env:{GITHUB_TOKEN:'test'}});
    assert.equal(result.status,409);
    assert.deepEqual(gh.writes,[]);
  } finally {gh.reset();}
});

test('project deletion aborts before Git writes or R2 cleanup when another editor saved',async()=>{
  const gh=mocked((path,search,method)=>{
    if(path.endsWith('/contents/content/projects/tokyo.json'))return response({sha:OLD,content:encode(project)});
    if(path.endsWith('/contents/content/projects'))return response([{type:'file',name:'tokyo.json',sha:OLD}]);
    if(path.endsWith('/contents/media/tokyo')||path.endsWith('/contents/media/_optimized/manifest.json'))return response({},404);
    if(path.endsWith('/git/ref/heads/main'))return response({object:{sha:HEAD}});
    if(path.endsWith('/git/commits/'+HEAD))return response({tree:{sha:OLD}});
    if(path.endsWith('/git/trees/'+OLD))return response({truncated:false,tree:[{type:'blob',path:'content/projects/tokyo.json',sha:NEW}]});
    throw Error('Unexpected GitHub access: '+path);
  });
  let deletes=0;
  try {
    const result=await deleteProject({request:body({slug:'tokyo',revision:OLD,confirmTitle:'Tokyo'}),env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:{async delete(){deletes++;}}}});
    assert.equal(result.status,409);
    assert.equal(deletes,0);
    assert.deepEqual(gh.writes,[]);
  } finally {gh.reset();}
});

test('reorder rejects changes between initial checks and pinned head',async()=>{
  const gh=mocked((path,search,method)=>{
    if(path.endsWith('/contents/content/projects/tokyo.json'))return response({sha:OLD,content:encode(project)});
    if(path.endsWith('/contents/content/projects'))return response([{type:'file',name:'tokyo.json',sha:OLD}]);
    if(path.endsWith('/git/ref/heads/main'))return response({object:{sha:HEAD}});
    if(path.endsWith('/git/commits/'+HEAD))return response({tree:{sha:OLD}});
    if(path.endsWith('/git/trees/'+OLD))return response({truncated:false,tree:[{type:'blob',path:'content/projects/tokyo.json',sha:NEW}]});
    throw Error('Unexpected GitHub access: '+path);
  });
  try {
    const result=await reorder({request:body({slugs:['tokyo'],revisions:{tokyo:OLD}}),env:{GITHUB_TOKEN:'test'}});
    assert.equal(result.status,409);
    assert.deepEqual(gh.writes,[]);
  } finally {gh.reset();}
});

test('legacy media cleanup refuses stale project data before any GitHub changes',async()=>{
  const {onRequestPost:purge} = await import('../functions/api/admin/purge.js');
  const fresh={...project,cover:'/media/tokyo/tokyo-01.jpg',photo_details:[{
    image:'/media/tokyo/tokyo-01.jpg',storage:'r2'}]};
  const gh=mocked((path)=>{
    if(path.endsWith('/contents/content/projects/tokyo.json'))return response({sha:OLD,content:encode(fresh)});
    if(path.endsWith('/contents/content/projects'))return response([{type:'file',name:'tokyo.json',sha:NEW}]);
    throw Error('Unexpected GitHub access: '+path);
  });
  try {
    const result=await purge({request:body({slug:'tokyo',revision:OLD,confirmTitle:'Tokyo'}),
      env:{GITHUB_TOKEN:'test',PHOTO_BUCKET:{async head(){return {size:128}}}}});
    assert.equal(result.status,409);
    assert.deepEqual(gh.writes,[]);
  } finally {gh.reset();}
});
