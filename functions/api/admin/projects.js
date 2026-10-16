import { gh, decodeContent, errorResponse, mapInBatches } from '../../../admin-lib/github.js';
import { json } from '../../../admin-lib/session.js';
export async function onRequestGet(context) {
  try {
    const files = await gh(context, '/contents/content/projects?ref=main');
    if (!Array.isArray(files)) throw Error('Project directory missing');
    const projectFiles = files.filter(f => f.type === 'file' && f.name.endsWith('.json'));
    if (projectFiles.length > 40) throw Error('This editor supports up to 40 projects. Please contact the site developer before adding more.');
    const projects = await mapInBatches(projectFiles, 6, async f => {
      const data = await gh(context, `/contents/content/projects/${encodeURIComponent(f.name)}?ref=main`);
      return { ...decodeContent(data.content), slug: f.name.slice(0, -5), revision: data.sha };
    });
    projects.sort((a,b) => (Number.isFinite(Number(a.order)) && a.order !== null ? Number(a.order) : 999) - (Number.isFinite(Number(b.order)) && b.order !== null ? Number(b.order) : 999) || String(a.title).localeCompare(String(b.title)));
    return json({ projects });
  } catch (error) { return errorResponse(error); }
}
