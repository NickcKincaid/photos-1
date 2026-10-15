(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const keys = [['camera','Camera'],['lens','Lens'],['focal_length','Focal length'],['aperture','Aperture'],['shutter_speed','Shutter speed'],['iso','ISO']];
  let projects = [], current = null, photos = [], locked = false, dirty = false;
  const localURLs = new Set();
  function status(message, type='') { const el=$('status');el.textContent=message;el.className='status '+type; }
  async function api(path, options={}) {
    const response = await fetch('/api/admin/'+path, { credentials:'same-origin', cache:'no-store', ...options });
    let body; try { body=await response.json(); } catch { throw Error(`Server returned ${response.status}; verify your Cloudflare configuration.`); }
    if (!response.ok) throw Error(body.error || `Request failed (${response.status})`);
    return body;
  }
  function node(tag, className='', value='') { const el=document.createElement(tag);if(className)el.className=className;if(value)el.textContent=value;return el; }
  function cleanup() { for (const u of localURLs) URL.revokeObjectURL(u); localURLs.clear(); }
  function markDirty() { dirty = true; }
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  $('project-title').addEventListener('input', markDirty);
  $('project-order').addEventListener('input', markDirty);
  $('project-published').addEventListener('change', markDirty);
  function openProject(project) {
    if (locked) return;
    if (dirty && !window.confirm('Discard unsaved changes to this project?')) return;
    cleanup(); current=project || null;
    dirty = false;
    photos=[];
    if (project) {
      const overrides=new Map((project.photo_details || []).map(x => [x.image, x]));
      const paths=[project.cover,...(project.gallery || [])].filter(Boolean).filter((p,i,a)=>a.indexOf(p)===i);
      photos=paths.map(path=>({kind:'existing',path,meta:{...(overrides.get(path)||{})}}));
    }
    $('project-title').value=project?.title || '';
    $('project-order').value=Number.isFinite(Number(project?.order)) ? Number(project.order): (projects.length+1);
    $('project-published').checked=project ? Boolean(project.published):false;
    $('editor-form').hidden=false;
    status(project ? 'Editing project. Changes appear after Cloudflare redeploys.' : 'New project. Add photos and save when ready.');
    renderList();renderPhotos();
  }
  function renderList() {
    const container=$('project-list');container.replaceChildren();
    if (!projects.length) container.appendChild(node('p','muted','No projects yet'));
    for (const project of projects) {
      const btn=node('button','project-btn'+(current?.slug === project.slug?' active':''),project.title || project.slug);
      const small=node('small','',project.published?'Published':'Draft');btn.appendChild(small);
      btn.type='button';btn.addEventListener('click',()=>openProject(project));container.appendChild(btn);
    }
  }
  function move(i,d) {const next=i+d;if(next<0 || next>=photos.length)return;[photos[i],photos[next]]=[photos[next],photos[i]];markDirty();renderPhotos();}
  function renderPhotos() {
    const container=$('photos');container.replaceChildren();
    if(!photos.length) {container.appendChild(node('p','empty','No photographs yet. Add images above.'));return;}
    photos.forEach((photo,i)=>{
      const row=node('div','photo-row');const img=node('img');img.alt=`Photograph ${i+1}`;
      img.src=photo.preview || photo.path;img.loading='lazy';row.appendChild(img);
      const detail=node('div','photo-details');const name=node('p','photo-name',(i===0?'Cover · ':'')+String(i+1).padStart(2,'0')+' — '+(photo.filename || photo.path?.split('/').pop() || 'New photo'));
      detail.appendChild(name);
      const buttons=node('div','photo-buttons');
      for(const [title,func] of [['↑',()=>move(i,-1)],['↓',()=>move(i,1)],['Remove',()=>{photos.splice(i,1);markDirty();renderPhotos();}]]) {
        const b=node('button','',title);b.type='button';b.disabled=locked;b.addEventListener('click',func);buttons.appendChild(b);
      }
      detail.appendChild(buttons);
      const more=node('details');const summary=node('summary','','Camera metadata corrections (optional)');more.appendChild(summary);
      const grid=node('div','meta-fields');
      for(const [key,label] of keys){
        const wrap=node('label');wrap.appendChild(node('span','',label));const field=node('input');field.value=photo.meta?.[key]||'';field.maxLength=180;field.addEventListener('input',e=>{photo.meta??={};photo.meta[key]=e.target.value;markDirty();});wrap.appendChild(field);grid.appendChild(wrap);
      }
      more.appendChild(grid);detail.appendChild(more);row.appendChild(detail);container.appendChild(row);
    });
  }
  async function loadProjects(selectSlug) {
    const {projects:items}=await api('projects');projects=items;
    const match=selectSlug ? projects.find(p=>p.slug===selectSlug):projects[0];openProject(match||null);
    if(!items.length) status('Start by creating a new project.');
  }
  $('add-project').addEventListener('click',()=>openProject(null));
  $('photo-files').addEventListener('change', async e=>{
    const chosen=Array.from(e.target.files||[]);if(!chosen.length || locked)return;
    locked=true;$('publish').disabled=true;$('photo-files').disabled=true;
    try {
      for(const [i,file] of chosen.entries()) {
        status(`Preparing and uploading ${i+1} of ${chosen.length}: ${file.name}`);
        const result=await window.PhotoPrep.prepare(file);
        const preview=URL.createObjectURL(result.blob);localURLs.add(preview);
        const encoded=await window.PhotoPrep.toGitHubBlobJSON(result.blob);
        const upload=await api('upload',{method:'POST',headers:{'Content-Type':'application/json'},body:encoded});
        photos.push({kind:'new',sha:upload.sha,meta:{},filename:file.name,preview});
        markDirty();renderPhotos();
      }
      status(`${chosen.length} photo(s) prepared. Click Save project to publish them.`, 'good');
    } catch(err){status('Upload stopped: '+err.message,'error');}
    finally{locked=false;$('publish').disabled=false;$('photo-files').disabled=false;$('photo-files').value='';renderPhotos();}
  });
  $('editor-form').addEventListener('submit',async e=>{
    e.preventDefault();if(locked)return;
    const title=$('project-title').value.trim();
    if(!title){status('Enter a project title.','error');return;}
    locked=true;$('publish').disabled=true;
    const input={slug:current?.slug||null,title,order:Number($('project-order').value),published:$('project-published').checked,
      photos:photos.map(({kind,path,sha,meta})=>({kind,...(kind==='existing'?{path}:{sha}),meta}))};
    try{
      status('Saving photographs and project to GitHub…');
      const saved=await api('save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
      dirty=false;
      status('Saved to GitHub. Cloudflare will publish the new version shortly.','good');
      await loadProjects(saved.slug);
      status('Saved to GitHub. Cloudflare will publish shortly. Automatic naming and copyright processing follows.','good');
    } catch(err){status(err.message,'error');}
    finally{locked=false;$('publish').disabled=false;}
  });
  loadProjects().catch(err=>{status('Unable to load: '+err.message,'error');$('editor-form').hidden=true;});
})();
