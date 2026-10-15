// Copy one existing GitHub-hosted image into R2, without deleting or rewriting it.
// Only an image referenced by this actual project can be migrated.
import {getProject,errorResponse} from '../../../admin-lib/github.js';
import {json,readLimited} from '../../../admin-lib/session.js';
const IMAGE = /^\/media\/(?!_optimized\/|_unused\/)[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.(?:jpe?g|png|webp|tiff?)$/i;
export async function onRequestPost(context) {
  try {
    if (!context.env.PHOTO_BUCKET) return json({error:'R2 bucket binding PHOTO_BUCKET is missing.'},503);
    const raw = await readLimited(context.request,2048);
    const input = JSON.parse(new TextDecoder().decode(raw));
    const slug = String(input?.slug || ''), path = String(input?.path || '');
    if (!/^[a-z0-9-]{1,65}$/.test(slug) || !IMAGE.test(path) || path.includes('..')) throw Error('Invalid photo migration request.');
    const project = await getProject(context,slug);
    if (![project.cover,...(project.gallery || [])].includes(path)) throw Error('This photograph is not in the selected project.');
    const key = path.slice(1);
    if (await context.env.PHOTO_BUCKET.head(key)) return json({ok:true,path,already:true});
    // ASSETS goes directly to the deployed GitHub static copy, never back through our R2 route.
    const source = await context.env.ASSETS.fetch(new Request(new URL(path,context.request.url),{method:'GET'}));
    if (!source.ok || !source.body) throw Error('Original photo not found in the current deployed static files.');
    const declared = Number(source.headers.get('content-length') || 0);
    if (declared > 25_000_000) throw Error('This photo is too large for the in-dashboard migration; migrate it separately.');
    const mime = source.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
    if (!/^image\/(?:jpeg|png|webp|tiff)$/.test(mime)) throw Error('Static file is not a supported photograph.');
    let actual = 0;
    const capped = source.body.pipeThrough(new TransformStream({transform(chunk,controller) {
      actual+=chunk.byteLength;
      if (actual>25_000_000) throw Error('Photo exceeds migration limit.');
      controller.enqueue(chunk);
    }}));
    await context.env.PHOTO_BUCKET.put(key,capped,{httpMetadata:{contentType:mime}});
    return json({ok:true,path,migrated:true});
  } catch(error) { return errorResponse(error); }
}
