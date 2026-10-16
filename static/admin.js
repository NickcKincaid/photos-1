(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const keys = [['camera','Camera'],['lens','Lens'],['focal_length','Focal length'],['aperture','Aperture'],['shutter_speed','Shutter speed'],['iso','ISO'],['alt','Image description / alt text']];
  let projects = [], current = null, photos = [], locked = false, dirty = false, orderDirty = false;
  let stagedSlug = null;
  let coverPosition={x:50,y:50};
  let socialImage='';
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
  $('cover-crop-preview').addEventListener('click',e=>{
    const r=e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    setCropPosition(100*(e.clientX-r.left)/r.width,100*(e.clientY-r.top)/r.height,true);
  });
  window.photoEditorHasPendingChanges = () => dirty || orderDirty || locked;
  const slugify = value => value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'untitled';
  const localURLs = new Set();
  function status(message, type='') { const el=$('status');el.textContent=message;el.className='status '+type; }
  async function api(path, options={}) {
    const response = await fetch('/api/admin/'+path, { credentials:'same-origin', cache:'no-store', ...options });
    let body; try { body=await response.json(); } catch { throw Error(`Cloudflare returned HTTP ${response.status} before the uploader could respond. Check Pages Functions logs for /api/admin/upload.`); }
    if (!response.ok) throw Error(body.error || `Request failed (${response.status})`);
    return body;
  }
  function node(tag, className='', value='') { const el=document.createElement(tag);if(className)el.className=className;if(value)el.textContent=value;return el; }
  function cleanup() { for (const u of localURLs) URL.revokeObjectURL(u); localURLs.clear(); }
  function markDirty() { dirty = true; }
  function draftKey() {return current?.slug || 'new';}
  function persistDraft() {
    if (!dirty || locked || $('editor-form').hidden) return;
    const snapshot={title:$('project-title').value,blurb:$('project-blurb').value,
      order:$('project-order').value,published:$('project-published').checked,
      crop:{...coverPosition},socialImage,
      stagedSlug, photos:photos.map(({kind,path,meta,variants})=>({kind,path,meta,variants}))};
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
    if(!project && typeof v.stagedSlug==='string' && /^[a-z0-9-]{1,65}$/.test(v.stagedSlug)) stagedSlug=v.stagedSlug;
    if(Array.isArray(v.photos) && v.photos.length<=90 && v.photos.every(p=>
        ['existing','r2'].includes(p.kind) && /^\/media\/[a-zA-Z0-9_./-]+\.(?:jpg|jpeg|webp|png)$/i.test(p.path||'') && !(p.path||'').includes('..'))) {
      photos=v.photos.map(p=>({...p,preview:null}));
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
    if (!force && dirty && !window.confirm('Discard unsaved changes to this project?')) return;
    cleanup(); current=project || null; stagedSlug = null;
    dirty = false;
    coverPosition=validCoverPosition(project?.cover_position);
    socialImage=typeof project?.social_image==='string' ? project.social_image : '';
    photos=[];
    if (project) {
      const overrides=new Map((project.photo_details || []).map(x => [x.image, x]));
      const paths=[project.cover,...(project.gallery || [])].filter(Boolean).filter((p,i,a)=>a.indexOf(p)===i);
      photos=paths.map(path=>({kind:'existing',path,meta:{...(overrides.get(path)||{})}}));
    }
    $('project-title').value=project?.title || '';
    $('project-blurb').value=typeof project?.blurb === 'string' ? project.blurb : '';
    $('project-order').value=Number.isFinite(Number(project?.order)) ? Number(project.order): (projects.length+1);
    $('project-published').checked=project ? Boolean(project.published):false;
    $('editor-form').hidden=false;
    status(project ? 'Editing project. Changes appear after Cloudflare redeploys.' : 'New project. Add photos and save when ready.');
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
      const small=node('small','',selected && dirty ? 'Unsaved changes' : (project.published?'Published':'Draft'));btn.appendChild(small);
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
  }
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
  function updateSocialPreview() {
    const box=$('social-preview');if(!box)return;
    const chosen=photos.find(p=>p.path===socialImage)||photos[0];
    box.hidden=!chosen;
    if(!chosen)return;
    $('social-preview-image').src=chosen.preview || chosen.path;
    $('social-preview-title').textContent=$('project-title').value.trim()||current?.title||'Untitled';
  }
  function renderSocialImages() {
    const field=$('social-image');if(!field)return;
    field.replaceChildren();
    const def=node('option','','Use homepage cover');def.value='';field.appendChild(def);
    photos.forEach((photo,i)=>{
      const opt=node('option','',displayFilename(photo,i));opt.value=photo.path;field.appendChild(opt);
    });
    if(!photos.some(p=>p.path===socialImage)) socialImage='';
    field.value=socialImage;
    updateSocialPreview();
  }
  $('social-image').addEventListener('change', e=>{socialImage=e.target.value;markDirty();updateSocialPreview();});
  function renderPhotos() {
    updateCoverCrop();
    renderSocialImages();
    const container=$('photos');container.replaceChildren();
    if(!photos.length) {container.appendChild(node('p','empty','No photographs yet. Add images above.'));return;}
    photos.forEach((photo,i)=>{
      const row=node('div','photo-row');const img=node('img');img.alt=`Photograph ${i+1}`;
      img.src=photo.preview || photo.path;img.loading='lazy';row.appendChild(img);
      const detail=node('div','photo-details');const name=node('p','photo-name', (i===0?'Cover · ':'')+displayFilename(photo, i));
      detail.appendChild(name);
      const buttons=node('div','photo-buttons');
      for(const [title,func] of [['↑',()=>move(i,-1)],['↓',()=>move(i,1)],['Remove',()=>{photos.splice(i,1);if(i===0)coverPosition={x:50,y:50};markDirty();renderPhotos();}]]) {
        const b=node('button','',title);b.type='button';b.disabled=locked;b.addEventListener('click',func);buttons.appendChild(b);
      }
      detail.appendChild(buttons);
      const more=node('details');const summary=node('summary','','Photo description and camera settings (optional)');more.appendChild(summary);
      const grid=node('div','meta-fields');
      for(const [key,label] of keys){
        const wrap=node('label');wrap.appendChild(node('span','',label));const field=node('input');field.value=photo.meta?.[key]||'';field.maxLength=key==='alt'?250:180;field.addEventListener('input',e=>{photo.meta??={};photo.meta[key]=e.target.value;markDirty();});wrap.appendChild(field);grid.appendChild(wrap);
      }
      more.appendChild(grid);detail.appendChild(more);row.appendChild(detail);container.appendChild(row);
    });
  }
  async function loadProjects(selectSlug) {
    const {projects:items}=await api('projects');projects=items;
    const match=selectSlug ? projects.find(p=>p.slug===selectSlug):projects[0];openProject(match||null,true);
    if(!items.length) status('Start by creating a new project.');
  }
  $('add-project').addEventListener('click',()=>openProject(null));
  $('photo-files').addEventListener('change', async e=>{
    const chosen=Array.from(e.target.files||[]);if(!chosen.length || locked)return;
    if(!current?.slug && !$('project-title').value.trim()){status('Name your project before uploading photos.','error');$('photo-files').value='';return;}
    locked=true;$('publish').disabled=true;$('photo-files').disabled=true;
    try {
      for(const [i,file] of chosen.entries()) {
        status(`Preparing and uploading ${i+1} of ${chosen.length}: ${file.name}`);
        const result=await window.PhotoPrep.prepare(file);
        const smallPreview=await window.PhotoPrep.preview(result.blob);
        const preview=URL.createObjectURL(smallPreview);localURLs.add(preview);
        const slug=current?.slug || slugify($('project-title').value.trim());
        if (!current?.slug && !stagedSlug) stagedSlug=slug;
        if (!current?.slug && stagedSlug!==slug) throw Error('Keep the original project name until you save these uploaded photos.');
        const upload=await api('upload',{method:'POST',headers:{'Content-Type':'image/jpeg',
          'X-Photo-Project':slug,'X-Photo-Position':String(photos.length+1)},body:result.blob});
        const variants=[];
        try {
          for (const v of await window.PhotoPrep.variants(result.blob)) {
            // Only upload thumbnails at their exact requested width.
            if (![640,1280].includes(v.width)) continue;
            const thumb=await api('upload',{method:'POST',headers:{'Content-Type':'image/webp',
              'X-Photo-Project':slug,'X-Photo-Variant':String(v.width),'X-Photo-Source':upload.path},body:v.blob});
            variants.push({url:thumb.path,width:thumb.width});
          }
        } catch (e) {status('Original uploaded. Thumbnail optimization skipped: '+e.message);}
        photos.push({kind:'r2',path:upload.path,variants,meta:{...result.meta,storage:'r2'},filename:upload.path.split('/').pop(),preview});
        markDirty();renderPhotos();
      }
      status(`${chosen.length} photo(s) prepared. Click Save project to publish them.`, 'good');
    } catch(err){status('Upload stopped: '+err.message,'error');}
    finally{locked=false;$('publish').disabled=false;$('photo-files').disabled=false;$('photo-files').value='';renderPhotos();}
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
      const m = photo.meta || {};
      const focal = String(m.focal_length || '').trim();
      const aperture = String(m.aperture || '').trim();
      const shutter = String(m.shutter_speed || '').trim();
      const iso = String(m.iso || '').trim();
      const caption = [focal ? focal + (/^\d+(?:\.\d+)?$/.test(focal) ? ' mm' : '') : '',
        aperture ? (/^f\s*\//i.test(aperture) ? aperture : 'f/' + aperture.replace(/^f\s*/i, '')) : '',
        shutter ? shutter + (/s(?:ec(?:onds)?)?$/i.test(shutter) ? '' : ' s') : '',
        iso ? (/^ISO\b/i.test(iso) ? iso : 'ISO ' + iso) : ''].filter(Boolean).join(' · ');
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
    const title=$('project-title').value.trim();
    if(!title){status('Enter a project title.','error');return;}
    locked=true;$('publish').disabled=true;
    if (!current?.slug && stagedSlug && slugify(title)!==stagedSlug) {
      locked=false;$('publish').disabled=false;
      status('The project name changed after uploading. Use the original name, save, then rename it.','error');return;
    }
    const input={slug:current?.slug||null,revision:current?.revision||null,title,blurb:$('project-blurb').value,social_image:socialImage,cover_position:coverPosition,order:Number($('project-order').value),published:$('project-published').checked,
      photos:photos.map(({kind,path,sha,meta,variants})=>({kind,...(kind==='new'?{sha}:{path}),meta, ...(variants?{variants}:{})}))};
    try{
      status('Saving project data in GitHub (photos are already in R2)…');
      const saved=await api('save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
      dirty=false;
      orderDirty=false;
      window.PortfolioDrafts?.clear('project',draftKey());
      await loadProjects(saved.slug);
      status(saved.cleanupWarning || 'Project saved. Cloudflare will publish shortly. Photographs are in R2.',saved.cleanupWarning?'error':'good');
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
      window.PortfolioDrafts?.clear('project',draftKey());
      await loadProjects();
      status(result.r2Warning || `Deleted ${title}. GitHub photos removed: ${result.deletedPhotos}; R2 objects removed: ${result.deletedR2 ?? 0}. Cloudflare will redeploy shortly.`,result.r2Warning?'error':'good');
    } catch (err) { status('Delete failed: '+err.message, 'error'); }
    finally { locked=false; $('publish').disabled=false; updateDeleteState(); renderList(); }
  });
  loadProjects().catch(err=>{status('Unable to load: '+err.message,'error');$('editor-form').hidden=true;});
})();
