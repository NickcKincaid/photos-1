/* V32: private deployment status with bounded polling after a GitHub save. */
(() => {
  'use strict';
  const indicator=document.getElementById('deploy-indicator');
  const detail=document.getElementById('deployment-status');
  const button=document.getElementById('deployment-refresh');
  if(!indicator || !detail || !button)return;
  let busy=false,timer=null,remaining=0,baseline=null,pending=false,lastDeployment=null;
  const labels={success:'Live',building:'Deploying',queued:'Queued',failed:'Failed',unknown:'Status unknown'};
  function schedule(){
    if(timer)clearTimeout(timer);
    timer=null;
    if(remaining>0 && pending){remaining--;timer=setTimeout(()=>{timer=null;refresh();},25000);}
    else if(pending){pending=false;detail.textContent+=' Deployment confirmation timed out; check Cloudflare Deployments.';}
  }
  async function refresh(){
    if(busy){if(remaining>0)schedule();return;}
    busy=true;button.disabled=true;
    indicator.textContent='· Checking deployment…';
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),10000);
    try {
      const response=await fetch('/api/admin/deployment',{
        credentials:'same-origin',cache:'no-store',signal:controller.signal
      });
      let body;try{body=await response.json();}
      catch{throw Error(`Deployment service returned HTTP ${response.status}, not JSON.`);}
      if(!response.ok)throw Error(body?.error || 'Deployment status lookup failed.');
      const label=labels[body.status]||labels.unknown;
      const id=body.deployment_id||null;
      const hasNew=Boolean(pending && baseline && id && baseline!==id);
      const waiting=Boolean(pending && baseline && !hasNew);
      lastDeployment=id;
      if(hasNew && (body.status==='success' || body.status==='failed')) {pending=false;remaining=0;}
      const shown=waiting?'Waiting for new deployment':label;
      indicator.dataset.state=waiting?'building':body.status;
      indicator.textContent='· '+shown;
      const time=body.updated_at?new Date(body.updated_at):null;
      const when=time && Number.isFinite(time.valueOf())?time.toLocaleString():'Time unavailable';
      detail.textContent=`Latest production deployment: ${label} · ${when}` +
        (body.commit?` · Commit ${body.commit}`:'') + (waiting?' · Waiting for GitHub update to build.':'');
    }catch(error){
      indicator.dataset.state='unknown';indicator.textContent='· Status unavailable';
      detail.textContent=(error.name==='AbortError'?'Cloudflare status lookup timed out.':error.message||'Unable to read deployment status.');
    }finally{clearTimeout(timeout);busy=false;button.disabled=false;if(pending)schedule();}
  }
  button.addEventListener('click',()=>{if(timer)clearTimeout(timer);timer=null;refresh();});
  window.addEventListener('portfolio-published',()=>{
    pending=true;remaining=14;baseline=lastDeployment;
    if(timer)clearTimeout(timer);timer=null;refresh();
  });
  window.addEventListener('pagehide',()=>{if(timer)clearTimeout(timer);timer=null;});
  refresh();
})();
