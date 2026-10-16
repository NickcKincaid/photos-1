// Copy legacy R2 images to clean names and change project references only after
// every requested photo (and its WebP variants) has been verified in R2.
// This endpoint is protected by the existing /api/admin middleware.
import {gh, decodeContent, errorResponse} from '../../../admin-lib/github.js';
import {json, readLimited} from '../../../admin-lib/session.js';

const SLUG = /^[a-z0-9-]{1,65}$/;
const SHA = /^[a-f0-9]{40}$/i;
const LEGACY = /^\/media\/([a-z0-9-]{1,65})\/\1-([0-9]{2,3})-([a-f0-9]{24})\.jpg$/;
const SIZES = [640, 1280];
const MAX_IMAGE_BYTES = 25_000_000;

function paths(project) {
  return [project.cover, ...(Array.isArray(project.gallery) ? project.gallery : [])].filter(Boolean);
}
function destination(oldPath, slug, index) {
  const match = LEGACY.exec(oldPath);
  if (!match || match[1] !== slug) throw Error('This photo already has a clean filename or is not a legacy R2 JPEG.');
  const suffix = String(index + 1).padStart(2, '0');
  return `/media/${slug}/${match[3]}/${slug}-${suffix}.jpg`;
}
function variantUrl(original, size) {
  return original.slice(0, -4) + `-${size}.webp`;
}
async function currentProject(context, slug, revision) {
  const file = await gh(context, `/contents/content/projects/${slug}.json?ref=main`);
  if (!SHA.test(String(revision || '')) || revision !== file.sha) {
    const error = Error('Project changed since you opened it. Refresh the dashboard and retry.');
    error.status = 409;
    throw error;
  }
  const project = decodeContent(file.content);
  if (!project || typeof project !== 'object' || !Array.isArray(project.photo_details)) {
    throw Error('Invalid project data; migration cancelled.');
  }
  return project;
}
async function copyVerified(bucket, source, target, type) {
  const original = await bucket.head(source);
  if (!original) throw Error(`Missing R2 photograph: ${source}`);
  if (!original.size || original.size > MAX_IMAGE_BYTES) throw Error('Photo is too large to migrate in the dashboard.');
  const previousCopy = await bucket.head(target);
  if (previousCopy) {
    if (previousCopy.customMetadata?.migrationSource !== source || previousCopy.size !== original.size ||
        (previousCopy.etag && original.etag && previousCopy.etag !== original.etag)) {
      const error = Error('A different image already exists at the intended filename. No project changes were made.');
      error.status = 409;
      throw error;
    }
    return;
  }
  const object = await bucket.get(source);
  if (!object || typeof object.arrayBuffer !== 'function') throw Error('Cannot read existing photograph in R2.');
  const bytes = await object.arrayBuffer();
  if (bytes.byteLength !== original.size) throw Error('Image size mismatch while migrating.');
  await bucket.put(target, bytes, {
    httpMetadata: {...(object.httpMetadata || {}), contentType: type},
    customMetadata: {...(object.customMetadata || {}), migrationSource: source},
  });
  const check = await bucket.head(target);
  if (!check || check.size !== original.size || check.customMetadata?.migrationSource !== source ||
      (original.etag && check.etag && original.etag !== check.etag)) {
    throw Error('Verification of the copied R2 photograph failed. Original photo remains intact.');
  }
}

async function prepare(context, project, slug, oldPath) {
  const index = paths(project).indexOf(oldPath);
  if (index < 0) throw Error('This photograph is no longer in the project.');
  const newPath = destination(oldPath, slug, index);
  const originalKey = oldPath.slice(1), newKey = newPath.slice(1);
  // The reference must be an R2 photograph, not an old asset still in GitHub.
  const previous = project.photo_details.find(d => d?.image === oldPath);
  if (!previous || previous.storage !== 'r2') throw Error('This photo is not marked as stored in R2; migration was cancelled.');
  await copyVerified(context.env.PHOTO_BUCKET, originalKey, newKey, 'image/jpeg');
  const variants = [];
  for (const size of SIZES) {
    const oldVariant = variantUrl(oldPath, size);
    const oldVariantKey = oldVariant.slice(1);
    if (!await context.env.PHOTO_BUCKET.head(oldVariantKey)) continue;
    const newVariant = variantUrl(newPath, size);
    await copyVerified(context.env.PHOTO_BUCKET, oldVariantKey, newVariant.slice(1), 'image/webp');
    variants.push({url: newVariant, width: size});
  }
  return {oldPath, newPath, variants};
}

