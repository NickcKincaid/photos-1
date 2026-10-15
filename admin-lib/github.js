import { json } from './session.js';
const API = 'https://api.github.com/repos/NickcKincaid/photos-1';
export const GH_OWNER = 'NickcKincaid', GH_REPO = 'photos-1';
export const BRANCH = 'main';
export const slugify = value => (String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 65) || 'untitled');
export async function gh(context, path, { method = 'GET', body = undefined } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${context.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'photography-portfolio-admin',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 404) { const err = Error('Not found'); err.status = 404; throw err; }
    if (res.status === 409 || res.status === 422) { const err = Error('GitHub changed while saving. Refresh the editor and retry.'); err.status = 409; throw err; }
    if (res.status === 403 || res.status === 429) { const err = Error('GitHub access is temporarily unavailable or rate-limited. Check the token and try again later.'); err.status = 503; throw err; }
    throw Error(`GitHub request failed (${res.status}). Verify token permissions and repository access.`);
  }
  return res.json();
}
export function decodeContent(content) {
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\s/g, '')), char => char.charCodeAt(0))));
}
export async function getProject(context, slug) {
  if (!/^[a-z0-9-]{1,65}$/.test(slug)) throw Error('Invalid project path');
  const file = await gh(context, `/contents/content/projects/${slug}.json?ref=${BRANCH}`);
  if (file.type !== 'file' || !file.content) throw Error('Invalid project file');
  return decodeContent(file.content);
}
export function errorResponse(error) {
  return json({ error: error.message || 'Request failed.' }, error.status || 400);
}
