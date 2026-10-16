// Upload prepared JPEGs and WebP thumbnails directly to private R2.
// No GitHub blob writes; the repository stores only project JSON.
import {json, readLimited} from '../../../admin-lib/session.js';
const PROJECT = /^[a-z0-9-]{1,65}$/;
// Accept existing hash-suffixed keys and new clean filenames in private unique folders.
const ORIGINAL = /^media\/([a-z0-9-]{1,65})\/(?:(?:\1-[0-9]{2,3}-[a-f0-9]{24})|(?:[a-f0-9]{24}\/\1-[0-9]{2,3}))\.jpg$/;
const MAX = 3_000_000;
export async function onRequestPost(context) {
  try {
    if (!context.env.PHOTO_BUCKET) return json({error:'R2 is not connected. Add the PHOTO_BUCKET binding in Cloudflare and redeploy.'},503);
    const req = context.request;
    const project = req.headers.get('X-Photo-Project') || '';
    const variant = req.headers.get('X-Photo-Variant') || '';
    const source = req.headers.get('X-Photo-Source') || '';
    if (!PROJECT.test(project)) return json({error:'Enter a valid project name before uploading.'},400);
    if (!req.body) return json({error:'No image was provided.'},400);
    const type = req.headers.get('content-type') || '';
    const expected = variant ? 'image/webp' : 'image/jpeg';
    if (type !== expected) return json({error:`Expected ${expected}.`},415);
    const declared = Number(req.headers.get('content-length') || 0);
    if (declared > MAX) return json({error:'The prepared image exceeds 3 MB.'},413);
    let key;
    if (variant) {
      if (!['640','1280'].includes(variant)) return json({error:'Invalid thumbnail width.'},400);
      const match = ORIGINAL.exec(source);
      if (!match || match[1] !== project) return json({error:'Invalid thumbnail source.'},400);
      if (!await context.env.PHOTO_BUCKET.head(source)) return json({error:'Upload the original photograph first.'},409);
      key = source.replace(/\.jpg$/, `-${variant}.webp`);
    } else {
      const ordinal = Number(req.headers.get('X-Photo-Position'));
      if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 999) return json({error:'Invalid photo position.'},400);
      const number = String(ordinal).padStart(2,'0');
      // Keep a unique R2 object key without appending the ID to the filename.
      // Reusing /project/project-01.jpg would overwrite a published photo while
      // an edit is still in progress, or when a user reorders and uploads again.
      const uniqueFolder = crypto.randomUUID().replaceAll('-','').slice(0,24);
      key = `media/${project}/${uniqueFolder}/${project}-${number}.jpg`;
    }
    // An R2 binding cannot accept a TransformStream with unknown length.
    // Buffer only the already-compressed, strictly capped (3 MB) photo so
    // put() receives a Uint8Array whose length is known to workerd.
    const image = await readLimited(req, MAX);
    if (!image.byteLength) return json({error:'Empty image.'},400);
    const jpeg = image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
    const webp = image.length >= 12 && image[0] === 82 && image[1] === 73 &&
      image[2] === 70 && image[3] === 70 && image[8] === 87 &&
      image[9] === 69 && image[10] === 66 && image[11] === 80;
    if (!(variant ? webp : jpeg)) return json({error:'File content is not the expected image format.'},415);
    await context.env.PHOTO_BUCKET.put(key, image, {httpMetadata:{contentType:expected},
      customMetadata:{creator:'Nicholas Kincaid',copyright:'Copyright Nicholas Kincaid. All rights reserved.'}});
    return json({path:'/'+key, storage:'r2', ...(variant?{width:Number(variant)}:{})});
  } catch (error) {
    const message = String(error?.message || '');
    const tooLarge = error?.status === 413 || /3 MB|upload size limit/i.test(message);
    const invalid = /image format|incomplete/i.test(message);
    // Server-only diagnostics. Never log image bytes, session cookies or tokens.
    if (!tooLarge && !invalid) console.error('Photography R2 upload error:', error?.name || 'Error', message);
    return json({error:tooLarge || invalid ? message : 'R2 upload failed. Check Cloudflare Pages Function logs and your PHOTO_BUCKET binding.'},
      tooLarge ? 413 : invalid ? 415 : 502);
  }
}
