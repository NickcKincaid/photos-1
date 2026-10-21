// Delete one project and its exclusively referenced current images in one Git commit.
// Deletion is intentionally conservative: never delete an image used by another
// project, and never rewrite Git history or touch the site's other files.
import { gh, decodeContent, errorResponse } from '../../../admin-lib/github.js';
import { json, readLimited } from '../../../admin-lib/session.js';

const IMAGE = /^media\/(?!_optimized\/|_unused\/)[a-zA-Z0-9._/-]+\.(?:jpe?g|png|webp|tiff?)$/i;
const VARIANT = /^media\/_optimized\/[a-f0-9]{16}-[0-9]+w\.webp$/i;
const PROJECT = /^[a-z0-9-]{1,65}$/;
const HASH = /^[a-f0-9]{40}$/i;

function photoPaths(project) {
  const raw = [project.cover, ...(Array.isArray(project.gallery) ? project.gallery : [])];
  return new Set(raw.filter(x => typeof x === 'string' && x.startsWith('/')).map(x => x.slice(1)).filter(x => IMAGE.test(x) && !x.split('/').includes('..')));
}

function r2Keys(project) {
  const originals = new Set(photoPaths(project));
  const keys = new Set();
  for (const entry of (project.photo_details || [])) {
    if (!entry || entry.storage !== 'r2' || typeof entry.image !== 'string') continue;
    const original = entry.image.slice(1);
    if (!originals.has(original) || !IMAGE.test(original)) continue;
    keys.add(original);
    for (const variant of entry.variants || []) {
      const key = typeof variant?.url === 'string' ? variant.url.slice(1) : '';
      if (/^media\/([a-z0-9-]{1,65})\/(?:(?:\1-[0-9]{2,3}-[a-f0-9]{24})|(?:[a-f0-9]{24}\/\1-[0-9]{2,3}))-(640|1280)\.webp$/.test(key) &&
          key.startsWith(original.slice(0,-4) + '-')) keys.add(key);
    }
  }
  const social=String(project.social_card?.path || '').slice(1);
  if (/^media\/([a-z0-9-]{1,65})\/[a-f0-9]{24}\/sharing-1200x630\.jpg$/.test(social)) keys.add(social);
  return keys;
}
function optimizedPaths(items) {
  if (!Array.isArray(items)) return [];
  return items.map(x => typeof x?.url === 'string' && x.url.startsWith('/') ? x.url.slice(1) : '').filter(x => VARIANT.test(x));
}

