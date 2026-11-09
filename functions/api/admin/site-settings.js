// Admin-only public navigation settings. Authentication and same-origin write
// protection are supplied by functions/api/admin/_middleware.js.
import { gh, decodeContent, errorResponse } from '../../../admin-lib/github.js';
import { json, readLimited } from '../../../admin-lib/session.js';

const PATH = '/contents/content/site.json';
const SHA = /^[a-f0-9]{40}$/i;

const bad = (message, status = 400) => {
  const error = Error(message);
  error.status = status;
  throw error;
};

const encodeJSON = data => {
  const bytes = new TextEncoder().encode(JSON.stringify(data, null, 2) + '\n');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
};

export async function onRequestGet(context) {
  try {
    const file = await gh(context, `${PATH}?ref=main`);
    const site = decodeContent(file.content);
    if (!site || typeof site !== 'object' || Array.isArray(site) || !SHA.test(file.sha || ''))
      bad('Invalid site settings in GitHub.', 502);
    if (site.show_notes_tab != null && typeof site.show_notes_tab !== 'boolean')
      bad('Invalid Notes navigation setting in GitHub.', 502);
    return json({show_notes_tab: site.show_notes_tab !== false, revision: file.sha});
  } catch (error) { return errorResponse(error); }
}

export async function onRequestPost(context) {
  try {
    const bytes = await readLimited(context.request, 2048);
    let input;
    try { input = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)); }
    catch { bad('Invalid site setting request.'); }
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        typeof input.show_notes_tab !== 'boolean' || !SHA.test(String(input.revision || '')) ||
        Object.keys(input).some(key => !['show_notes_tab', 'revision'].includes(key))) {
      bad('Invalid site setting or revision.');
    }
    const file = await gh(context, `${PATH}?ref=main`);
    if (file.sha !== input.revision) bad('Site settings changed in GitHub. Reload before saving.', 409);
    const site = decodeContent(file.content);
    if (!site || typeof site !== 'object' || Array.isArray(site)) bad('Invalid site settings in GitHub.', 502);
    if (site.show_notes_tab != null && typeof site.show_notes_tab !== 'boolean') bad('Invalid Notes setting in GitHub.', 502);
    if ((site.show_notes_tab !== false) === input.show_notes_tab) {
      return json({ok:true,unchanged:true,show_notes_tab: input.show_notes_tab,revision:file.sha});
    }
    // Merge only the allowlisted setting. Do not rewrite Notes, projects, or
    // unrelated site metadata from a stale client snapshot.
    site.show_notes_tab = input.show_notes_tab;
    const saved = await gh(context, PATH, {method:'PUT',body:{
      message: `${input.show_notes_tab ? 'Show' : 'Hide'} Notes tab in public navigation`,
      content: encodeJSON(site), sha:file.sha, branch:'main'
    }});
    if (!SHA.test(String(saved?.content?.sha || ''))) bad('GitHub saved the setting, but did not return its revision. Reload the page.', 502);
    return json({ok:true,show_notes_tab:input.show_notes_tab,revision:saved.content.sha});
  } catch (error) { return errorResponse(error); }
}
