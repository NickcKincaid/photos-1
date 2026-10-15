import { gh, decodeContent, errorResponse } from '../../../admin-lib/github.js';
import { json, readLimited } from '../../../admin-lib/session.js';

// Reorder existing project files in one atomic Git commit. Never modify photos.
export async function onRequestPost(context) {
  try {
    const bytes = await readLimited(context.request, 8000);
    const input = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
    const ordered = input?.slugs;
    if (!Array.isArray(ordered) || ordered.length > 40 ||
        ordered.some(v => typeof v !== 'string' || !/^[a-z0-9-]{1,65}$/.test(v)) ||
        new Set(ordered).size !== ordered.length) {
      return json({error:'Invalid project order.'},400);
    }
    const files = await gh(context, '/contents/content/projects?ref=main');
    const all = files.filter(f=>f.type==='file' && f.name.endsWith('.json'));
    const existing = new Set(all.map(f=>f.name.slice(0,-5)));
    if (all.length !== ordered.length || ordered.some(s=>!existing.has(s))) {
      return json({error:'Project list has changed. Refresh before saving order.'},409);
    }
    const revisions = await Promise.all(ordered.map(async (slug,i)=>{
      const item = await gh(context, `/contents/content/projects/${slug}.json?ref=main`);
      const project = decodeContent(item.content);
      if (!project || typeof project !== 'object') throw Error('Invalid project document');
      project.order = i+1;
      return {path:`content/projects/${slug}.json`,mode:'100644',type:'blob',content:JSON.stringify(project,null,2)+'\n'};
    }));
    if (!revisions.length) return json({ok:true});
    const ref = await gh(context,'/git/ref/heads/main');
    const head = await gh(context,`/git/commits/${ref.object.sha}`);
    const tree = await gh(context,'/git/trees',{method:'POST',body:{base_tree:head.tree.sha,tree:revisions}});
    const commit = await gh(context,'/git/commits',{method:'POST',body:{
      message:'Reorder photography portfolio projects',tree:tree.sha,parents:[ref.object.sha]
    }});
    await gh(context,'/git/refs/heads/main',{method:'PATCH',body:{sha:commit.sha,force:false}});
    return json({ok:true,commit:commit.sha});
  } catch(error) { return errorResponse(error); }
}
