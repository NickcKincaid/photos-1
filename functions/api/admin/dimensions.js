// Private, automatic, non-destructive backfill for legacy photo dimensions.
// Reads bounded JPEG prefixes from R2 and updates only missing width/height.
// A GitHub revision guard prevents overwriting concurrent project edits.
import {gh, decodeContent, errorResponse, mapInBatches} from '../../../admin-lib/github.js';
import {json, readLimited} from '../../../admin-lib/session.js';
import {r2JpegDimensions} from '../../../admin-lib/jpeg-dimensions.js';
const SLUG = /^[a-z0-9-]{1,65}$/;
const SHA = /^[a-f0-9]{40}$/i;
const KEY = /^\/media\/[a-z0-9-]{1,65}\/(?:[a-f0-9]{24}\/)?[a-z0-9-]+\.(?:jpg|jpeg)$/i;
const encodeJSON = value => {
  const bytes = new TextEncoder().encode(JSON.stringify(value,null,2)+'\n');
  let binary='';
  for(let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
};
export async function onRequestPost(context) {
  try {
    if (!context.env.PHOTO_BUCKET) return json({error:'R2 is unavailable.'},503);
    const bytes = await readLimited(context.request, 2048);
    const input = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    const slug = String(input?.slug || '');
    const revision = String(input?.revision || '');
    if (!SLUG.test(slug) || !SHA.test(revision)) return json({error:'Invalid project reference.'},400);
    const apiPath = `/contents/content/projects/${slug}.json`;
    const file = await gh(context, `${apiPath}?ref=main`);
    if (file.sha !== revision) return json({error:'Project changed; automatic dimension update deferred.'},409);
    const project = decodeContent(file.content);
    if (!Array.isArray(project.photo_details)) return json({error:'Invalid photo metadata.'},400);
    const details = project.photo_details;
    if (details.length > 90) return json({error:'Unexpected photo count.'},400);
    const missing = details.filter(item => item && typeof item === 'object' &&
      (!Number.isInteger(item.width) || !Number.isInteger(item.height)) &&
      item.storage === 'r2' && typeof item.image === 'string' && KEY.test(item.image) &&
      item.image.startsWith(`/media/${slug}/`));
    if (!missing.length) return json({ok:true,updated:0,revision:file.sha,dimensions:[]});
    const results = await mapInBatches(missing, 3, async item => {
      try {
        const dimensions = await r2JpegDimensions(context.env.PHOTO_BUCKET,item.image.slice(1));
        return dimensions ? {image:item.image,...dimensions} : null;
      } catch (error) {
        console.warn('Could not read dimensions for an R2 photograph:', error?.name || 'Error');
        return null;
      }
    });
    const found = results.filter(Boolean);
    if (!found.length) return json({ok:true,updated:0,revision:file.sha,dimensions:[]});
    const byImage = new Map(found.map(({image,width,height})=>[image,{width,height}]));
    for (const item of details) {
      const size = byImage.get(item.image);
      if (size && (!Number.isInteger(item.width) || !Number.isInteger(item.height))) {
        item.width = size.width;
        item.height = size.height;
      }
    }
    const written = await gh(context, apiPath, {method:'PUT',body:{
      message:`Record photograph dimensions: ${slug}`,
      branch:'main',sha:file.sha,content:encodeJSON(project)
    }});
    const nextSha = String(written?.content?.sha || '');
    if (!SHA.test(nextSha)) throw Error('GitHub saved the dimensions but did not return a new revision. Refresh the editor.');
    return json({ok:true,updated:found.length,revision:nextSha,dimensions:found});
  } catch(error) { return errorResponse(error); }
}