async function commit(context, project, slug, mappings) {
  const originals = paths(project);
  const legacy = originals.filter(path => LEGACY.test(path) &&
    project.photo_details.some(d => d?.image === path && d.storage === 'r2'));
  if (legacy.length !== mappings.length || legacy.length === 0) {
    throw Error('Photo list changed or migration is incomplete. No project changes were made.');
  }
  const lookup = new Map();
  for (const mapping of mappings) {
    if (!mapping || typeof mapping !== 'object' || lookup.has(mapping.oldPath)) throw Error('Invalid duplicate migration entry.');
    lookup.set(mapping.oldPath, mapping);
  }
  for (const path of legacy) {
    const info = lookup.get(path);
    const expectedPath = destination(path, slug, originals.indexOf(path));
    if (!info || info.newPath !== expectedPath) throw Error('One of the new filenames does not match the original project order.');
    const sourceKey = path.slice(1);
    const dest = await context.env.PHOTO_BUCKET.head(expectedPath.slice(1));
    const source = await context.env.PHOTO_BUCKET.head(sourceKey);
    if (!source || !dest || source.size !== dest.size || dest.customMetadata?.migrationSource !== sourceKey ||
        (source.etag && dest.etag && source.etag !== dest.etag)) {
      throw Error('The copied image could not be verified. Original references remain unchanged.');
    }
    if (!Array.isArray(info.variants) || info.variants.length > 2) throw Error('Invalid thumbnail information.');
    // All source variants must be migrated before switching the project. The
    // browser cannot silently omit an existing WebP optimization.
    for (const size of SIZES) {
      if (await context.env.PHOTO_BUCKET.head(variantUrl(path, size).slice(1)) &&
          !info.variants.some(v => v?.width === size && v?.url === variantUrl(expectedPath, size))) {
        throw Error('An optimized thumbnail still needs copying. Retry migration.');
      }
    }
    for (const variant of info.variants) {
      const size = Number(variant.width);
      if (!SIZES.includes(size) || variant.url !== variantUrl(expectedPath, size)) throw Error('Invalid thumbnail filename.');
      const oldVariant = variantUrl(path, size).slice(1);
      const newVariant = await context.env.PHOTO_BUCKET.head(variant.url.slice(1));
      const old = await context.env.PHOTO_BUCKET.head(oldVariant);
      if (!old || !newVariant || old.size !== newVariant.size || newVariant.customMetadata?.migrationSource !== oldVariant) {
        throw Error('An optimized thumbnail could not be verified.');
      }
    }
  }
  const byImage = new Map(project.photo_details.filter(Boolean).map(d => [d.image, d]));
  const newDetails = [];
  for (const path of originals) {
    const existing = byImage.get(path);
    if (!existing) throw Error('A photo is missing its R2 metadata; migration was cancelled.');
    const item = lookup.get(path);
    if (item) {
      const copy = {...existing, image: item.newPath, storage: 'r2'};
      if (item.variants.length) copy.variants = item.variants;
      else delete copy.variants;
      // Preserve stable lightbox links independently of filename changes.
      if (!/^[a-f0-9]{24}$/.test(String(copy.id || ''))) {
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(path));
        const hex = Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
        copy.id = hex.slice(0, 24);
        if (!copy.legacy_id) copy.legacy_id = hex.slice(0, 16);
      }
      newDetails.push(copy);
    } else newDetails.push(existing);
  }
  const remap = path => lookup.get(path)?.newPath || path;
  const updated = {
    ...project,
    cover: remap(project.cover),
    gallery: (project.gallery || []).map(remap),
    photo_details: newDetails,
  };
  // Force false prevents overwriting a newer GitHub commit, even if a second
  // browser tab publishes while R2 copying is in progress.
  const ref = await gh(context, '/git/ref/heads/main');
  const treeHead = await gh(context, `/git/commits/${ref.object.sha}`);
  const tree = await gh(context, '/git/trees', {method:'POST', body:{
    base_tree: treeHead.tree.sha,
    tree:[{path:`content/projects/${slug}.json`, mode:'100644',type:'blob',content:JSON.stringify(updated, null, 2)+'\n'}],
  }});
  const commit = await gh(context, '/git/commits', {method:'POST',body:{
    message:`Standardize R2 filenames: ${slug}`,
    tree:tree.sha,parents:[ref.object.sha],
  }});
  await gh(context, '/git/refs/heads/main', {method:'PATCH',body:{sha:commit.sha,force:false}});
  return {ok:true, migrated:legacy.length,commit:commit.sha,oldCopiesRetained:true};
}

export async function onRequestPost(context) {
  try {
    if (!context.env.PHOTO_BUCKET) return json({error:'R2 binding PHOTO_BUCKET is missing.'},503);
    const input = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(await readLimited(context.request, 50000)));
    const slug = String(input?.slug || '');
    const revision = String(input?.revision || '');
    if (!SLUG.test(slug)) throw Error('Invalid project slug.');
    if (!['prepare','commit'].includes(input.action)) throw Error('Unknown migration action.');
    const project = await currentProject(context, slug, revision);
    if (input.action === 'prepare') {
      const oldPath = String(input.oldPath || '');
      return json(await prepare(context, project, slug, oldPath));
    }
    if (!Array.isArray(input.mappings) || input.mappings.length > 90) throw Error('Invalid migration batch.');
    return json(await commit(context, project, slug, input.mappings));
  } catch (error) {
    if (!error.status && /R2|copy|thumbnail|migrat|verify|Verification/i.test(error.message || '')) {
      console.error('R2 standardize operation failed:', error?.message);
    }
    return errorResponse(error);
  }
}
