/* V34: native accordion panels and private browser-local AI usage metrics. */
(() => {
  'use strict';
  const STORAGE_KEY = 'portfolio-ai-v33-usage';
  const FOLD_KEY = 'portfolio-v34-panels:';
  const groups = Array.from(document.querySelectorAll('details.admin-panel[data-panel]'));
  const valid = new Set(['open', 'closed']);
  for (const panel of groups) {
    const key=FOLD_KEY+panel.dataset.panel;
    try {
      const state=sessionStorage.getItem(key);
      if(valid.has(state))panel.open=state==='open';
    } catch {} // session storage may be restricted
    panel.addEventListener('toggle',()=>{
      try {sessionStorage.setItem(key,panel.open?'open':'closed');}catch{}
    });
  }
  // Browser constraint validation must be able to focus required fields.
  for(const id of ['editor-form','note-form']){
    document.getElementById(id)?.addEventListener('invalid',event=>{
      const panel=event.target.closest('details.admin-panel');
      if(panel)panel.open=true;
    },true);
  }
  document.getElementById('v34-cancel-changes')?.addEventListener('click',()=>{
    if(typeof window.PortfolioDiscardChanges==='function')window.PortfolioDiscardChanges();
  });
  const usage=document.getElementById('v34-ai-usage');
  function renderUsage(){
    if(!usage)return;
    let stats={};
    try { stats=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')||{}; } catch {}
    const number=key=>Math.max(0,Number(stats[key])||0).toLocaleString();
    for(const key of ['requests','successes','failures']){
      const target=usage.querySelector('[data-usage="'+key+'"]');
      if(target)target.textContent=number(key);
    }
    const target=usage.querySelector('[data-usage="tokens"]');
    if(target)target.textContent=Number(stats.measuredRequests)>0
      ? `${number('inputTokens')} input · ${number('outputTokens')} output (reported on ${number('measuredRequests')} requests)`
      : 'Not reported by model';
  }
  renderUsage();
  window.addEventListener('portfolio-ai-usage-updated',renderUsage);
  window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY)renderUsage();});
})();
