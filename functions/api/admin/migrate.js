// Copy one existing GitHub-hosted image into R2, without deleting or rewriting it.
// Only an image referenced by this actual project can be migrated.
import {getProject,errorResponse} from '../../../admin-lib/github.js';
import {json,readLimited} from '../../../admin-lib/session.js';
const IMAGE = /^\/media\/(?!_optimized\/|_unused\/)[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.(?:jpe?g|png|webp|tiff?)$/i;
const MAX_MIGRATION_BYTES = 25_000_000;

// R2 bindings need a known-length body. A TransformStream cannot be used
// reliably as a put() body, so read the trusted deployed asset with a cap.
export async function readStaticImageLimited(response, maxBytes = MAX_MIGRATION_BYTES) {
  if (!response.body) throw Error('Original photo has no response body.');
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) throw Error('This photo is too large for the in-dashboard migration; migrate it separately.');
  const reader = response.body.getReader();
  let total = 0;
  const parts = [];
  try {
    while (true) {
      const {value,done} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw Error('Photo exceeds migration limit.');
      parts.push(value);
    }
  } catch (error) {
    try { await reader.cancel(); } catch {}
    throw error;
  }
  if (total === 0) throw Error('Original photo is empty.');
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return bytes;
}
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
    const mime = source.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
    if (!/^image\/(?:jpeg|png|webp|tiff)$/.test(mime)) throw Error('Static file is not a supported photograph.');
    const bytes = await readStaticImageLimited(source);
    await context.env.PHOTO_BUCKET.put(key,bytes,{httpMetadata:{contentType:mime}});
    return json({ok:true,path,migrated:true});
  } catch(error) { return errorResponse(error); }
}
