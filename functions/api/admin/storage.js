// Authenticated on-demand R2 storage inventory. A bounded scan avoids expensive
// automatic listing on every dashboard visit. No object keys are exposed.
import {json} from '../../../admin-lib/session.js';
export async function onRequestGet({env}) {
  try {
    if (!env.PHOTO_BUCKET) return json({error:'PHOTO_BUCKET R2 binding is not configured.'},503);
    let cursor, total=0, bytes=0, photographs=0, pages=0, incomplete=false;
    do {
      const result = await env.PHOTO_BUCKET.list({prefix:'media/',limit:1000, ...(cursor ? {cursor} : {})});
      if (!result || !Array.isArray(result.objects)) throw Error('Invalid R2 bucket listing.');
      for (const object of result.objects) {
        total++;
        bytes+=Number(object.size) || 0;
        if (/\.(jpe?g|png|tiff?)$/i.test(object.key || '')) photographs++;
      }
      pages++;
      cursor=result.truncated ? result.cursor : null;
      if(result.truncated && (!cursor || pages>=5)) {incomplete=true; break;}
    } while(cursor);
    return json({objects:total,photographs,bytes,incomplete,scannedPages:pages,
      // Free R2 Standard allocation is account-wide, not bucket-specific.
      note:'Storage estimate excludes requests and other buckets.'});
  } catch(error) {
    console.error('R2 storage listing failed:',error?.message || 'Unknown error');
    return json({error:'Unable to check R2 storage. Verify the PHOTO_BUCKET binding and retry.'},502);
  }
}
