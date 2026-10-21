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

/* V33: compact collapsible admin/storage sections, project Cancel Changes, private AI usage. */
(() => {
  'use strict';
  function start(){
    if(!document.querySelector('main'))return;
    const styles=document.createElement('style');
    styles.textContent=`
      .v33-collapse-toggle{margin-left:9px;padding:2px 7px;font:inherit;font-size:11px;border:1px solid var(--line,#ddd);background:transparent;color:inherit}
      .v33-collapse-toggle:hover{border-color:currentColor}
      .v33-cancel{background:transparent!important;color:var(--ink,#222)!important;border:1px solid var(--line,#ddd)!important}
      #v33-ai-usage{padding:14px 0;margin:18px 0;border-top:1px solid var(--line,#ddd);font-size:12px;line-height:1.6}
      #v33-ai-usage .v33-usage-figures{display:flex;gap:18px;flex-wrap:wrap;margin:9px 0}
      #v33-ai-usage a{text-decoration:underline}
      [hidden]{display:none!important}
    `;
    document.head.append(styles);

    function foldSections(){
      const headings=Array.from(document.querySelectorAll('main h2, main h3'))
        .filter(h=>!h.closest('.sidebar, nav, #v33-ai-usage, #ai-description-errors') && !h.dataset.v33Folded);
      let index=0;
      for(const heading of headings){
        const parent=heading.parentElement;
        if(!parent||parent===document.body||parent.tagName==='MAIN')continue;
        const siblings=Array.from(parent.children);
        const at=siblings.indexOf(heading);if(at===-1)continue;
        const contents=[];
        for(let i=at+1;i<siblings.length;i++){
          if(/^H[1-3]$/.test(siblings[i].tagName))break;
          if(siblings[i].matches('.v33-collapse-toggle'))continue;
          contents.push(siblings[i]);
        }
        if(!contents.length)continue;
        const key='portfolio-v33-fold:'+location.pathname+':'+(parent.id||heading.id||heading.textContent.trim().slice(0,45))+':'+index++;
        let opened=index===1; // Keep the first section visible; collapse the rest.
        try{const saved=sessionStorage.getItem(key);if(saved!==null)opened=saved==='open';}catch{}
        const toggle=document.createElement('button');toggle.type='button';toggle.className='v33-collapse-toggle';
        toggle.textContent=opened?'−':'+';toggle.setAttribute('aria-label','Toggle '+heading.textContent.trim());
        const set=(value)=>{
          opened=value;toggle.textContent=value?'−':'+';toggle.setAttribute('aria-expanded',String(value));
          for(const el of contents)el.hidden=!value;
          try{sessionStorage.setItem(key,value?'open':'closed');}catch{}
        };
        toggle.addEventListener('click',()=>set(!opened));heading.append(toggle);heading.dataset.v33Folded='1';set(opened);
      }
    }

    function projectCancel(){
      const form=document.getElementById('editor-form');if(!form)return;
      const actions=form.querySelector('.actions')||document.querySelector('.editor .actions');
      if(!actions||document.getElementById('v33-cancel-changes'))return;
      const button=document.createElement('button');button.type='button';button.id='v33-cancel-changes';
      button.className='v33-cancel';button.textContent='Cancel changes';
      button.title='Discard all unsaved changes to this project and reload the editor. Uploaded R2 files cannot be undone.';
      button.addEventListener('click',()=>{
        if(typeof window.PortfolioDiscardChanges==='function')window.PortfolioDiscardChanges();
        else window.alert('Cancel changes is temporarily unavailable. Refresh the page and check that the latest code has deployed.');
      });
      actions.append(button);
    }

    const USAGE_KEY='portfolio-ai-v33-usage';
    function usageSnapshot(){
      try{return JSON.parse(localStorage.getItem(USAGE_KEY)||'{}')||{};}catch{return {};}
    }
    function renderUsage(){
      const panel=document.getElementById('v33-ai-usage');if(!panel)return;
      const usage=usageSnapshot();
      const val=(key)=>Math.max(0,Number(usage[key])||0).toLocaleString();
      panel.querySelector('[data-usage="requests"]').textContent=val('requests');
      panel.querySelector('[data-usage="successes"]').textContent=val('successes');
      panel.querySelector('[data-usage="failures"]').textContent=val('failures');
      const measured=Math.max(0,Number(usage.measuredRequests)||0);
      panel.querySelector('[data-usage="tokens"]').textContent=measured
        ? `${val('inputTokens')} input · ${val('outputTokens')} output (reported on ${measured.toLocaleString()} requests)`
        : 'Not reported by the model';
    }
    function usagePanel(){
      if(document.getElementById('v33-ai-usage'))return;
      const path=location.pathname.toLowerCase();
      const heading=Array.from(document.querySelectorAll('main h1,main h2,main h3')).find(h=>/storage|backup/i.test(h.textContent||''));
      const isStorage=/storage|backup/i.test(path)||Boolean(heading);
      if(!isStorage)return;
      const panel=document.createElement('section');panel.id='v33-ai-usage';
      panel.innerHTML=`<h3>Photo description AI usage</h3>
        <div class="v33-usage-figures">
          <div>Requests in this browser: <b data-usage="requests">0</b></div>
          <div>Generated: <b data-usage="successes">0</b></div>
          <div>Failed: <b data-usage="failures">0</b></div>
        </div>
        <p>Tokens reported by the model: <span data-usage="tokens">Not reported</span>.</p>
        <p class="muted">These counts start with V33 and are saved only in this browser. They are not account-wide and cannot measure Cloudflare's actual neuron consumption or billing. Deleting browser storage clears them.</p>
        <p><a href="https://dash.cloudflare.com/" target="_blank" rel="noopener noreferrer">View official Workers AI neuron usage in Cloudflare ↗</a></p>`;
      const host=heading?.closest('section')||heading?.parentElement||document.querySelector('main');
      if(host)host.append(panel);else document.querySelector('main').append(panel);
      renderUsage();
      window.addEventListener('portfolio-ai-usage-updated',renderUsage);
      window.addEventListener('storage',event=>{if(event.key===USAGE_KEY)renderUsage();});
    }
    projectCancel();usagePanel();foldSections();
    // Some admin sections load asynchronously after GitHub data is read.
    let waiting=false;
    const observer=new MutationObserver(()=>{
      if(waiting)return;waiting=true;
      queueMicrotask(()=>{waiting=false;projectCancel();foldSections();});
    });
    const main=document.querySelector('main');observer.observe(main,{childList:true,subtree:true});
    window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
