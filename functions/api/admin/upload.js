// Upload prepared JPEGs and WebP thumbnails directly to private R2.
// No GitHub blob writes; the repository stores only project JSON.
import {json} from '../../../admin-lib/session.js';
const PROJECT = /^[a-z0-9-]{1,65}$/;
const ORIGINAL = /^media\/([a-z0-9-]{1,65})\/\1-[0-9]{2,3}-[a-f0-9]{24}\.jpg$/;
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
      key = `media/${project}/${project}-${number}-${crypto.randomUUID().replaceAll('-','').slice(0,24)}.jpg`;
    }
    let total = 0;
    // A Content-Type header alone is untrusted. Verify the JPEG/WebP file
    // signature before persisting anything, even when stream chunks are tiny.
    const signatureLength = variant ? 12 : 3;
    const signature = new Uint8Array(signatureLength);
    let signatureBytes = 0;
    const limited = req.body.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        total += chunk.byteLength;
        if (total > MAX) throw new Error('Image exceeds the 3 MB upload limit.');
        const take = Math.min(signatureLength - signatureBytes, chunk.byteLength);
        if (take > 0) {
          signature.set(chunk.subarray(0, take), signatureBytes);
          signatureBytes += take;
        }
        if (signatureBytes === signatureLength) {
          const valid = variant
            ? signature[0] === 82 && signature[1] === 73 && signature[2] === 70 && signature[3] === 70 &&
              signature[8] === 87 && signature[9] === 69 && signature[10] === 66 && signature[11] === 80
            : signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
          if (!valid) throw new Error('File content is not the expected image format.');
        }
        controller.enqueue(chunk);
      },
      flush() {
        if (signatureBytes < signatureLength) throw new Error('Image file is incomplete.');
      },
    }));
    await context.env.PHOTO_BUCKET.put(key, limited, {httpMetadata:{contentType:expected},
      customMetadata:{creator:'Nicholas Kincaid',copyright:'Copyright Nicholas Kincaid. All rights reserved.'}});
    if (!total) {await context.env.PHOTO_BUCKET.delete(key);return json({error:'Empty image.'},400);}
    return json({path:'/'+key, storage:'r2', ...(variant?{width:Number(variant)}:{})});
  } catch (error) {
    const message = String(error?.message || '');
    const tooLarge = /3 MB|upload size limit/i.test(message);
    const invalid = /image format|incomplete/i.test(message);
    return json({error:tooLarge || invalid ? message : 'R2 upload failed. Check your bucket binding and try again.'},
      tooLarge ? 413 : invalid ? 415 : 502);
  }
}
