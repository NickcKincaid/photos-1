import { normalizeExposureValue } from '../../../admin-lib/exposure.js';
import { gh, getProject, decodeContent, slugify, errorResponse } from '../../../admin-lib/github.js';
import { json, readLimited } from '../../../admin-lib/session.js';
const fields = ['camera','lens','focal_length','aperture','shutter_speed','iso','alt'];
const REQUIRED_EXPOSURE = [['focal_length','Focal length'],['aperture','Aperture'],['shutter_speed','Shutter speed'],['iso','ISO']];
const R2_IMAGE = /^\/media\/([a-z0-9-]{1,65})\/(?:(?:\1-[0-9]{2,3}-[a-f0-9]{24})|(?:[a-f0-9]{24}\/\1-[0-9]{2,3}))\.jpg$/;
const R2_SOCIAL = /^\/media\/([a-z0-9-]{1,65})\/[a-f0-9]{24}\/sharing-1200x630\.jpg$/;
const R2_VARIANT = /^\/media\/([a-z0-9-]{1,65})\/(?:(?:\1-[0-9]{2,3}-[a-f0-9]{24})|(?:[a-f0-9]{24}\/\1-[0-9]{2,3}))-(640|1280)\.webp$/;
function validVariants(value, original, slug) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 2) throw Error('Invalid photo thumbnails.');
  const seen = new Set();
  return value.map(v => {
    const path = String(v?.url || '');
    const width = Number(v?.width);
    if (![640,1280].includes(width) || seen.has(width) ||
        !R2_VARIANT.test(path) || !path.startsWith(original.slice(0,-4)+'-') ||
        !path.startsWith(`/media/${slug}/`)) throw Error('Invalid thumbnail reference.');
    seen.add(width);
    return {url:path,width};
  });
}
export async function onRequestPost(context) {
  try {
    const bytes = await readLimited(context.request, 150000);
    const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!input || typeof input !== 'object') throw Error('Invalid project');
    const title = String(input.title || '').trim();
    if (title.length < 1 || title.length > 120) throw Error('Project title must be 1–120 characters.');
    if (input.blurb != null && typeof input.blurb !== 'string') throw Error('Invalid project blurb.');
    if (String(input.blurb || '').length > 1000) throw Error('Project blurb must be 1,000 characters or less.');
    const blurb = String(input.blurb || '').trim().replace(/\r\n?/g, '\n');
    // Homepage crop is an object-position percentage, not a destructive crop.
    // Validate both values before storing them in markup/CSS.
    const coverPosition = input.cover_position == null ? {x:50,y:50} : input.cover_position;
    if (!coverPosition || typeof coverPosition !== 'object' || Array.isArray(coverPosition) ||
        !Number.isInteger(coverPosition.x) || !Number.isInteger(coverPosition.y) ||
        coverPosition.x < 0 || coverPosition.x > 100 || coverPosition.y < 0 || coverPosition.y > 100) {
      throw Error('Invalid homepage cover position (expected percentages from 0 to 100).');
    }
    const socialPosition = input.social_position == null ? {x:50,y:50} : input.social_position;
    if (!socialPosition || typeof socialPosition !== 'object' || Array.isArray(socialPosition) ||
        !Number.isInteger(socialPosition.x) || !Number.isInteger(socialPosition.y) ||
        socialPosition.x < 0 || socialPosition.x > 100 || socialPosition.y < 0 || socialPosition.y > 100) {
      throw Error('Invalid sharing crop position (expected 0–100 percentages).');
    }
    const create = !input.slug;
    const slug = create ? slugify(title) : String(input.slug);
    if (!/^[a-z0-9-]{1,65}$/.test(slug)) throw Error('Invalid project slug');
    let previous = {};
    if (create) {
      try { await getProject(context, slug); throw Error('A project with that title already exists.'); }
      catch (err) { if (err.status !== 404) throw err; }
    } else {
      // Enforce optimistic concurrency on the exact project file. A second editor
      // tab must not silently replace a more recent photo list or metadata.
      const current = await gh(context, `/contents/content/projects/${slug}.json?ref=main`);
      if (!/^[a-f0-9]{40}$/i.test(String(input.revision || '')) || current.sha !== input.revision) {
        const err = Error('This project changed in GitHub. Refresh the editor before saving.');
        err.status = 409;
        throw err;
      }
      previous = decodeContent(current.content);
    }
    if (!Array.isArray(input.photos) || input.photos.length > 90) throw Error('Limit: 90 photos per project.');
    const original = [previous.cover, ...(previous.gallery || [])].filter(Boolean);
    const knownDetails = new Map((previous.photo_details || []).filter(x => x && typeof x === 'object').map(x => [x.image, x]));
    const usedIds = new Set();
    const newId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 24);
    const newRefs = [], treeEntries = [], details = [];
    const seenExisting = new Set(), seenNew = new Set(), seenPaths = new Set();
    for (const item of input.photos) {
      if (!item || typeof item !== 'object') throw Error('Invalid photo');
      const missing = REQUIRED_EXPOSURE.filter(([field]) => !String(item.meta?.[field] ?? '').trim());
      if (missing.length) {
        throw Error(`Photo ${details.length + 1}: ${missing.map(([,label])=>label).join(', ')} required before saving.`);
      }
      const formattedExposure={};
      for (const [field,label] of REQUIRED_EXPOSURE) {
        const formatted=normalizeExposureValue(field,item.meta[field]);
        if(formatted===null) throw Error(`Photo ${details.length+1}: invalid ${label}. Expected 35mm, f/8, 1/250s or ISO 400.`);
        formattedExposure[field]=formatted;
      }
      let path;
      let newR2 = false;
      if (item.kind === 'existing') {
        path = String(item.path || '');
        if (!original.includes(path) || !/^\/media\/[a-zA-Z0-9._/-]+\.(jpe?g|webp|png|tiff?)$/i.test(path) || path.includes('..') || seenExisting.has(path)) throw Error('Invalid existing photo reference');
        seenExisting.add(path);
      } else if (item.kind === 'r2') {
        path = String(item.path || '');
        const match = R2_IMAGE.exec(path);
        if (!match || match[1] !== slug || seenNew.has(path)) throw Error('Invalid R2 image reference.');
        seenNew.add(path);
        // The shared R2 existence check below covers both new and existing objects.
        newR2 = true;
      } else if (item.kind === 'new') {
        const sha = String(item.sha || '');
        if (!/^[a-f0-9]{40}$/i.test(sha) || seenNew.has(sha)) throw Error('Invalid photo upload. Try uploading it again.');
        seenNew.add(sha);
        path = `/media/${slug}/upload-${crypto.randomUUID().replace(/-/g, '')}.jpg`;
        treeEntries.push({ path: path.slice(1), mode:'100644', type:'blob', sha });
      } else throw Error('Unknown photo type');
      // The same R2 object must not appear twice through different client kinds.
      if (seenPaths.has(path)) throw Error('This photograph is already included in the project. Remove the duplicate before saving.');
      seenPaths.add(path);
      newRefs.push(path);
      const old = item.kind === 'existing' ? knownDetails.get(path) : null;
      let permanentId = old && typeof old.id === 'string' && /^[0-9a-f]{24}$/.test(old.id) ? old.id : newId();
      while (usedIds.has(permanentId)) permanentId = newId();
      usedIds.add(permanentId);
      const info = { image: path, id: permanentId };
      // Photo dimensions are optional for legacy R2 objects. They must be real
      // positive integers; never accept arbitrary CSS or untrusted ratios.
      const width = item.width ?? old?.width;
      const height = item.height ?? old?.height;
      if (width != null || height != null) {
        if (!Number.isInteger(width) || !Number.isInteger(height) ||
            width < 1 || height < 1 || width > 40000 || height > 40000) {
          throw Error('Invalid photograph dimensions. Reload the editor and retry.');
        }
        info.width = width;
        info.height = height;
      }
      if (newR2 || old?.storage === 'r2' || item.meta?.storage === 'r2') {
        if (!context.env.PHOTO_BUCKET) throw Error('R2 bucket binding PHOTO_BUCKET is missing.');
        // Existing unchanged published R2 paths were already verified when first saved.
        // The integrity checker can diagnose storage loss on demand; do not make
        // dozens of R2 HEAD requests during routine metadata edits.
        if (!(item.kind === 'existing' && old?.storage === 'r2') &&
            !await context.env.PHOTO_BUCKET.head(path.slice(1))) {
          throw Error('R2 photograph is not present in storage.');
        }
        info.storage = 'r2';
        const variants = newR2 ? validVariants(item.variants, path, slug) :
          (old?.variants || item.variants) ? (R2_IMAGE.test(path) ? validVariants(item.variants ?? old?.variants,path,slug) : []) : [];
        if (variants.length) info.variants = variants;
      }
      if (old && typeof old.legacy_id === 'string' && /^[0-9a-f]{16}$/.test(old.legacy_id)) info.legacy_id = old.legacy_id;
      for (const field of fields) {
        const v = REQUIRED_EXPOSURE.some(([key]) => key === field) ? formattedExposure[field] : String(item.meta?.[field] || '').trim();
        if (v) info[field] = v.slice(0, field === 'alt' ? 250 : 180);
      }
      details.push(info);
    }
    const socialImage = String(input.social_image || '');
    if (socialImage && !newRefs.includes(socialImage)) throw Error('Choose a sharing image from this project.');
    const sharingSource = socialImage || newRefs[0] || '';
    // Preserve old clients' projects (which have no social_card), but never
    // accept a media URL that was not produced by our dedicated R2 uploader.
    let socialCard = null;
    const submittedCard = input.social_card === undefined ? previous.social_card : input.social_card;
    if (submittedCard != null) {
      const card = submittedCard;
      const cardPath = String(card?.path || '');
      if (!card || typeof card !== 'object' || Array.isArray(card) || !sharingSource ||
          !R2_SOCIAL.test(cardPath) || !cardPath.startsWith(`/media/${slug}/`) ||
          card.source !== sharingSource || !card.position ||
          card.position.x !== socialPosition.x || card.position.y !== socialPosition.y) {
        throw Error('Sharing crop is out of date. Regenerate the social preview before saving.');
      }
      if (!context.env.PHOTO_BUCKET || !await context.env.PHOTO_BUCKET.head(cardPath.slice(1))) {
        throw Error('Sharing preview image is missing from R2. Try saving again.');
      }
      socialCard = {path:cardPath,source:sharingSource,position:{...socialPosition}};
    }
    const published = Boolean(input.published);
    if (published && !newRefs.length) throw Error('Add at least one photograph before publishing.');
    const order = Number(input.order);
    if (!Number.isSafeInteger(order) || order < 0 || order > 999999) throw Error('Homepage order must be a whole number between 0 and 999999.');
    const next = { ...previous, title, blurb, published, order, social_image: socialImage, cover_position: coverPosition, social_position:socialPosition,
      social_card:socialCard, cover: newRefs[0] || '', gallery: newRefs.slice(1), photo_details: details };
    // One atomic Git commit for all changes to this project, including new files.
    const ref = await gh(context, '/git/ref/heads/main');
    const head = await gh(context, `/git/commits/${ref.object.sha}`);
    treeEntries.push({ path:`content/projects/${slug}.json`, mode:'100644', type:'blob', content:JSON.stringify(next, null, 2) + '\n' });
    const tree = await gh(context, '/git/trees', { method:'POST', body:{ base_tree:head.tree.sha, tree:treeEntries } });
    const commit = await gh(context, '/git/commits', { method:'POST', body:{ message:`Publish photography project: ${title}`, tree:tree.sha, parents:[ref.object.sha] } });
    await gh(context, '/git/refs/heads/main', { method:'PATCH', body:{ sha:commit.sha, force:false } });
    // Storage cleanup happens only after the project commit succeeds. Never
    // delete an R2 object that another project still references.
    const previouslyPublished = new Set(original);
    const removed = (previous.photo_details || []).filter(d =>
      d && d.storage === 'r2' && typeof d.image === 'string' &&
      previouslyPublished.has(d.image) && !newRefs.includes(d.image));
    let cleanupWarning = '';
    const oldShare = String(previous.social_card?.path || '');
    const replacedShare = R2_SOCIAL.test(oldShare) && oldShare.startsWith(`/media/${slug}/`) && oldShare !== socialCard?.path ? oldShare : '';
    if ((removed.length || replacedShare) && context.env.PHOTO_BUCKET) {
      try {
        const listing = await gh(context, '/contents/content/projects?ref=main');
        const protectedPaths = new Set();
        if (!Array.isArray(listing) || listing.length > 45) throw Error('Unable to check photo sharing.');
        for (const file of listing) {
          if (file.type !== 'file' || !file.name.endsWith('.json') || file.name === `${slug}.json`) continue;
          const doc = await gh(context, `/contents/content/projects/${encodeURIComponent(file.name)}?ref=main`);
          const other = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(doc.content.replace(/\s/g,'')),x=>x.charCodeAt(0))));
          for (const url of [other.cover,...(other.gallery || []),other.social_card?.path]) if (typeof url === 'string') protectedPaths.add(url);
        }
        const keys=[];
        for (const d of removed) {
          if (protectedPaths.has(d.image)) continue;
          const key=d.image.slice(1);
          if (!R2_IMAGE.test('/'+key)) continue;
          keys.push(key);
          for (const v of d.variants || []) {
            const variant = typeof v?.url === 'string' ? v.url.slice(1) : '';
            if (R2_VARIANT.test('/'+variant) && variant.startsWith(key.replace(/\.jpg$/, '')+'-')) keys.push(variant);
          }
        }
        if (replacedShare && !protectedPaths.has(replacedShare)) keys.push(replacedShare.slice(1));
        if (keys.length) await context.env.PHOTO_BUCKET.delete([...new Set(keys)]);
      } catch (error) {
        cleanupWarning = 'Project saved, but old R2 photos could not be removed automatically. Check bucket storage later.';
        console.error('Non-fatal R2 cleanup problem', error);
      }
    }
    return json({ ok:true, slug, commit:commit.sha, cleanupWarning });
  } catch (error) { return errorResponse(error); }
}
