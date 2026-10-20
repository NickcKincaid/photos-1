/* Owner-triggered AI photo descriptions. Nothing publishes until Save project. */
(() => {
  const generate=document.getElementById('generate-descriptions');
  const stop=document.getElementById('stop-descriptions');
  const notice=document.getElementById('ai-description-status');
  if(!generate || !stop || !notice)return;
  let cancel=false,running=false,active=null;
  function capturePreview(photoRow) {
    const image=photoRow.querySelector('img');
    if(!image?.src)return Promise.reject(Error('Photograph preview is missing.'));
    return new Promise((resolve,reject)=>{
      const photo=new Image();
      photo.onload=()=>{
        try{
          const scale=Math.min(1,640/Math.max(photo.naturalWidth,photo.naturalHeight));
          const c=document.createElement('canvas');
          c.width=Math.max(1,Math.round(photo.naturalWidth*scale));
          c.height=Math.max(1,Math.round(photo.naturalHeight*scale));
          c.getContext('2d').drawImage(photo,0,0,c.width,c.height);
          c.toBlob(blob=>blob?resolve(blob):reject(Error('Could not prepare photo for AI.')),'image/jpeg',0.75);
        }catch(error){reject(Error('Unable to read this photograph for AI. '+error.message));}
      };
      photo.onerror=()=>reject(Error('Unable to load this photo preview.'));
      photo.crossOrigin='anonymous';photo.src=image.src;
    });
  }
  stop.addEventListener('click',()=>{cancel=true;active?.abort();notice.textContent='Stopping after the current photograph…';});
  generate.addEventListener('click',async()=>{
    if(running)return;
    const rows=Array.from(document.querySelectorAll('#photos .photo-row'));
    const missing=rows.map((row,i)=>({row,i,field:row.querySelector('input[data-meta-field="alt"]')})).filter(x=>x.field && !x.field.value.trim());
    if(!missing.length){notice.textContent='Every photograph in this project already has a description.';return;}
    if(!confirm(`Generate image descriptions for ${missing.length} photograph(s) using Cloudflare Workers AI? The AI will analyze resized previews; this may incur usage charges. Nothing is published until you save the project.`))return;
    running=true;cancel=false;generate.disabled=true;stop.hidden=false;
    let finished=0,failed=0;
    try {
      for(const {row,i,field} of missing){
        if(cancel || !row.isConnected)break;
        if(field.value.trim())continue;
        notice.textContent=`Generating description ${finished+failed+1} of ${missing.length}…`;
        try{
          const blob=await capturePreview(row);
          if(cancel)break;
          active=new AbortController();
          const res=await fetch('/api/admin/describe',{method:'POST',body:blob,headers:{'Content-Type':'image/jpeg'},credentials:'same-origin',signal:active.signal});
          let data;try{data=await res.json();}catch{throw Error('Unexpected response from description service.');}
          if(!res.ok)throw Error(data.error || `AI request failed (HTTP ${res.status}).`);
          if(!cancel && field.isConnected && !field.value.trim()){
            field.value=data.alt;
            field.dispatchEvent(new Event('input',{bubbles:true}));
            finished++;
          }
        }catch(error){
          if(cancel)break;
          failed++;
          notice.textContent=`Photo ${i+1}: ${error.message}`;
          if(error.message.includes('not configured') || error.message.includes('license'))break;
        }finally{active=null;}
      }
      if(!cancel)notice.textContent=`${finished} description(s) generated · ${failed} failed. Review the wording and Save project to publish the alt text.`;
      else notice.textContent=`Stopped. ${finished} generated description(s) remain in the unsaved editor.`;
    }finally{running=false;generate.disabled=false;stop.hidden=true;active=null;}
  });
})();
