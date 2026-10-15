import { gh, getProject, slugify, errorResponse } from '../../../admin-lib/github.js';
import { json, readLimited } from '../../../admin-lib/session.js';
const fields = ['camera','lens','focal_length','aperture','shutter_speed','iso','alt'];
export async function onRequestPost(context) {
  try {
    const bytes = await readLimited(context.request, 150000);
    const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!input || typeof input !== 'object') throw Error('Invalid project');
    const title = String(input.title || '').trim();
    if (title.length < 1 || title.length > 120) throw Error('Project title must be 1–120 characters.');
    const create = !input.slug;
    const slug = create ? slugify(title) : String(input.slug);
    if (!/^[a-z0-9-]{1,65}$/.test(slug)) throw Error('Invalid project slug');
    let previous = {};
    if (create) {
      try { await getProject(context, slug); throw Error('A project with that title already exists.'); }
      catch (err) { if (err.status !== 404) throw err; }
    } else {
      previous = await getProject(context, slug);
    }
    if (!Array.isArray(input.photos) || input.photos.length > 90) throw Error('Limit: 90 photos per project.');
    const original = [previous.cover, ...(previous.gallery || [])].filter(Boolean);
    const knownDetails = new Map((previous.photo_details || []).filter(x => x && typeof x === 'object').map(x => [x.image, x]));
    const usedIds = new Set();
    const newId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 24);
    const newRefs = [], treeEntries = [], details = [];
    const seenExisting = new Set(), seenNew = new Set();
    for (const item of input.photos) {
      if (!item || typeof item !== 'object') throw Error('Invalid photo');
      let path;
      if (item.kind === 'existing') {
        path = String(item.path || '');
        if (!original.includes(path) || !/^\/media\/[a-zA-Z0-9._/-]+\.(jpe?g|webp|png|tiff?)$/i.test(path) || path.includes('..') || seenExisting.has(path)) throw Error('Invalid existing photo reference');
        seenExisting.add(path);
      } else if (item.kind === 'new') {
        const sha = String(item.sha || '');
        if (!/^[a-f0-9]{40}$/i.test(sha) || seenNew.has(sha)) throw Error('Invalid photo upload. Try uploading it again.');
        seenNew.add(sha);
        path = `/media/${slug}/upload-${crypto.randomUUID().replace(/-/g, '')}.jpg`;
        treeEntries.push({ path: path.slice(1), mode:'100644', type:'blob', sha });
      } else throw Error('Unknown photo type');
      newRefs.push(path);
      const old = item.kind === 'existing' ? knownDetails.get(path) : null;
      let permanentId = old && typeof old.id === 'string' && /^[0-9a-f]{24}$/.test(old.id) ? old.id : newId();
      while (usedIds.has(permanentId)) permanentId = newId();
      usedIds.add(permanentId);
      const info = { image: path, id: permanentId };
      if (old && typeof old.legacy_id === 'string' && /^[0-9a-f]{16}$/.test(old.legacy_id)) info.legacy_id = old.legacy_id;
      for (const field of fields) {
        const v = String(item.meta?.[field] || '').trim();
        if (v) info[field] = v.slice(0, field === 'alt' ? 250 : 180);
      }
      details.push(info);
    }
    const published = Boolean(input.published);
    if (published && !newRefs.length) throw Error('Add at least one photograph before publishing.');
    const order = Number(input.order);
    if (!Number.isSafeInteger(order) || order < 0 || order > 999999) throw Error('Homepage order must be a whole number between 0 and 999999.');
    const next = { ...previous, title, published, order, cover: newRefs[0] || '', gallery: newRefs.slice(1), photo_details: details };
    // One atomic Git commit for all changes to this project, including new files.
    const ref = await gh(context, '/git/ref/heads/main');
    const head = await gh(context, `/git/commits/${ref.object.sha}`);
    treeEntries.push({ path:`content/projects/${slug}.json`, mode:'100644', type:'blob', content:JSON.stringify(next, null, 2) + '\n' });
    const tree = await gh(context, '/git/trees', { method:'POST', body:{ base_tree:head.tree.sha, tree:treeEntries } });
    const commit = await gh(context, '/git/commits', { method:'POST', body:{ message:`Publish photography project: ${title}`, tree:tree.sha, parents:[ref.object.sha] } });
    await gh(context, '/git/refs/heads/main', { method:'PATCH', body:{ sha:commit.sha, force:false } });
    return json({ ok:true, slug, commit:commit.sha });
  } catch (error) { return errorResponse(error); }
}
