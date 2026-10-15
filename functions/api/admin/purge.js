// Optional second phase: remove legacy GitHub image copies AFTER each photo is
// confirmed in R2 and its project data marks storage:'r2'. No history rewrite.
import {gh,decodeContent,errorResponse} from '../../../admin-lib/github.js';
import {json,readLimited} from '../../../admin-lib/session.js';
const SHA=/^[a-f0-9]{40}$/i;
const IMAGE=/^media\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.(?:jpe?g|png|webp|tiff?)$/i;
export async function onRequestPost(context) {
  try {
    if (!context.env.PHOTO_BUCKET) throw Error('R2 bucket binding PHOTO_BUCKET is missing.');
    const input=JSON.parse(new TextDecoder().decode(await readLimited(context.request,2048)));
    const slug=String(input?.slug || ''), revision=String(input?.revision || '');
    if(!/^[a-z0-9-]{1,65}$/.test(slug)||!SHA.test(revision))throw Error('Refresh the editor and try again.');
    const file=await gh(context,`/contents/content/projects/${slug}.json?ref=main`);
    if(file.sha!==revision){const e=Error('Project changed. Refresh before cleaning up Github copies.');e.status=409;throw e;}
    const project=decodeContent(file.content);
    if(String(input.confirmTitle||'').trim()!==String(project.title||'').trim())throw Error('Project name does not match.');
    const photos=[project.cover,...(project.gallery||[])].filter(Boolean);
    if(!photos.length)throw Error('Project has no photographs.');
    const details=new Map((project.photo_details||[]).filter(x=>x&&typeof x==='object').map(x=>[x.image,x]));
    for(const photo of photos) {
      if(!IMAGE.test(photo.slice(1)) || photo.includes('..') || details.get(photo)?.storage!=='r2')
        throw Error('Some photographs have not been migrated to R2. Nothing was removed.');
      if(!await context.env.PHOTO_BUCKET.head(photo.slice(1)))
        throw Error('A migrated photograph is missing from R2. Nothing was removed.');
    }
    const listing=await gh(context,'/contents/content/projects?ref=main');
    if(!Array.isArray(listing)||listing.length>45)throw Error('Unable to verify shared photographs.');
    const shared=new Set();
    for(const f of listing) {
      if(f.type!=='file' || !f.name.endsWith('.json') || f.name===`${slug}.json`)continue;
      const other=decodeContent((await gh(context,`/contents/content/projects/${encodeURIComponent(f.name)}?ref=main`)).content);
      for(const p of [other.cover,...(other.gallery||[])])if(typeof p==='string')shared.add(p);
    }
    const ref=await gh(context,'/git/ref/heads/main');
    const head=await gh(context,`/git/commits/${ref.object.sha}`);
    const fileTree=await gh(context,`/git/trees/${head.tree.sha}?recursive=1`);
    if(fileTree.truncated||!Array.isArray(fileTree.tree))throw Error('Could not verify the complete repository tree.');
    const tracked=new Set(fileTree.tree.filter(x=>x.type==='blob').map(x=>x.path));
    const removed=photos.filter(p=>!shared.has(p)&&tracked.has(p.slice(1))).map(p=>p.slice(1));
    if(!removed.length)return json({ok:true,removed:0,shared:photos.filter(p=>shared.has(p)).length});
    const tree=await gh(context,'/git/trees',{method:'POST',body:{base_tree:head.tree.sha,
      tree:removed.map(path=>({path,mode:'100644',type:'blob',sha:null}))}});
    const commit=await gh(context,'/git/commits',{method:'POST',body:{message:`chore: move ${slug} image copies to R2`,tree:tree.sha,parents:[ref.object.sha]}});
    await gh(context,'/git/refs/heads/main',{method:'PATCH',body:{sha:commit.sha,force:false}});
    return json({ok:true,removed:removed.length,shared:photos.filter(p=>shared.has(p)).length,commit:commit.sha});
  }catch(error){return errorResponse(error);}
}
