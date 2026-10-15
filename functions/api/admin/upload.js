// Stream a browser-encoded JPEG directly to GitHub's Git Blob API.
// The previous version encoded 2.6 MB in the Cloudflare Function itself; that
// used too much CPU for the Workers Free plan (10 ms / request).
import { json } from '../../../admin-lib/session.js';
const API = 'https://api.github.com/repos/NickcKincaid/photos-1/git/blobs';
const LIMIT = 3_800_000; // 2.6 MB JPEG encoded as JSON/base64 = approx 3.47 MB.
export async function onRequestPost(context) {
  const req = context.request;
  if (!/^application\/json(?:;|$)/i.test(req.headers.get('content-type') || '')) {
    return json({ error: 'Expected an encoded JPEG upload.' }, 415);
  }
  if (!req.body) return json({ error: 'Missing photograph.' }, 400);
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > LIMIT) return json({ error: 'Photo is too large after preparation.' }, 413);
  try {
    let total = 0;
    const capped = req.body.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        total += chunk.byteLength;
        if (total > LIMIT) throw Error('Photo is too large after preparation.');
        controller.enqueue(chunk);
      },
    }));
    const upstream = await fetch(API, {
      method: 'POST', duplex: 'half',
      headers: {
        Authorization: `Bearer ${context.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'photography-portfolio-admin',
        'Content-Type': 'application/json',
      },
      body: capped,
    });
    if (!upstream.ok) return json({ error: `GitHub rejected the image (${upstream.status}). Retry or reduce its size.` }, upstream.status === 413 ? 413 : 502);
    const result = await upstream.json();
    if (!/^[a-f0-9]{40}$/i.test(String(result.sha || ''))) throw Error('GitHub returned an invalid photo reference.');
    return json({ sha: result.sha });
  } catch (error) {
    return json({ error: error.message?.includes('too large') ? error.message : 'Image upload failed. Please try again.' },
      error.message?.includes('too large') ? 413 : 502);
  }
}