export async function onRequestPost(context) {
  try {
    const bytes = await readLimited(context.request, 2048);
    let input;
    try { input = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)); }
    catch { throw Error('Invalid delete request.'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid delete request.');
    const slug = String(input.slug || '');
    const revision = String(input.revision || '');
    if (!PROJECT.test(slug) || !HASH.test(revision)) throw Error('Refresh the editor and try again.');

    // Read the current document from GitHub and reject stale browser tabs.
    const currentFile = await gh(context, `/contents/content/projects/${slug}.json?ref=main`);
    if (!HASH.test(String(currentFile.sha || '')) || currentFile.sha !== revision) {
      const error = Error('This project changed since you opened it. Refresh before deleting.');
      error.status = 409;
      throw error;
    }
    const project = decodeContent(currentFile.content);
    const title = String(project.title || '').trim();
    if (!title || String(input.confirmTitle || '').trim() !== title) {
      throw Error('The confirmation name does not match the project.');
    }

    // Protect images that another project references, including draft projects.
    const listing = await gh(context, '/contents/content/projects?ref=main');
    if (!Array.isArray(listing)) throw Error('Unable to verify project references.');
    const otherFiles = listing.filter(x => x.type === 'file' && x.name.endsWith('.json') && x.name !== `${slug}.json`);
    if (otherFiles.length > 40) throw Error('Too many projects to safely verify photo ownership.');
    const protectedPhotos = new Set();
    const protectedR2 = new Set();
    for (const file of otherFiles) {
      const doc = await gh(context, `/contents/content/projects/${encodeURIComponent(file.name)}?ref=main`);
      const other=decodeContent(doc.content);
      for (const path of photoPaths(other)) protectedPhotos.add(path);
      for (const path of r2Keys(other)) protectedR2.add(path);
    }
    const sourcePhotos = photoPaths(project);
    const ownedPhotos = new Set([...sourcePhotos].filter(x => !protectedPhotos.has(x)));
    const removeR2 = [...r2Keys(project)].filter(x => !protectedPhotos.has(x) && !protectedR2.has(x));
    if (removeR2.length && !context.env.PHOTO_BUCKET) throw Error('R2 storage is not connected. Deletion was cancelled to avoid orphaned photos.');

    // The upload folder is specific to the immutable slug. Remove abandoned
    // uploads there as well, unless another project references them.
    let folderFiles;
    try { folderFiles = await gh(context, `/contents/media/${slug}?ref=main`); }
    catch (error) { if (error.status !== 404) throw error; folderFiles = []; }
    if (!Array.isArray(folderFiles)) throw Error('Unexpected media directory format.');
    for (const file of folderFiles) {
      const path = `media/${slug}/${file.name}`;
      if (file.type === 'file' && IMAGE.test(path) && !protectedPhotos.has(path)) ownedPhotos.add(path);
    }

    // Build a manifest without entries for this project's unshared images.
    // Variant files reused by a different photo remain intact.
    let manifest = null;
    try {
      const response = await gh(context, '/contents/media/_optimized/manifest.json?ref=main');
      manifest = decodeContent(response.content);
      if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw Error('Invalid thumbnail manifest.');
    } catch (error) { if (error.status !== 404) throw error; }
    const nextManifest = manifest === null ? null : {...manifest};
    const candidateVariants = new Set();
    if (nextManifest) {
      for (const [url, images] of Object.entries(manifest)) {
        const path = url.startsWith('/') ? url.slice(1) : '';
        if (ownedPhotos.has(path)) {
          for (const p of optimizedPaths(images)) candidateVariants.add(p);
          delete nextManifest[url];
        }
      }
    }
    const stillUsedVariants = new Set();
    if (nextManifest) {
      for (const images of Object.values(nextManifest)) {
        for (const p of optimizedPaths(images)) stillUsedVariants.add(p);
      }
    }
    const variantsToDelete = [...candidateVariants].filter(p => !stillUsedVariants.has(p));

    const ref = await gh(context, '/git/ref/heads/main');
    const head = await gh(context, `/git/commits/${ref.object.sha}`);
    const tree = await gh(context, `/git/trees/${head.tree.sha}?recursive=1`);
    if (tree.truncated || !Array.isArray(tree.tree)) throw Error('GitHub returned an incomplete file list. Nothing was deleted.');
    const paths = new Set(tree.tree.filter(x => x.type === 'blob').map(x => x.path));
    const projectPath = `content/projects/${slug}.json`;
    if (!paths.has(projectPath)) throw Error('The project was changed while deleting. Refresh and retry.');
    const remove = [...new Set([projectPath, ...ownedPhotos, ...variantsToDelete])].filter(p => paths.has(p));
    const entries = remove.map(path => ({path, mode:'100644', type:'blob', sha:null}));
    if (nextManifest && paths.has('media/_optimized/manifest.json')) {
      const originalJSON = JSON.stringify(manifest);
      if (JSON.stringify(nextManifest) !== originalJSON) {
        entries.push({path:'media/_optimized/manifest.json',mode:'100644',type:'blob',content:JSON.stringify(nextManifest,null,2)+'\n'});
      }
    }
    const nextTree = await gh(context, '/git/trees', {method:'POST', body:{base_tree:head.tree.sha,tree:entries}});
    const commit = await gh(context, '/git/commits', {method:'POST',body:{message:`Delete photography project: ${title}`,tree:nextTree.sha,parents:[ref.object.sha]}});
    await gh(context, '/git/refs/heads/main', {method:'PATCH',body:{sha:commit.sha,force:false}});
    let deletedR2 = 0, r2Warning = '';
    if (removeR2.length) {
      try {
        // Delete R2 only AFTER the GitHub project removal is committed.
        await context.env.PHOTO_BUCKET.delete(removeR2);
        deletedR2 = removeR2.length;
      } catch (error) {
        r2Warning = 'The project was deleted, but R2 cleanup failed. Check the bucket for unused files.';
        console.error('R2 cleanup after project deletion failed', error);
      }
    }
    return json({ok:true,deletedR2,r2Warning,deletedPhotos:remove.filter(p=>ownedPhotos.has(p)).length,
      deletedVariants:remove.filter(p=>variantsToDelete.includes(p)).length,commit:commit.sha});
  } catch (error) { return errorResponse(error); }
}
