// Downloadable metadata snapshot. Never exports R2 image bytes, OAuth secrets,
// or GitHub credentials. The admin middleware protects this route.
import {gh, decodeContent, errorResponse} from '../../../admin-lib/github.js';
import {json} from '../../../admin-lib/session.js';
const directories=['projects','notes'];
export async function onRequestGet(context) {
  try {
    const root=await gh(context,'/contents/content/site.json?ref=main');
    const snapshot={format:'nickckincaid-metadata-v1',exportedAt:new Date().toISOString(),
      warning:'R2 photographs and original camera files are NOT included.',
      site:decodeContent(root.content),projects:{},notes:{}};
    for (const kind of directories) {
      let files;
      try{files=await gh(context,`/contents/content/${kind}?ref=main`);}catch(e){if(e.status===404)files=[];else throw e;}
      if(!Array.isArray(files) || files.length>120) throw Error('Too many metadata entries to export at once.');
      const names=files.filter(f=>f.type==='file' && /^[a-z0-9-]{1,80}\.json$/.test(f.name));
      // Keep concurrent GitHub requests bounded; the call runs only on click.
      for(let i=0;i<names.length;i+=8) {
        const batch=await Promise.all(names.slice(i,i+8).map(async f=>{
          const item=await gh(context,`/contents/content/${kind}/${encodeURIComponent(f.name)}?ref=main`);
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
