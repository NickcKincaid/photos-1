/* V35: generate / regenerate descriptions with explicit overwrite confirmation. */
(() => {
  'use strict';
  const generate=document.getElementById('generate-descriptions');
  const stop=document.getElementById('stop-descriptions');
  const notice=document.getElementById('ai-description-status');
  if(!generate || !stop || !notice)return;
  const panel=document.getElementById('ai-description');
  const regen=document.createElement('button');
  regen.type='button';regen.id='regenerate-descriptions';regen.textContent='Regenerate All Descriptions';
  regen.title='Replace saved and unsaved descriptions only after reviewing a confirmation. Requires Save project to publish.';
  generate.insertAdjacentElement('afterend',regen);
  const errors=document.createElement('details');errors.id='ai-description-errors';errors.hidden=true;
  const summary=document.createElement('summary');summary.textContent='See Photo Errors';
  const errorList=document.createElement('ol');errors.append(summary,errorList);panel?.append(errors);
  let running=false,cancelled=false,active=null;

  function preparePreview(row) {
    const image=row.querySelector('img');
    if(!image?.src)return Promise.reject(Error('Photo preview is missing.'));
    return new Promise((resolve,reject)=>{
      const source=new Image();
      source.crossOrigin='anonymous';
      source.onload=()=>{
        if(!source.naturalWidth || !source.naturalHeight){reject(Error('Image dimensions are unavailable.'));return;}
        const canvas=document.createElement('canvas');
        const context=canvas.getContext('2d');
        if(!context){reject(Error('Canvas is unavailable.'));return;}
        // Try both progressively lower quality and smaller dimensions to avoid
        // failing on detailed/grainy photographs whose JPEGs compress poorly.
        const sizes=[896,768,640,512,384];
        const qualities=[0.75,0.6,0.45,0.32];
        let sizeIndex=0,qualityIndex=0;
        const done=(error,blob)=>{
          canvas.width=0;canvas.height=0;
          if(error)reject(error);else resolve(blob);
        };
        function encode(){
          const limit=sizes[sizeIndex];
          const scale=Math.min(1,limit/Math.max(source.naturalWidth,source.naturalHeight));
          const width=Math.max(1,Math.round(source.naturalWidth*scale));
          const height=Math.max(1,Math.round(source.naturalHeight*scale));
          if(canvas.width!==width || canvas.height!==height){
            canvas.width=width;canvas.height=height;
            context.drawImage(source,0,0,width,height);
          }
          try{
            canvas.toBlob(blob=>{
              if(!blob){done(Error('Could not encode the image preview.'));return;}
              if(blob.size<=900_000){done(null,blob);return;}
              if(qualityIndex<qualities.length-1){qualityIndex++;encode();return;}
              if(sizeIndex<sizes.length-1){sizeIndex++;qualityIndex=0;encode();return;}
              done(Error('Image preview exceeds 900 KB after resizing.'));
            },'image/jpeg',qualities[qualityIndex]);
          }catch(error){done(error);}
        }
        encode();
      };
      source.onerror=()=>reject(Error('Unable to load photo. Check R2 access and CORS.'));
      source.src=image.currentSrc||image.src;
    });
  }

  async function describe(blob) {
    active=new AbortController();
    const timeout=setTimeout(()=>active?.abort('timeout'),55000);
    try{
      const response=await fetch('/api/admin/describe',{
        method:'POST',body:blob,headers:{'Content-Type':'image/jpeg'},
        credentials:'same-origin',cache:'no-store',signal:active.signal
      });
      let body;
      try{body=await response.json();}
      catch{throw Object.assign(Error(`Description service returned HTTP ${response.status}, not JSON.`),{terminal:response.status>=500});}
      if(!response.ok){
        throw Object.assign(Error((body?.error||`AI request failed (HTTP ${response.status}).`)+(body?.code?` (${body.code})`:'')),{
          terminal:response.status===429 || response.status===503 || body?.code==='AI_BINDING',
          code:body?.code
        });
      }
      if(!body?.alt || typeof body.alt!=='string')throw Error('The model returned no usable alt text.');
      return body.alt.trim().slice(0,240);
    }catch(error){
      if(error?.name==='AbortError'){
        if(cancelled)throw error;
        throw Error('The AI request timed out. Try again.');
      }
      throw error;
    }finally{clearTimeout(timeout);active=null;}
  }

  function allRows() {
    return Array.from(document.querySelectorAll('#photos .photo-row'))
      .map((row,i)=>({row,i,field:row.querySelector('input[data-meta-field="alt"]')}))
      .filter(entry=>entry.field);
  }

  async function run(items,{overwrite=false,individual=false}={}) {
    if(running||!items.length)return;
    const count=items.length;
    const warning=overwrite
      ? `Regenerate ${count} image description(s)? Existing alt text will be replaced in your unsaved editor. Review every new description before Save project. Each photo uses a new billable AI request.`
      : `Generate ${count} missing description(s)? Reduced previews will be analyzed. The new text remains unsaved until Save project. Usage may be billed.`;
    if(!window.confirm(warning))return;
    running=true;cancelled=false;generate.disabled=true;regen.disabled=true;stop.hidden=false;
    let completed=0,failed=0,reason='';errors.hidden=true;errors.open=false;errorList.replaceChildren();
    try{
      for(const {row,i,field} of items){
        if(cancelled)break;
        if(!row.isConnected || !field.isConnected || (!overwrite && field.value.trim()))continue;
        notice.textContent=`Analyzing photo ${completed+failed+1} of ${count}…`;
        const original=field.value;
        try{
          const blob=await preparePreview(row);
          if(cancelled)break;
          const alt=await describe(blob);
          if(cancelled)break;
          // Do not overwrite a manual edit made while inference was running.
          if(field.isConnected && field.value===original){
            field.value=alt;
            field.dispatchEvent(new Event('input',{bubbles:true}));
            completed++;
          }
        }catch(error){
          if(cancelled)break;
          failed++;reason=error.message||'Unknown error';
          const item=document.createElement('li');item.textContent=`Photo ${i+1}: ${reason}`;errorList.append(item);
          errors.hidden=false;errors.open=true;
          if(error.terminal)break;
        }
      }
      const prefix=cancelled?'Stopped. ':'';
      notice.textContent=`${prefix}${completed} generated or replaced · ${failed} failed.`+
        (reason?` ${reason}`:'')+' Review each description, then Save project to publish.';
    }finally{running=false;generate.disabled=false;regen.disabled=false;stop.hidden=true;active=null;}
  }

  stop.addEventListener('click',()=>{cancelled=true;active?.abort();notice.textContent='Stopping…';});
  generate.addEventListener('click',()=>{
    const missing=allRows().filter(entry=>!entry.field.value.trim());
    if(!missing.length){notice.textContent='All photographs already have descriptions. Choose Regenerate all or use the Regenerate button beside a photo.';return;}
    run(missing);
  });
  regen.addEventListener('click',()=>{
    const rows=allRows();
    if(!rows.length){notice.textContent='There are no photo descriptions to regenerate.';return;}
    run(rows,{overwrite:true});
  });

  // Add a photo-specific regenerate action without modifying the existing editor implementation.
  function addButtons(){
    for(const {row,i,field} of allRows()){
      if(row.querySelector('.v33-photo-regenerate'))continue;
      const actions=row.querySelector('.photo-buttons')||row.querySelector('.photo-details');
      if(!actions)continue;
      const btn=document.createElement('button');btn.type='button';btn.className='v33-photo-regenerate';
      btn.textContent='Regenerate Alt';btn.title='Regenerate this photograph’s description';
      btn.addEventListener('click',()=>run([{row,i,field}],{overwrite:true,individual:true}));
      actions.append(btn);
    }
  }
  const photos=document.getElementById('photos');
  if(photos){
    let scheduled=false;
    const observer=new MutationObserver(()=>{
      if(scheduled)return;
      scheduled=true;queueMicrotask(()=>{scheduled=false;addButtons();});
    });
    observer.observe(photos,{childList:true,subtree:true});
    addButtons();
    window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
  }
})();
