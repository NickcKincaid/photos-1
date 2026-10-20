/* Private Cloudflare deployment readout, including follow-up after publishing. */
(() => {
  const indicator=document.getElementById('deploy-indicator');
  const detail=document.getElementById('deployment-status');
  const button=document.getElementById('deployment-refresh');
  if (!indicator || !detail || !button) return;
  let busy=false, timer=null, remaining=0, lastId=null, baselineId=null, pending=false;
  async function refresh() {
    if(busy)return;
    busy=true;button.disabled=true;
    indicator.textContent='· Checking deployment…';
    try {
      const response=await fetch('/api/admin/deployment',{credentials:'same-origin',cache:'no-store'});
      const body=await response.json();
      if(!response.ok)throw Error(body?.error || 'Deployment lookup failed.');
      const labels={success:'Live',building:'Deploying',queued:'Queued',failed:'Failed',unknown:'Status unknown'};
      const label=labels[body.status]||labels.unknown;
      const newDeployment=pending && baselineId && body.deployment_id && body.deployment_id!==baselineId;
      const waiting=pending && !newDeployment && ['success','unknown'].includes(body.status);
      const display=waiting ? 'Waiting for new deployment' : label;
      lastId=body.deployment_id || null;
      indicator.dataset.state=waiting?'building':body.status;
      indicator.textContent=`· ${display}`;
      const date=body.updated_at?new Date(body.updated_at):null;
      const when=date && Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Time unavailable';
      detail.textContent=`Latest production deployment: ${label} · ${when}${body.commit?' · Commit '+body.commit:''}.${waiting?' A newer GitHub save may still be waiting to deploy.':''}`;
      if(newDeployment && ['success','failed'].includes(body.status)) {remaining=0;pending=false;}
      if (remaining>0) schedule();
      else {pending=false; if(waiting)detail.textContent+=' Check Cloudflare if the site has not updated.';}
    }catch(err){
      indicator.dataset.state='unknown';indicator.textContent='· Status unavailable';
      detail.textContent=err.message || 'Unable to read deployment status.';
      remaining=0;
    }finally{busy=false;button.disabled=false;}
  }
  function schedule() {
    if(timer)clearTimeout(timer);
    if(remaining>0) {remaining--;timer=setTimeout(()=>{timer=null;refresh();},25000);}
  }
  button.addEventListener('click',()=>{remaining=0;if(timer)clearTimeout(timer);refresh();});
  window.addEventListener('portfolio-published',()=>{remaining=12; pending=true; baselineId=lastId; if(timer)clearTimeout(timer); refresh();});
  refresh();
})();
