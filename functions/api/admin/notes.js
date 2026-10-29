// Private note management. The existing /api/admin/* middleware verifies the
// signed GitHub-owner session and rejects cross-origin writes.
import { gh, decodeContent, errorResponse, slugify, mapInBatches } from '../../../admin-lib/github.js';
import { json, readLimited } from '../../../admin-lib/session.js';

const SLUG = /^[a-z0-9-]{1,65}$/;
const SHA = /^[a-f0-9]{40}$/i;
const NOTE_DIR = '/contents/content/notes';
const encode = value => btoa(String.fromCharCode(...new TextEncoder().encode(value)));
const bad = (message, status=400) => { const e = Error(message); e.status = status; throw e; };

export async function onRequestGet(context) {
  try {
    let files;
    try { files = await gh(context, `${NOTE_DIR}?ref=main`); }
    catch (error) { if (error.status === 404) return json({notes: []}); throw error; }
    if (!Array.isArray(files)) bad('Unable to list notes.');
    const names = files.filter(f => f.type === 'file' && /^[a-z0-9-]{1,65}\.json$/.test(f.name));
    if (names.length > 80) bad('The notes editor currently supports up to 80 notes.', 413);
    const notes = await mapInBatches(names, 6, async file => {
      const item = await gh(context, `${NOTE_DIR}/${encodeURIComponent(file.name)}?ref=main`);
      if (!SHA.test(item.sha || '')) bad('Unexpected GitHub note revision.');
      const note = decodeContent(item.content);
      return {slug: file.name.slice(0,-5), revision: item.sha,
        title: String(note.title || ''), body: String(note.body || ''),
        published: note.published === true,
        created_at: note.created_at || null, published_at: note.published_at || null,
        date_mode: note.date_mode === 'created' ? 'created' : 'published'};
    });
    notes.sort((a,b) => (b.published_at || '').localeCompare(a.published_at || '') || a.title.localeCompare(b.title));
    return json({notes});
  } catch (error) { return errorResponse(error); }
}

export async function onRequestPost(context) {
  try {
    const bytes = await readLimited(context.request, 55000);
    let input;
    try { input = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)); }
    catch { bad('Invalid note data.'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) bad('Invalid note data.');
    if (typeof input.title !== 'string' || input.title.trim().length > 120) bad('Note title must be 120 characters or fewer.');
    if (typeof input.body !== 'string' || !input.body.trim() || input.body.length > 12000) bad('Note text must be 1–12,000 characters.');
    if (typeof input.published !== 'boolean') bad('Invalid publication setting.');
    if (input.date_mode != null && !['created', 'published'].includes(input.date_mode)) bad('Invalid date display setting.');
    const title = input.title.trim();
    const body = input.body.trim().replace(/\r\n/g, '\n');
    const now = new Date().toISOString();
    let slug, previous = {}, revision;
    const creating = input.slug == null;
    if (creating) {
      if (input.revision != null) bad('Invalid new note revision.');
      // A blank or punctuation-only title should never create an 'untitled-*' URL.
      const readable = slugify(title);
      const prefix = readable === 'untitled' ? 'note' : readable.slice(0, 48);
      slug = `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
    } else {
      slug = String(input.slug);
      revision = String(input.revision || '');
      if (!SLUG.test(slug) || !SHA.test(revision)) bad('Refresh this note before saving.', 409);
      const file = await gh(context, `${NOTE_DIR}/${slug}.json?ref=main`);
      if (file.sha !== revision) bad('This note changed in GitHub. Refresh before saving.', 409);
      previous = decodeContent(file.content);
    }
    // The browser records when the editor was first opened. Server validates the
    // timestamp, then treats it as immutable after the first GitHub save.
    let start = now;
    if (creating && typeof input.started_at === 'string') {
      const ms = Date.parse(input.started_at);
      if (Number.isFinite(ms) && ms >= Date.UTC(2000, 0, 1) && ms <= Date.now() + 300000)
        start = new Date(ms).toISOString();
    }
    const note = {title, body, published: input.published,
      created_at: previous.created_at || start,
      published_at: input.published ? ((previous.published && previous.published_at) || now) : (previous.published_at || null),
      date_mode: input.date_mode || previous.date_mode || 'published',
      updated_at: now};
    const payload = { message: `${creating ? 'Create' : 'Update'} note: ${(title || 'No Title').slice(0, 70)}`,
      content: encode(JSON.stringify(note, null, 2) + '\n'), branch: 'main' };
    if (!creating) payload.sha = revision;
    await gh(context, `${NOTE_DIR}/${slug}.json`, {method: 'PUT', body: payload});
    return json({ok: true, slug, published_at: note.published_at});
  } catch (error) { return errorResponse(error); }
}

export async function onRequestDelete(context) {
  try {
    const bytes = await readLimited(context.request, 2000);
    let input;
    try { input = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)); }
    catch { bad('Invalid delete request.'); }
    const slug = String(input?.slug || ''), revision = String(input?.revision || '');
    if (!SLUG.test(slug) || !SHA.test(revision)) bad('Refresh the note before deleting.', 409);
    const file = await gh(context, `${NOTE_DIR}/${slug}.json?ref=main`);
    if (file.sha !== revision) bad('This note changed in GitHub. Refresh before deleting.', 409);
    const previous = decodeContent(file.content);
    if (String(input?.confirmTitle ?? '').trim() !== String(previous.title || '').trim()) bad('Confirmation title does not match.');
    await gh(context, `${NOTE_DIR}/${slug}.json`, {method: 'DELETE', body: {
      message: `Delete note: ${String(previous.title || 'No Title').slice(0, 70)}`, 
      sha: revision, branch: 'main'
    }});
    return json({ok:true});
  } catch (error) { return errorResponse(error); }
}
