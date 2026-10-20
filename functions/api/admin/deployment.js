// Server-side Cloudflare Pages deployment status. Never expose the API token.
import { json } from '../../../admin-lib/session.js';

export function summarizeDeployment(deployment) {
  const stage = deployment?.latest_stage || {};
  const stageName = String(stage.name || '').toLowerCase();
  const state = String(stage.status || '').toLowerCase();
  let status = 'unknown';
  if (state === 'success' && stageName === 'deploy') status = 'success';
  else if (state === 'failure' || state === 'failed' || state === 'canceled' || state === 'cancelled') status = 'failed';
  else if (state === 'active' || state === 'in_progress' || state === 'running' || state === 'pending') status = 'building';
  else if (state === 'idle' || stageName === 'queued') status = 'queued';
  else if (state === 'success') status = 'building';
  return {
    status,
    stage: stageName || 'unknown',
    updated_at: deployment?.modified_on || deployment?.created_on || null,
    commit: String(deployment?.deployment_trigger?.metadata?.commit_hash || '').slice(0,12),
    deployment_id: String(deployment?.id || '').slice(0,48),
  };
}

export async function onRequestGet({ env }) {
  const account = String(env.CF_ACCOUNT_ID || '');
  const project = String(env.CF_PAGES_PROJECT || '');
  const token = String(env.CF_PAGES_READ_TOKEN || '');
  if (!/^[0-9a-f]{32}$/i.test(account) || !/^[a-z0-9-]{1,64}$/.test(project) || !token)
    return json({ error:'Deployment status is not configured. Set CF_ACCOUNT_ID, CF_PAGES_PROJECT, and secret CF_PAGES_READ_TOKEN.' },503);
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${project}/deployments?env=production&per_page=5`;
    const response = await fetch(url, {headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(8000)});
    if (!response.ok) return json({error:response.status===403||response.status===401?'Cloudflare token lacks Pages Read access.':'Cloudflare deployment lookup failed.'},502);
    const body = await response.json();
    if (!body?.success || !Array.isArray(body.result)) return json({error:'Cloudflare returned an unexpected deployment response.'},502);
    const deployment=body.result.find(item=>item.environment === 'production');
    if (!deployment) return json({error:'No production deployment is available yet.'},404);
    return json(summarizeDeployment(deployment));
  } catch(error) {
    console.error('Cloudflare deployment status error:',error?.message || 'Unknown error');
    return json({error:'Unable to reach Cloudflare deployment API.'},502);
  }
}
