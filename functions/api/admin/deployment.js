// V32: authenticated production deployment readout, server-only token.
import { json } from '../../../admin-lib/session.js';

export function summarizeDeployment(deployment) {
  const stage=deployment?.latest_stage || {};
  const name=String(stage.name || '').toLowerCase();
  const state=String(stage.status || '').toLowerCase();
  let status='unknown';
  if(state==='success' && name==='deploy') status='success';
  else if(['failure','failed','canceled','cancelled'].includes(state))status='failed';
  else if(['active','in_progress','running','pending'].includes(state))status='building';
  else if(state==='idle' || name==='queued')status='queued';
  else if(state==='success')status='building';
  return {status,stage:name||'unknown',updated_at:deployment?.modified_on||deployment?.created_on||null,
    commit:String(deployment?.deployment_trigger?.metadata?.commit_hash||'').slice(0,12),
    deployment_id:String(deployment?.id||'').slice(0,48)};
}

export async function onRequestGet({env}) {
  const account=String(env?.CF_ACCOUNT_ID||'').trim();
  const project=String(env?.CF_PAGES_PROJECT||'').trim();
  const token=String(env?.CF_PAGES_READ_TOKEN||'').trim();
  if(!/^[0-9a-f]{32}$/i.test(account) || !/^[a-z0-9-]{1,64}$/.test(project) || !token)
    return json({error:'Deployment status not configured. Set CF_ACCOUNT_ID, CF_PAGES_PROJECT, and encrypted CF_PAGES_READ_TOKEN in Production.'},503);
  try {
    const url=`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${project}/deployments?env=production&per_page=10`;
    const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(8000)});
    if(!response.ok){
      if([401,403].includes(response.status))return json({error:'Cloudflare API token lacks Pages Read access or belongs to another account.'},502);
      if(response.status===404)return json({error:'Cloudflare Pages project not found. Verify CF_ACCOUNT_ID and CF_PAGES_PROJECT.'},502);
      return json({error:`Cloudflare deployment API returned HTTP ${response.status}.`},502);
    }
    const body=await response.json();
    if(!body?.success || !Array.isArray(body.result))return json({error:'Cloudflare returned an unexpected response. Check API token scope.'},502);
    // The API query filters to Production; tolerate older payloads without environment.
    const deployments=body.result.filter(item=>!item.environment || item.environment==='production');
    deployments.sort((a,b)=>Date.parse(b.created_on||0)-Date.parse(a.created_on||0));
    if(!deployments.length)return json({error:'No production deployments were returned by Cloudflare.'},404);
    return json(summarizeDeployment(deployments[0]));
  }catch(error){
    console.error('Cloudflare deployment lookup:',String(error?.message||'Unexpected error').slice(0,200));
    return json({error:'Unable to reach the Cloudflare deployment API. Try again.'},502);
  }
}
