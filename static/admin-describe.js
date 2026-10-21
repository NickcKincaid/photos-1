/* V32: on-demand, sequential accessibility descriptions with actionable errors. */
(() => {
  'use strict';
  const generate=document.getElementById('generate-descriptions');
  const stop=document.getElementById('stop-descriptions');
  const notice=document.getElementById('ai-description-status');
  if(!generate || !stop || !notice)return;
  const panel=document.getElementById('ai-description');
  const errors=document.createElement('details');
  errors.id='ai-description-errors';errors.hidden=true;
  const summary=document.createElement('summary');summary.textContent='See photo errors';
  const errorList=document.createElement('ol');
  errors.append(summary,errorList);panel?.append(errors);
  let running=false, cancelled=false, active=null;

  function preparePreview(row) {
    const image=row.querySelector('img');
    if(!image?.src) return Promise.reject(Error('Photo preview is missing.'));
    return new Promise((resolve,reject)=>{
      const source=new Image();
      source.onload=()=>{
        try {
          if (!source.naturalWidth || !source.naturalHeight) throw Error('The image has no dimensions.');
          const scale=Math.min(1,512/Math.max(source.naturalWidth,source.naturalHeight));
          const canvas=document.createElement('canvas');
          canvas.width=Math.max(1,Math.round(source.naturalWidth*scale));
          canvas.height=Math.max(1,Math.round(source.naturalHeight*scale));
          const context=canvas.getContext('2d');
          if(!context)throw Error('Canvas is unavailable.');
          context.drawImage(source,0,0,canvas.width,canvas.height);
          canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Unable to encode the preview.')),'image/jpeg',0.7);
        }catch(error){reject(Error('Unable to prepare this photograph. '+error.message));}
      };
      source.onerror=()=>reject(Error('Unable to load this photo preview. Check its R2 image link.'));
      source.crossOrigin='anonymous';source.src=image.currentSrc || image.src;
    });
  }

  async function describe(blob) {
    active=new AbortController();
    const timeout=setTimeout(()=>active?.abort('timeout'),45000);
    try {
      const response=await fetch('/api/admin/describe',{
        method:'POST',body:blob,headers:{'Content-Type':'image/jpeg'},
        credentials:'same-origin',cache:'no-store',signal:active.signal
      });
      let body;
      try {body=await response.json();}
      catch {throw Object.assign(Error(`Description service returned HTTP ${response.status}, not JSON. Check Pages Functions logs.`),{terminal:response.status>=500});}
      if(!response.ok) {
        const code=body?.code?` (${body.code})`:'';
        throw Object.assign(Error((body?.error||`AI request failed (HTTP ${response.status}).`)+code),{
          terminal:response.status===429 || response.status===503 || body?.code==='AI_ACCESS' || body?.code==='AI_BINDING',
          code:body?.code
        });
      }
      if(typeof body?.alt!=='string' || !body.alt.trim())throw Error('AI returned an empty description.');
      return body.alt.trim().slice(0,250);
    } catch(error){
      if(error?.name==='AbortError' && !cancelled)throw Error('Photo processing timed out. Try again.');
      throw error;
    } finally {clearTimeout(timeout);active=null;}
  }

  stop.addEventListener('click',()=>{cancelled=true;active?.abort();notice.textContent='Stopping…';});
  generate.addEventListener('click',async()=>{
    if(running)return;
    const rows=Array.from(document.querySelectorAll('#photos .photo-row'));
    const missing=rows.map((row,i)=>({row,i,field:row.querySelector('input[data-meta-field="alt"]')}))
      .filter(item=>item.field && !item.field.value.trim());
    if(!missing.length){notice.textContent='Every photograph in this project already has a description.';return;}
    if(!window.confirm(`Generate descriptions for ${missing.length} photograph(s) using Cloudflare Workers AI? Only reduced previews are analyzed. Usage may be billed. Nothing publishes until Save project.`))return;
    running=true;cancelled=false;generate.disabled=true;stop.hidden=false;
    let completed=0,failed=0,reason='';errors.hidden=true;errors.open=false;errorList.replaceChildren();
    try {
      for(const {row,i,field} of missing){
        if(cancelled)break;
        if(!row.isConnected || !field.isConnected || field.value.trim())continue;
        notice.textContent=`Describing photo ${completed+failed+1} of ${missing.length}…`;
        try {
          const blob=await preparePreview(row);
          if(cancelled)break;
          const alt=await describe(blob);
          if(cancelled)break;
          // Never replace text manually supplied or generated in another action.
          if(field.isConnected && !field.value.trim()){
            field.value=alt;field.dispatchEvent(new Event('input',{bubbles:true}));completed++;
          }
        } catch(error) {
          if(cancelled)break;
          failed++;reason=error.message||'Unknown error';
          const item=document.createElement('li');
          item.textContent=`Photo ${i+1}: ${reason}`;errorList.appendChild(item);
          errors.hidden=false;errors.open=true;
          notice.textContent=`Photo ${i+1} failed: ${reason}`;
          if(error.terminal)break; // Avoid charging for seven identical configuration failures.
        }
      }
      if(cancelled)notice.textContent=`Stopped. ${completed} new description(s) remain in your unsaved editor.`;
      else if(failed)notice.textContent=`${completed} generated, ${failed} failed. ${reason} Review the errors below. Save project to publish successful descriptions.`;
      else notice.textContent=`${completed} generated, 0 failed. Review descriptions and Save project to publish them.`;
    }finally{running=false;generate.disabled=false;stop.hidden=true;active=null;}
  });
})();
