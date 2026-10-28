(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const requiredMeta = [['focal_length','Focal Length'],['aperture','Aperture'],['shutter_speed','Shutter Speed'],['iso','ISO']];
  const requiredKeys = new Set(requiredMeta.map(([key]) => key));
  const keys = [...requiredMeta,['camera','Camera'],['lens','Lens'],['alt','Image Description / Alt Text']];
  const examples = {focal_length:'35mm',aperture:'f/5.6',shutter_speed:'1/250s',iso:'ISO 400'};
  const formatExposure = (key, value) => window.PortfolioExposure.normalizeExposureValue(key, value);
  const missingMeta = photo => requiredMeta.filter(([key]) => !formatExposure(key,photo.meta?.[key]));
  let projects = [], current = null, photos = [], locked = false, dirty = false, orderDirty = false;
  let stagedSlug = null;
  const selectedPhotos = new Set();
  let imageCheck = 0, imageCheckAbort = null;
  const uploadJobs = [];
  let uploadRunning = false;
  let coverPosition={x:50,y:50};
  let socialImage='';
  let socialPosition={x:50,y:50};
  function validCoverPosition(pos) {
    return pos && Number.isInteger(pos.x) && Number.isInteger(pos.y) &&
      pos.x>=0 && pos.x<=100 && pos.y>=0 && pos.y<=100 ? {x:pos.x,y:pos.y} : {x:50,y:50};
  }
  function setCropPosition(x, y, mark=false) {
    coverPosition={x:Math.max(0,Math.min(100,Math.round(x))),y:Math.max(0,Math.min(100,Math.round(y)))};
    $('crop-x').value=String(coverPosition.x);
    $('crop-y').value=String(coverPosition.y);
    $('crop-x-value').textContent=coverPosition.x+'%';
    $('crop-y-value').textContent=coverPosition.y+'%';
    $('cover-crop-image').style.objectPosition=coverPosition.x+'% '+coverPosition.y+'%';
    if (mark) markDirty();
  }
  function updateCoverCrop() {
    const panel=$('cover-crop');
    panel.hidden=!photos.length;
    if (!photos.length) return;
    const cover=photos[0];
    $('cover-crop-image').src=cover.preview || cover.path;
    setCropPosition(coverPosition.x,coverPosition.y);
  }
  $('crop-x').addEventListener('input',()=>setCropPosition(Number($('crop-x').value),coverPosition.y,true));
  $('crop-y').addEventListener('input',()=>setCropPosition(coverPosition.x,Number($('crop-y').value),true));
  $('crop-reset').addEventListener('click',()=>setCropPosition(50,50,true));
  function setSocialPosition(x,y,mark=false) {
    socialPosition={x:Math.max(0,Math.min(100,Math.round(x))),y:Math.max(0,Math.min(100,Math.round(y)))};
    $('social-crop-x').value=String(socialPosition.x);
    $('social-crop-y').value=String(socialPosition.y);
    $('social-crop-x-value').textContent=socialPosition.x+'%';
    $('social-crop-y-value').textContent=socialPosition.y+'%';
    $('social-preview-image').style.objectPosition=socialPosition.x+'% '+socialPosition.y+'%';
    if(mark) markDirty();
  }
  $('social-crop-x').addEventListener('input',()=>setSocialPosition(Number($('social-crop-x').value),socialPosition.y,true));
  $('social-crop-y').addEventListener('input',()=>setSocialPosition(socialPosition.x,Number($('social-crop-y').value),true));
  $('social-crop-reset').addEventListener('click',()=>setSocialPosition(50,50,true));
  $('social-preview').addEventListener('click',e=>{
    const img=$('social-preview-image');const r=img.getBoundingClientRect();
    if(!r.width || !r.height || $('social-preview').hidden ||
       e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom)return;
    setSocialPosition(100*(e.clientX-r.left)/r.width,100*(e.clientY-r.top)/r.height,true);
  });
  $('cover-crop-preview').addEventListener('click',e=>{
    const r=e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    setCropPosition(100*(e.clientX-r.left)/r.width,100*(e.clientY-r.top)/r.height,true);
  });
  window.photoEditorHasPendingChanges = () => dirty || orderDirty || locked;
  // Discard only local, unpublished changes and the browser recovery draft.
  // Published GitHub project data and already-uploaded R2 objects are untouched.
  window.PortfolioDiscardChanges = () => {
    if (locked || uploadRunning) {
      window.alert('Wait for the current save or upload before canceling changes.');
      return false;
    }
    if (!window.confirm('Discard all unsaved project changes, including photo order, alt text, and metadata? Previously uploaded R2 files will not be deleted.')) return false;
    dirty = false;
    orderDirty = false;
    window.PortfolioDrafts?.clear?.('project', draftKey());
    window.location.reload();
    return true;
  };
  const slugify = value => value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'untitled';
  const localURLs = new Set();
  const validPixels = n => Number.isInteger(n) && n > 0 && n <= 40000;
  function status(message, type='') { const el=$('status');el.textContent=message;el.className='status '+type; }
  async function api(path, options={}) {
    // These operations may make several sequential GitHub calls; allow the save
    // to finish, but never leave the editor locked indefinitely on a dead link.
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),90000);
    try {
      const response=await fetch('/api/admin/'+path, {
        credentials:'same-origin',cache:'no-store',...options,signal:controller.signal
      });
      let body;
      try { body=await response.json(); }
      catch { throw Error(`The server returned HTTP ${response.status} without JSON for /api/admin/${path}. Check Cloudflare Pages Functions logs.`); }
      if (!response.ok) throw Error(body.error || `Request failed (${response.status})`);
      return body;
    } catch(error) {
      if(controller.signal.aborted) throw Error('The admin request timed out. Check whether GitHub saved your changes before retrying.');
      throw error;
    } finally {clearTimeout(timeout);}
  }
  function node(tag, className='', value='') { const el=document.createElement(tag);if(className)el.className=className;if(value)el.textContent=value;return el; }
  function cleanup() { for (const u of localURLs) URL.revokeObjectURL(u); localURLs.clear(); }
  function markDirty() { dirty = true; }
  function draftKey() {return current?.slug || 'new';}
  function persistDraft() {
    if (!dirty || locked || $('editor-form').hidden) return;
    const snapshot={title:$('project-title').value,blurb:$('project-blurb').value,
      order:$('project-order').value,published:$('project-published').checked,
      crop:{...coverPosition},socialImage,socialPosition:{...socialPosition},
      stagedSlug, photos:photos.map(({kind,path,meta,variants,width,height})=>({kind,path,meta,variants,width,height}))};
    window.PortfolioDrafts?.save('project',draftKey(),current?.revision,snapshot);
  }
  function tryRestoreDraft(project) {
    const draft=window.PortfolioDrafts?.read('project',draftKey());
    if(!draft) return;
    const stale=Boolean(project?.revision && draft.revision && project.revision!==draft.revision);
    const question=stale
      ? 'An unsaved local project draft exists, but GitHub has a newer version. Restore your local changes anyway? Review them before saving.'
      : 'Recover the unsaved changes to this project from this browser?';
    if(!window.confirm(question)) {window.PortfolioDrafts.clear('project',draftKey());return;}
    const v=draft.value;
    $('project-title').value=String(v.title||'').slice(0,120);
    $('project-blurb').value=String(v.blurb||'').slice(0,1000);
    $('project-order').value=v.order ?? $('project-order').value;
    $('project-published').checked=Boolean(v.published);
    coverPosition=validCoverPosition(v.crop);
    socialImage=typeof v.socialImage==='string' ? v.socialImage : '';
    socialPosition=validCoverPosition(v.socialPosition);
    if(!project && typeof v.stagedSlug==='string' && /^[a-z0-9-]{1,65}$/.test(v.stagedSlug)) stagedSlug=v.stagedSlug;
    if(Array.isArray(v.photos) && v.photos.length<=90 && v.photos.every(p=>
        ['existing','r2'].includes(p.kind) && /^\/media\/[a-zA-Z0-9_./-]+\.(?:jpg|jpeg|webp|png)$/i.test(p.path||'') && !(p.path||'').includes('..'))) {
      photos=v.photos.map(p=>({...p,preview:null, width:validPixels(p.width)?p.width:null,
        height:validPixels(p.height)?p.height:null}));
    }
    dirty=true;status('Recovered local draft. Review and click Save project to publish.','good');
  }
  setInterval(persistDraft,1800);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)persistDraft();});
  // Presentation names follow the current editor order; R2 storage paths and
  // stable photo IDs never change when the gallery is reordered.
  function displayFilename(photo, index) {
    const title = $('project-title').value.trim() || current?.title || 'untitled';
    const base = slugify(title).slice(0, 80);
    const count = Math.max(2, String(photos.length).length);
    const extension = /\.(webp|png|tiff?|jpe?g)$/i.exec(photo.path || '')?.[1]?.toLowerCase();
    const ext = extension === 'jpeg' || extension === 'jpg' || !extension ? 'jpg' : extension;
    return `${base}-${String(index + 1).padStart(count, '0')}.${ext}`;
  }
  function updateDeleteState() {
    const button = $('delete-project');
    button.hidden = !current?.slug;
    button.disabled = locked;
  }
  window.addEventListener('beforeunload', event => { if (dirty || orderDirty) { event.preventDefault(); event.returnValue = ''; } });
  // A project title can change on every keystroke. Update only text labels:
  // rebuilding up to 90 photo editors each time is slow on phones.
  function refreshPhotoLabels() {
    document.querySelectorAll('#photos .photo-name').forEach((el,i) => {
      el.textContent = (i === 0 ? 'Cover · ' : '') + displayFilename(photos[i], i);
    });
    const selected = document.querySelector('.project-btn.active');
    if (selected) {
      if (selected.firstChild) selected.firstChild.textContent = $('project-title').value.trim() || current?.title || '';
      const flag = selected.querySelector('small');
      if (flag) flag.textContent = 'Unsaved changes';
    }
  }
  $('project-title').addEventListener('input', () => { markDirty(); refreshPhotoLabels(); updateSocialPreview(); });
  $('project-blurb').addEventListener('input', markDirty);
  $('project-order').addEventListener('input', markDirty);
  $('project-published').addEventListener('change', markDirty);
  function openProject(project, force=false) {
    if (locked && !force) return;
    if (!force && dirty) {
      if (!window.confirm('Discard unsaved changes to this project?')) return;
      window.PortfolioDrafts?.clear('project',draftKey());
    }
    if (imageCheckAbort) imageCheckAbort.abort();
    imageCheck++; imageCheckAbort=null;
    $('image-check-results').replaceChildren();
    $('image-check-status').textContent='Checks originals and thumbnails without modifying R2.';
    selectedPhotos.clear();
    uploadJobs.length=0;renderUploadQueue();
    updateBulkState();
    cleanup(); current=project || null; stagedSlug = null;
    dirty = false;
    coverPosition=validCoverPosition(project?.cover_position);
    socialImage=typeof project?.social_image==='string' ? project.social_image : '';
    socialPosition=validCoverPosition(project?.social_position);
    photos=[];
    if (project) {
      const overrides=new Map((project.photo_details || []).map(x => [x.image, x]));
      const paths=[project.cover,...(project.gallery || [])].filter(Boolean).filter((p,i,a)=>a.indexOf(p)===i);
      photos=paths.map(path=>{
        const info = overrides.get(path) || {};
        return {kind:'existing',path,meta:{...info},
          width:validPixels(info.width)?info.width:null,
          height:validPixels(info.height)?info.height:null};
      });
    }
    $('project-title').value=project?.title || '';
    $('project-blurb').value=typeof project?.blurb === 'string' ? project.blurb : '';
    $('project-order').value=Number.isFinite(Number(project?.order)) ? Number(project.order): (projects.length+1);
    $('project-published').checked=project ? Boolean(project.published):false;
    $('editor-form').hidden=false;
    status(project ? 'Editing project. Changes appear after Cloudflare redeploys.' : 'New project. Add photos and save when ready.');
    if (!project) document.querySelector('[data-panel="uploads"]')?.setAttribute('open','');
    tryRestoreDraft(project);
    renderList();renderPhotos();updateDeleteState();
  }
  function updateOrderState() {
    const save = $('save-order');
    save.hidden = !orderDirty;
    save.disabled = locked || !orderDirty;
  }
  function reorderProject(from,to) {
    if (locked || from === to || from < 0 || to < 0 || from >= projects.length || to >= projects.length) return;
    const moved = projects.splice(from,1)[0];
    projects.splice(to,0,moved);
    orderDirty=true;
    updateOrderState();
    renderList();
    status('Project order changed. Click Save project order to publish.');
  }
  function renderList() {
    const container=$('project-list');container.replaceChildren();
    if (!projects.length) container.appendChild(node('p','muted','No projects yet'));
    projects.forEach((project, index) => {
      const wrap=node('div','project-entry');wrap.draggable = !locked;
      wrap.dataset.slug=project.slug;
      const selected = current?.slug === project.slug;
      const shownTitle = selected && dirty ? $('project-title').value.trim() || project.title : project.title;
      const btn=node('button','project-btn'+(selected?' active':''),shownTitle || project.slug);
      const report=window.PortfolioTools.metadataReport(project);
      const incomplete=report.missing ? ` · ${report.missing}/${report.total} missing settings` : '';
      const small=node('small',report.missing?'needs-metadata':'',selected && dirty ? 'Unsaved changes'+incomplete : (project.published?'Published':'Draft')+incomplete);
      btn.appendChild(small);
      btn.type='button';btn.addEventListener('click',()=>openProject(project));wrap.appendChild(btn);
      for (const [label,offset] of [['↑',-1],['↓',1]]) {
        const b=node('button','project-move',label);
        b.type='button';b.disabled=locked || index+offset<0 || index+offset>=projects.length;
        b.setAttribute('aria-label',(offset<0?'Move ':'Move ')+(project.title||project.slug)+(offset<0?' earlier':' later'));
        b.addEventListener('click',()=>reorderProject(index,index+offset));wrap.appendChild(b);
      }
      wrap.addEventListener('dragstart',event=>{
        if (locked || event.target.closest('button') && event.target.closest('button') !== btn) {event.preventDefault();return;}
        event.dataTransfer.setData('text/plain',project.slug);
        event.dataTransfer.effectAllowed='move';wrap.classList.add('dragging');
      });
      wrap.addEventListener('dragend',()=>wrap.classList.remove('dragging'));
      wrap.addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect='move';wrap.classList.add('drag-over');});
      wrap.addEventListener('dragleave',()=>wrap.classList.remove('drag-over'));
      wrap.addEventListener('drop',event=>{
        event.preventDefault();wrap.classList.remove('drag-over');
        const source=projects.findIndex(p=>p.slug===event.dataTransfer.getData('text/plain'));
        const destination=projects.findIndex(p=>p.slug===project.slug);
        reorderProject(source,destination);
      });
      container.appendChild(wrap);
    });
    updateOrderState();
    updateMetadataOverview();
  }
  function updateMetadataOverview() {
    const aggregate=projects.map(p=>window.PortfolioTools.metadataReport(p));
    const photosTotal=aggregate.reduce((sum,r)=>sum+r.total,0);
    const missingTotal=aggregate.reduce((sum,r)=>sum+r.missing,0);
    $('metadata-overview').textContent=`${projects.length} projects · ${photosTotal} photos · ${missingTotal} missing settings`;
    $('review-missing').hidden=!missingTotal;
  }
  $('review-missing').addEventListener('click',()=>{
    const first=projects.find(p=>window.PortfolioTools.metadataReport(p).missing>0);
    if(!first) return;
    openProject(first);
    if(current?.slug!==first.slug)return;
    const incomplete=photos.findIndex(p=>missingMeta(p).length);
    if(incomplete<0)return;
    const row=$('photos').children[incomplete];
    document.querySelector('[data-panel="photo-list"]')?.setAttribute('open','');
    const details=row?.querySelector('details');if(details)details.open=true;
    const key=missingMeta(photos[incomplete])[0][0];
    row?.querySelector(`input[data-meta-field="${key}"]`)?.focus();
    row?.scrollIntoView({block:'center',behavior:'smooth'});
  });
  $('save-order').addEventListener('click',async()=>{
    if(!orderDirty || locked) return;
    // Project ordering is a separate save, and never discards editor changes.
    locked=true;updateOrderState();$('publish').disabled=true;
    try {
      status('Saving project order…');
      await api('reorder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        slugs:projects.map(p=>p.slug),revisions:Object.fromEntries(projects.map(p=>[p.slug,p.revision]))
      })});
      orderDirty=false;
      window.dispatchEvent(new Event('portfolio-published'));
      // Read the new GitHub SHA values after this commit. Leaving old revisions
      // here would make the next legitimate project save fail as stale.
      const fresh=await api('projects');
      const bySlug=new Map(fresh.projects.map(p=>[p.slug,p]));
      projects=projects.map((p,i)=>({...bySlug.get(p.slug),order:i+1}));
      if(current?.slug) current=bySlug.get(current.slug)||current;
      $('project-order').value=current ? projects.find(p=>p.slug===current.slug)?.order ?? 1 : $('project-order').value;
      status('Project order saved. Cloudflare will republish shortly.','good');
    } catch(err) {status(err.message,'error');}
    finally {locked=false;$('publish').disabled=false;renderList();}
  });
  function move(i,d) {const next=i+d;if(next<0 || next>=photos.length)return;[photos[i],photos[next]]=[photos[next],photos[i]];if(i===0 || next===0)coverPosition={x:50,y:50};markDirty();renderPhotos();}
  function updateBulkState() {
    const active=photos.filter(p=>selectedPhotos.has(p.path)).length;
    $('bulk-editor').hidden=!photos.length;
    $('bulk-count').textContent=`${active} selected`;
    for(const id of ['bulk-clear','bulk-first','bulk-last','bulk-remove','bulk-apply']) $(id).disabled=locked || !active;
    $('bulk-select-all').disabled=locked || !photos.length;
  }
  $('bulk-select-all').addEventListener('click',()=>{photos.forEach(p=>selectedPhotos.add(p.path));renderPhotos();});
  $('bulk-clear').addEventListener('click',()=>{selectedPhotos.clear();renderPhotos();});
  for(const [id,position] of [['bulk-first','first'],['bulk-last','last']]) {
    $(id).addEventListener('click',()=>{
      if(locked || !selectedPhotos.size)return;
      const first=photos[0]?.path;
      photos=window.PortfolioTools.reorderedPhotos(photos,selectedPhotos,position);
      if(photos[0]?.path!==first)coverPosition={x:50,y:50};
      markDirty();renderPhotos();
    });
  }
  $('bulk-remove').addEventListener('click',()=>{
    if(locked || !selectedPhotos.size)return;
    const count=photos.filter(p=>selectedPhotos.has(p.path)).length;
    if(!count || !window.confirm(`Remove ${count} selected photograph(s) from this project? Changes are applied only after Save project.`))return;
    const first=photos[0]?.path;
    photos=photos.filter(p=>!selectedPhotos.has(p.path));
    selectedPhotos.clear();
    if(photos[0]?.path!==first)coverPosition={x:50,y:50};
    markDirty();renderPhotos();
  });
  $('bulk-apply').addEventListener('click',()=>{
    if(locked || !selectedPhotos.size)return;
    const key=$('bulk-field').value;
    let value=$('bulk-value').value.trim();
    if(!keys.some(([name])=>name===key) || key==='alt')return;
    if(!value){status('Enter a setting value before applying it.','error');$('bulk-value').focus();return;}
    if(requiredKeys.has(key)) {
      const formatted=formatExposure(key,value);
      if(formatted===null){status(`Invalid ${key.replaceAll('_',' ')}. Example: ${examples[key]}.`,'error');$('bulk-value').focus();return;}
      value=formatted;$('bulk-value').value=value;
    }
    if(!window.confirm(`Overwrite ${key.replaceAll('_',' ')} for ${selectedPhotos.size} selected photograph(s)?`))return;
    for(const photo of photos)if(selectedPhotos.has(photo.path)){
      photo.meta??={};photo.meta[key]=value;
    }
    markDirty();renderPhotos();
    status('Batch setting applied. Review the photographs, then Save project.','good');
  });
  $('check-images').addEventListener('click',async()=>{
    if(imageCheckAbort) {imageCheckAbort.abort();imageCheckAbort=null;return;}
    if(locked){$('image-check-status').textContent='Finish your current upload or save before checking image links.';return;}
    if(!photos.length){$('image-check-status').textContent='No photographs to check.';return;}
    const assets=window.PortfolioTools.imageLinks(photos);
    if(!assets.length){$('image-check-status').textContent='No valid image URLs to check.';return;}
    const run=++imageCheck, controller=new AbortController();imageCheckAbort=controller;
    const button=$('check-images');button.textContent='Stop Image Check';
    $('image-check-results').replaceChildren();
    $('image-check-status').textContent=`Checking 0 of ${assets.length} URLs…`;
    try {
      const result=await window.PortfolioTools.checkImages(assets,{signal:controller.signal,
        onProgress:(done,total)=>{if(run===imageCheck)$('image-check-status').textContent=`Checking ${done} of ${total} URLs…`;}});
      if(run!==imageCheck || controller.signal.aborted)return;
      const failed=result.filter(x=>!x.ok);
      $('image-check-status').textContent=failed.length
        ? `${result.length-failed.length} OK · ${failed.length} failed. Check the links below and retry if Cloudflare was temporarily unavailable.`
        : `All ${result.length} checked image links responded successfully.`;
      for(const issue of failed){
        const li=node('li','',`Photo ${issue.number}, ${issue.variant}: HTTP ${issue.status||'network error'} — `);
        const a=node('a','','Open image');a.href=issue.path;a.target='_blank';a.rel='noopener noreferrer';li.appendChild(a);
        $('image-check-results').appendChild(li);
      }
    }catch(error){if(run===imageCheck)$('image-check-status').textContent='Image check failed: '+error.message;}
    finally{if(run===imageCheck){imageCheckAbort=null;button.textContent="Check Project Image Links";}}
  });
  function updateSocialPreview() {
    const box=$('social-preview');if(!box)return;
    const chosen=photos.find(p=>p.path===socialImage)||photos[0];
    box.hidden=!chosen;
    $('social-crop-sliders').hidden=!chosen;
    if(!chosen)return;
    $('social-preview-image').src=chosen.preview || chosen.path;
    $('social-preview-title').textContent=$('project-title').value.trim()||current?.title||'Untitled';
    setSocialPosition(socialPosition.x,socialPosition.y);
  }
  function renderSocialImages() {
    const field=$('social-image');if(!field)return;
    field.replaceChildren();
    const def=node('option','','Use Homepage Cover');def.value='';field.appendChild(def);
    photos.forEach((photo,i)=>{
      const opt=node('option','',displayFilename(photo,i));opt.value=photo.path;field.appendChild(opt);
    });
    if(!photos.some(p=>p.path===socialImage)) socialImage='';
    field.value=socialImage;
    updateSocialPreview();
  }
  $('social-image').addEventListener('change', e=>{socialImage=e.target.value;socialPosition={x:50,y:50};markDirty();updateSocialPreview();});
  async function makeSharingCard(source, position, slug) {
    // Social networks fetch og:image directly. CSS object-position alone would
    // not alter the shared image, so render the exact crop once on Save.
    const img=new Image();
    img.decoding='async';
    const loaded=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('Sharing photo took too long to load. Try again.')),20000);
      img.onload=()=>{clearTimeout(timeout);resolve();};
      img.onerror=()=>{clearTimeout(timeout);reject(Error('Could not load the selected sharing photo.'));};
    });
    img.src=source;
    await loaded;
    if(!img.naturalWidth || !img.naturalHeight)throw Error('Invalid sharing photograph.');
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=630;
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image crop is unavailable in this browser.');
    const scale=Math.max(canvas.width/img.naturalWidth,canvas.height/img.naturalHeight);
    const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
    ctx.drawImage(img,(canvas.width-w)*position.x/100,(canvas.height-h)*position.y/100,w,h);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not create sharing image.')),'image/jpeg',0.87));
    // Keep the same bounded upload API as ordinary R2 photos.
    if(blob.size>3000000)throw Error('Sharing crop exceeds the 3 MB upload limit.');
    const resp=await fetch('/api/admin/upload',{method:'POST',credentials:'same-origin',
      headers:{'content-type':'image/jpeg','X-Photo-Project':slug,'X-Photo-Variant':'social'},body:blob});
    let result;try{result=await resp.json();}catch{throw Error('Sharing image upload did not return JSON.');}
    if(!resp.ok || !result?.path)throw Error(result?.error||'Sharing image upload failed.');
    return {path:result.path,source,position:{...position}};
  }
  function validatePhotoMetadata() {
    for (const [index, photo] of photos.entries()) {
      photo.meta ??= {};
      const row = $('photos').children[index];
      const problems=[];
      for (const [key,label] of requiredMeta) {
        const field=row?.querySelector(`input[data-meta-field="${key}"]`);
        // Keep any still-focused input synchronized with the stored draft.
        const raw=field ? field.value : photo.meta[key];
        const formatted=formatExposure(key,raw);
        if(!formatted || formatted===null){problems.push({key,label,invalid:formatted===null});if(field)field.setAttribute('aria-invalid','true');}
        else {photo.meta[key]=formatted;if(field){field.value=formatted;field.setAttribute('aria-invalid','false');}}
      }
      if(!problems.length)continue;
      document.querySelector('[data-panel="photo-list"]')?.setAttribute('open','');
      const details=row?.querySelector('details');
      if(details)details.open=true;
      const first=problems[0];
      row?.querySelector(`input[data-meta-field="${first.key}"]`)?.focus();
      status(`Photo ${index+1}: ${first.invalid?'correct invalid':'enter missing'} ${problems.map(x=>x.label).join(', ')}. Use formats like 35mm, f/8, 1/250s and ISO 400.`, 'error');
      return false;
    }
    return true;
  }
  function renderPhotos() {
    updateCoverCrop();
    renderSocialImages();
    for(const key of [...selectedPhotos])if(!photos.some(p=>p.path===key))selectedPhotos.delete(key);
    updateBulkState();
    const container=$('photos');container.replaceChildren();
    if(!photos.length) {container.appendChild(node('p','empty','No photographs yet. Add images above.'));return;}
    photos.forEach((photo,i)=>{
      const row=node('div','photo-row');const img=node('img');img.alt=`Photograph ${i+1}`;
      img.src=photo.preview || photo.path;img.loading='lazy';
      // Learn dimensions from older R2 photographs as the editor displays them.
      // They will be persisted on the next explicit Save, not via an auto-commit.
      const learnOriginalDimensions = () => {
        // Never replace a full-resolution measurement with the 360px local preview.
        if (!photo.preview && !(validPixels(photo.width) && validPixels(photo.height)) &&
            validPixels(img.naturalWidth) && validPixels(img.naturalHeight)) {
          photo.width=img.naturalWidth;photo.height=img.naturalHeight;
        }
      };
      img.addEventListener('load',learnOriginalDimensions,{once:true});
      if (img.complete && img.naturalWidth) learnOriginalDimensions();
      row.appendChild(img);
      const detail=node('div','photo-details');
      const select=node('label','photo-select');
      const check=node('input');check.type='checkbox';check.checked=selectedPhotos.has(photo.path);check.disabled=locked;
      check.setAttribute('aria-label',`Select photograph ${i+1} for batch editing`);
      check.addEventListener('change',()=>{if(check.checked){selectedPhotos.add(photo.path);document.querySelector('[data-panel="batch-edit"]')?.setAttribute('open','');}else selectedPhotos.delete(photo.path);updateBulkState();});
      select.appendChild(check);select.appendChild(node('span','','Select for Batch Edit'));detail.appendChild(select);
      const name=node('p','photo-name', (i===0?'Cover · ':'')+displayFilename(photo, i));
      detail.appendChild(name);
      const buttons=node('div','photo-buttons');
      for(const [title,func] of [['↑',()=>move(i,-1)],['↓',()=>move(i,1)],['Remove',()=>{photos.splice(i,1);if(i===0)coverPosition={x:50,y:50};markDirty();renderPhotos();}]]) {
        const b=node('button','',title);b.type='button';b.disabled=locked;b.addEventListener('click',func);buttons.appendChild(b);
      }
      detail.appendChild(buttons);
      const more=node('details');
      const summary=node('summary');more.appendChild(summary);
      const grid=node('div','meta-fields');
      const refreshMetaStatus = () => {
        const missing=missingMeta(photo);
        summary.textContent=missing.length
          ? `Exposure Settings Required — Missing ${missing.map(([,label])=>label).join(', ')}`
          : 'Exposure Settings Complete · Optional Camera, Lens, and Description';
        more.classList.toggle('metadata-incomplete',Boolean(missing.length));
      };
      for(const [key,label] of keys){
        const wrap=node('label');
        wrap.appendChild(node('span','',label+(requiredKeys.has(key)?' *':'')));
        const field=node('input');field.value=photo.meta?.[key]??'';
        field.maxLength=key==='alt'?250:180;
        field.dataset.metaField=key;
        if (requiredKeys.has(key)) {
          // A closed <details> makes browser-native required validation impossible to focus.
          // Validate explicitly on Save and expand/focus the first missing field.
          field.setAttribute('aria-required','true');
          field.placeholder=examples[key];
        }
        const updateField = () => {
          photo.meta??={};photo.meta[key]=field.value;
          if (requiredKeys.has(key)) field.setAttribute('aria-invalid',String(!formatExposure(key,field.value)));
          refreshMetaStatus();markDirty();
        };
        if (requiredKeys.has(key)) {
          field.setAttribute('aria-invalid',String(!formatExposure(key,field.value)));
          field.addEventListener('blur',()=>{
            const formatted=formatExposure(key,field.value);
            if(formatted !== null && formatted !== field.value){field.value=formatted;updateField();}
            else if(formatted===null){field.setAttribute('aria-invalid','true');}
          });
        }
        field.addEventListener('input',updateField);
        wrap.appendChild(field);grid.appendChild(wrap);
      }
      refreshMetaStatus();
      more.appendChild(grid);detail.appendChild(more);row.appendChild(detail);container.appendChild(row);
    });
  }
  async function loadProjects(selectSlug) {
    const {projects:items}=await api('projects');projects=items;
    const match=selectSlug ? projects.find(p=>p.slug===selectSlug):projects[0];openProject(match||null,true);
    if(!items.length) status('Start by creating a new project.');
  }
  $('add-project').addEventListener('click',()=>openProject(null));
  function renderUploadQueue() {
    const panel=$('upload-queue');panel.replaceChildren();panel.hidden=!uploadJobs.length;
    for(const job of uploadJobs) {
      const line=node('div','upload-job');
      const name=node('span',job.state==='failed'?'upload-failed':job.state==='done'?'upload-done':'',
        `${job.file.name} — ${job.state}${job.error?' ('+job.error+')':''}`);
      const bar=node('progress');bar.max=100;bar.value=job.progress;
      const actions=node('div');
      if(job.state==='failed'){
        const retry=node('button','','Retry');retry.type='button';retry.disabled=uploadRunning;
        retry.addEventListener('click',()=>{
          if(uploadRunning)return;
          job.state='queued';job.progress=0;job.error='';renderUploadQueue();runUploadQueue();
        });
        actions.appendChild(retry);
      }
      if(job.state==='failed' || job.state==='queued'){
        const remove=node('button','',job.state==='failed'?'Dismiss':'Remove');remove.type='button';remove.disabled=uploadRunning;
        remove.addEventListener('click',()=>{
          if(uploadRunning)return;
          uploadJobs.splice(uploadJobs.indexOf(job),1);renderUploadQueue();
        });
        actions.appendChild(remove);
      }
      line.append(name,bar,actions);panel.appendChild(line);
    }
  }
  function sendUpload(blob,headers,onProgress) {
    return new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest();xhr.open('POST','/api/admin/upload');xhr.responseType='text';xhr.withCredentials=true;
      // A dropped connection can otherwise lock the entire photo queue forever.
      xhr.timeout=120000;
      xhr.ontimeout=()=>reject(Error('Photo upload timed out. Check your connection and retry this photograph.'));
      for(const [key,value] of Object.entries(headers))xhr.setRequestHeader(key,value);
      xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.min(99,Math.round(e.loaded/e.total*100)));};
      xhr.onerror=()=>reject(Error('Upload connection failed. Check your internet connection and retry.'));
      xhr.onabort=()=>reject(Error('Upload interrupted. Retry this photograph.'));
      xhr.onload=()=>{
        let data;try{data=JSON.parse(xhr.responseText);}catch{reject(Error(`Upload returned HTTP ${xhr.status} without JSON.`));return;}
        if(xhr.status<200 || xhr.status>=300){reject(Error(data.error||`Upload returned HTTP ${xhr.status}`));return;}
        onProgress(100);resolve(data);
      };
      xhr.send(blob);
    });
  }
  async function runUploadQueue() {
    if(uploadRunning || locked)return;
    const work=uploadJobs.filter(job=>job.state==='queued');if(!work.length)return;
    uploadRunning=true;locked=true;$('publish').disabled=true;$('photo-files').disabled=true;
    let completed=0,failed=0,warning=0;
    try {
      for(const job of work) {
        job.state='preparing';job.error='';renderUploadQueue();
        let preview=null;
        try {
          const result=await window.PhotoPrep.prepare(job.file);
          const smallPreview=await window.PhotoPrep.preview(result.blob);
          preview=URL.createObjectURL(smallPreview);localURLs.add(preview);
          const slug=current?.slug || slugify($('project-title').value.trim());
          if (!current?.slug && !stagedSlug) stagedSlug=slug;
          if (!current?.slug && stagedSlug!==slug) throw Error('Keep the original project name until you save uploaded photos.');
          job.state='uploading';renderUploadQueue();
          const upload=await sendUpload(result.blob,{'Content-Type':'image/jpeg','X-Photo-Project':slug,
            'X-Photo-Position':String(photos.length+1)},value=>{if(value===100 || value-job.progress>=5){job.progress=value;renderUploadQueue();}});
          const variants=[];
          try {
            for (const v of await window.PhotoPrep.variants(result.blob)) {
              if (![640,1280].includes(v.width))continue;
              const thumb=await sendUpload(v.blob,{'Content-Type':'image/webp','X-Photo-Project':slug,
                'X-Photo-Variant':String(v.width),'X-Photo-Source':upload.path},()=>{});
              variants.push({url:thumb.path,width:thumb.width});
            }
          }catch(error){warning++;job.error='Thumbnails incomplete; original saved';}
          photos.push({kind:'r2',path:upload.path,variants,width:result.width,height:result.height,
            meta:{...result.meta,storage:'r2'},filename:upload.path.split('/').pop(),preview});
          job.state='done';job.progress=100;completed++;markDirty();renderPhotos();
        }catch(error){if(preview){URL.revokeObjectURL(preview);localURLs.delete(preview);}job.state='failed';job.error=String(error.message||error).slice(0,200);failed++;}
        renderUploadQueue();
      }
      status(failed
        ? `${completed} uploaded; ${failed} failed. Use Retry next to each failed photograph, then Save project.`
        : warning ? `${completed} uploaded. ${warning} photo(s) missing thumbnails; originals work. Review and Save project.`
        : `${completed} uploaded. Review metadata and click Save project.`,failed||warning?'error':'good');
    }finally{
      uploadRunning=false;locked=false;$('publish').disabled=false;$('photo-files').disabled=false;
      renderUploadQueue();renderPhotos();
    }
  }
  $('photo-files').addEventListener('change', e=>{
    const chosen=Array.from(e.target.files||[]);$('photo-files').value='';
    if(!chosen.length || locked)return;
    if(!current?.slug && !$('project-title').value.trim()){status('Name your project before uploading photos.','error');return;}
    const queued=uploadJobs.filter(j=>j.state==='queued'||j.state==='failed').length;
    if(photos.length+queued+chosen.length>90){status('Maximum 90 photographs per project.','error');return;}
    chosen.forEach(file=>uploadJobs.push({file,state:'queued',progress:0,error:''}));
    renderUploadQueue();runUploadQueue();
  });
  $('preview-project').addEventListener('click',()=>{
    const dialog=$('draft-preview');
    $('draft-preview-title').textContent=$('project-title').value.trim() || 'Untitled project';
    const gallery=$('draft-preview-photos');gallery.replaceChildren();
    for (const [i,photo] of photos.entries()) {
      const fig=node('figure');const img=node('img');
      img.src=photo.preview || photo.path;
      img.alt=photo.meta?.alt || `Photograph ${i+1}`;
      img.loading=i===0?'eager':'lazy';fig.appendChild(img);
      const caption = window.PortfolioExposure.exposureCaption(photo.meta);
      if(caption)fig.appendChild(node('figcaption','',caption));
      gallery.appendChild(fig);
    }
    const blurb = $('project-blurb').value.trim();
    if (blurb) {
      const aside = node('aside', 'draft-preview-blurb');
      aside.setAttribute('aria-label', 'About this project');
      for (const paragraph of blurb.split(/\n\s*\n/).filter(s => s.trim())) {
        aside.appendChild(node('p', '', paragraph.trim()));
      }
      gallery.appendChild(aside);
    }
    if(!photos.length)gallery.appendChild(node('p','muted','No photographs added.'));
    dialog.showModal();
  });
  $('close-preview').addEventListener('click',()=>$('draft-preview').close());
  $('editor-form').addEventListener('submit',async e=>{
    e.preventDefault();if(locked)return;
    if (orderDirty) { status('Save project order before saving this project.', 'error'); return; }
    if (uploadJobs.some(job=>job.state==='failed'||job.state==='queued')) {
      status('Retry or dismiss failed photo uploads before saving, so none are forgotten.','error');
      document.querySelector('[data-panel="uploads"]')?.setAttribute('open','');
      $('upload-queue').scrollIntoView({block:'center'});return;
    }
    const title=$('project-title').value.trim();
    if(!title){status('Enter a project title.','error');return;}
    if (!validatePhotoMetadata()) return;
    locked=true;$('publish').disabled=true;
    if (!current?.slug && stagedSlug && slugify(title)!==stagedSlug) {
      locked=false;$('publish').disabled=false;
      status('The project name changed after uploading. Use the original name, save, then rename it.','error');return;
    }
    const input={slug:current?.slug||null,revision:current?.revision||null,title,blurb:$('project-blurb').value,social_image:socialImage,
      cover_position:coverPosition,social_position:socialPosition,order:Number($('project-order').value),published:$('project-published').checked,
      photos:photos.map(({kind,path,sha,meta,variants,width,height})=>({kind,...(kind==='new'?{sha}:{path}),meta,
        ...(validPixels(width)&&validPixels(height)?{width,height}:{}),...(variants?{variants}:{})}))};
    try{
      const shareSource=photos.find(p=>p.path===socialImage)||photos[0];
      if(shareSource){
        const existing=current?.social_card;
        const same=existing?.source===shareSource.path && existing?.position?.x===socialPosition.x &&
          existing?.position?.y===socialPosition.y && typeof existing.path==='string';
        if(same)input.social_card=existing;
        else{
          status('Preparing and uploading the cropped sharing image…');
          input.social_card=await makeSharingCard(shareSource.path,socialPosition,current?.slug||stagedSlug||slugify(title));
        }
      }else input.social_card=null;
      status('Saving project data in GitHub (photos are already in R2)…');
      const saved=await api('save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
      dirty=false;
      orderDirty=false;
      window.dispatchEvent(new Event('portfolio-published'));
      window.PortfolioDrafts?.clear('project',draftKey());
      try {
        await loadProjects(saved.slug);
        status(saved.cleanupWarning || 'Project saved. Cloudflare will publish shortly. Photographs are in R2.',saved.cleanupWarning?'error':'good');
      } catch(refreshError) {
        status('Project saved in GitHub, but the editor could not refresh: '+refreshError.message+'. Reload the dashboard to see the latest revision.','error');
      }
    } catch(err){status(err.message,'error');}
    finally{locked=false;$('publish').disabled=false;renderList();renderPhotos();}
  });
  $('delete-project').addEventListener('click', async () => {
    if (locked || !current?.slug) return;
    if (dirty || orderDirty) {
      status('Save or discard unsaved changes before deleting this project.', 'error');
      return;
    }
    const project = current;
    const title = String(project.title || '').trim();
    const typed = window.prompt(
      `Delete "${title}" and its photographs from the website?\n` +
      'This cannot be undone in the editor. Older copies may remain in Git history.\n\n' +
      `Type the project name exactly to confirm: ${title}`
    );
    if (typed === null) return;
    if (typed.trim() !== title) { status('Delete cancelled: project name did not match.', 'error'); return; }
    locked = true;
    $('publish').disabled = true;
    updateDeleteState();
    try {
      status(`Deleting ${title} and its project images…`);
      const result = await api('delete', {method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({slug:project.slug, revision:project.revision, confirmTitle:title})});
      dirty=false;
      orderDirty=false;
      window.dispatchEvent(new Event('portfolio-published'));
      window.PortfolioDrafts?.clear('project',draftKey());
      await loadProjects();
      status(result.r2Warning || `Deleted ${title}. GitHub photos removed: ${result.deletedPhotos}; R2 objects removed: ${result.deletedR2 ?? 0}. Cloudflare will redeploy shortly.`,result.r2Warning?'error':'good');
    } catch (err) { status('Delete failed: '+err.message, 'error'); }
    finally { locked=false; $('publish').disabled=false; updateDeleteState(); renderList(); }
  });
  loadProjects().catch(err=>{status('Unable to load: '+err.message,'error');$('editor-form').hidden=true;});
})();
