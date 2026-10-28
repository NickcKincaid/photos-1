// Downloadable metadata snapshot. Never exports R2 image bytes, OAuth secrets,
// or GitHub credentials. The admin middleware protects this route.
import {gh, decodeContent, errorResponse} from '../../../admin-lib/github.js';
import {json} from '../../../admin-lib/session.js';
const directories=['projects','notes'];
export async function onRequestGet(context) {
  try {
    // Freeze the backup at a single immutable Git commit. Reading each file
    // from moving `main` could otherwise mix versions if an admin saves mid-export.
    const branch = await gh(context, '/git/ref/heads/main');
    const sourceCommit = String(branch?.object?.sha || '');
    if (!/^[a-f0-9]{40}$/i.test(sourceCommit)) throw Error('Could not identify a stable GitHub backup revision.');
    const at = `?ref=${sourceCommit}`;
    const root=await gh(context,`/contents/content/site.json${at}`);
    const snapshot={format:'nickckincaid-metadata-v1',sourceCommit,exportedAt:new Date().toISOString(),
      warning:'R2 photographs and original camera files are NOT included.',
      site:decodeContent(root.content),projects:{},notes:{}};
    for (const kind of directories) {
      let files;
      try{files=await gh(context,`/contents/content/${kind}${at}`);}catch(e){if(e.status===404)files=[];else throw e;}
      if(!Array.isArray(files) || files.length>120) throw Error('Too many metadata entries to export at once.');
      const names=files.filter(f=>f.type==='file' && /^[a-z0-9-]{1,80}\.json$/.test(f.name));
      // Keep concurrent GitHub requests bounded; the call runs only on click.
      for(let i=0;i<names.length;i+=8) {
        const batch=await Promise.all(names.slice(i,i+8).map(async f=>{
          const item=await gh(context,`/contents/content/${kind}/${encodeURIComponent(f.name)}${at}`);
          return [f.name,decodeContent(item.content)];
        }));
        for(const [name,doc] of batch) snapshot[kind][name]=doc;
      }
    }
    return new Response(JSON.stringify(snapshot,null,2)+'\n',{headers:{
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'private, no-store',
      'Content-Disposition':'attachment; filename="nickckincaid-metadata-backup.json"',
      'X-Content-Type-Options':'nosniff'
    }});
  } catch(error) {return errorResponse(error);}
}
