import { json } from './session.js';
const API = 'https://api.github.com/repos/NickcKincaid/photos-1';
export const GH_OWNER = 'NickcKincaid', GH_REPO = 'photos-1';
export const BRANCH = 'main';
// Avoid bursting dozens of parallel requests against the GitHub API.
export async function mapInBatches(items, size, callback) {
  if (!Number.isInteger(size) || size < 1) throw Error('Invalid batch size');
  const values = [];
  for (let i = 0; i < items.length; i += size) {
    values.push(...await Promise.all(items.slice(i, i + size).map(callback)));
  }
  return values;
}
export const slugify = value => (String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 65) || 'untitled');
export async function gh(context, path, { method = 'GET', body = undefined } = {}) {
  let res;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    res = await fetch(`${API}${path}`, {
      method,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${context.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'photography-portfolio-admin',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    const timedOut = controller.signal.aborted;
    const err = Error(timedOut
      ? 'GitHub did not respond within 12 seconds. Retry the action.'
      : 'Could not reach GitHub. Try again shortly.');
    err.status = timedOut ? 504 : 502;
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    if (res.status === 404) { const err = Error('Not found'); err.status = 404; throw err; }
    if (res.status === 409 || res.status === 422) { const err = Error('GitHub changed while saving. Refresh the editor and retry.'); err.status = 409; throw err; }
    if (res.status === 403 || res.status === 429) { const err = Error('GitHub access is temporarily unavailable or rate-limited. Check the token and try again later.'); err.status = 503; throw err; }
    const err = Error(res.status >= 500
      ? 'GitHub is temporarily unavailable. Try again shortly.'
      : `GitHub request failed (${res.status}). Verify token permissions and repository access.`);
    err.status = res.status >= 500 ? 503 : 502;
    throw err;
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
