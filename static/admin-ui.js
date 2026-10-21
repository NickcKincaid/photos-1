/* V35: native accessible accordion panels and project discard action. */
(() => {
  'use strict';
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
})();
