/* Private notes editor. Plain text only; GitHub holds the note JSON files. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const pane = $('notes-pane'), projectPane = $('projects-pane'), storagePane=$('storage-pane');
  if (!pane || !projectPane) return;
  const tabs = [$('show-projects'), $('show-notes'), $('show-storage')];
  let notes = [], selected = null, dirty = false, busy = false, loaded = false;
  let previewVisible = false;
  let previewTimer = null;
  window.photoNotesHasPendingChanges = () => dirty || busy;
  const showStatus = (message, error=false) => { $('notes-status').textContent = message; $('notes-status').className = error ? 'status error' : 'status'; };
  const make = (tag, text='', className='') => { const el = document.createElement(tag); el.textContent = text; if(className)el.className = className; return el; };
  const api = async (method='GET', body=null) => {
    const response = await fetch('/api/admin/notes', {method, credentials:'same-origin', cache:'no-store',
      ...(body ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {})});
    let value;
    try { value = await response.json(); } catch { throw Error(`The server returned HTTP ${response.status}. Check Cloudflare Pages Functions logs.`); }
    if (!response.ok) throw Error(value.error || `Request failed (${response.status}).`);
    return value;
  };
  function canDiscard(message='Discard unsaved changes to this note?') {
    return !dirty || window.confirm(message);
  }
  function noteKey() { return selected?.slug || 'new'; }
  function persistDraft() {
    if(!dirty || busy || $('note-form').hidden) return;
    window.PortfolioDrafts?.save('note',noteKey(),selected?.revision,{
      title:$('note-title').value,body:$('note-body').value,published:$('note-published').checked
    });
  }
  function tryRestoreDraft(note) {
    const draft=window.PortfolioDrafts?.read('note',noteKey());
    if (!draft) return;
    const stale=Boolean(note?.revision && draft.revision && note.revision!==draft.revision);
    const question=stale
      ? 'A local note draft exists, but the GitHub version has changed. Restore the local text anyway? Review before saving.'
      : 'Recover your unsaved note from this browser?';
    if (!window.confirm(question)) {window.PortfolioDrafts.clear('note',noteKey());return;}
    $('note-title').value=String(draft.value.title||'').slice(0,120);
    $('note-body').value=String(draft.value.body||'').slice(0,12000);
    $('note-published').checked=Boolean(draft.value.published);
    dirty=true;
    showStatus('Local draft recovered. Review and save to publish.');
    if(previewVisible) renderPreview();
  }
  setInterval(persistDraft,1800);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)persistDraft();});
  function newSelection(note, force=false) {
    if ((busy && !force) || (!force && !canDiscard())) return false;
    selected = note || null;
    dirty = false;
    $('note-title').value = note?.title || '';
    $('note-body').value = note?.body || '';
    if (previewVisible) renderPreview();
    $('note-published').checked = Boolean(note?.published);
    $('delete-note').hidden = !note?.slug;
    $('note-form').hidden = false;
    showStatus(note ? (note.published ? 'Published note. Changes will redeploy after saving.' : 'Unpublished draft.') : 'New note. Publication time is set when you publish.');
    tryRestoreDraft(note);
    renderList();
    return true;
  }
  function renderList() {
    const target = $('notes-list');target.replaceChildren();
    if (!notes.length) { target.appendChild(make('p', 'No notes yet.', 'muted')); return; }
    for (const item of notes) {
      const button = make('button', item.title, 'note-item' + (item.slug === selected?.slug ? ' active' : ''));
      button.type = 'button';
      const subtitle = make('small', item.published ? `Published · ${item.published_at ? new Date(item.published_at).toLocaleDateString() : ''}` : 'Draft');
      button.appendChild(subtitle);
      button.addEventListener('click', () => newSelection(item));
      target.appendChild(button);
    }
  }
  async function load(preferred=null, force=false) {
    if (!force && !canDiscard()) return;
    const result = await api();
    notes = result.notes || [];
    loaded = true;
    newSelection(notes.find(n => n.slug === preferred) || notes[0] || null, true);
    if (!notes.length) showStatus('No notes yet. Select + New note to write one.');
  }
  function switchTo(section) {
    if (busy) return;
    if (section !== 'projects' && window.photoEditorHasPendingChanges?.() &&
        !window.confirm('Your project has unsaved changes. Switch to Notes anyway?')) return;
    if (section !== 'notes' && !canDiscard('Your note has unsaved changes. Switch away anyway?')) return;
    const isNotes = section === 'notes';
    const isStorage = section === 'storage';
    pane.hidden = !isNotes;
    projectPane.hidden = section !== 'projects';
    storagePane.hidden = !isStorage;
    tabs[0].setAttribute('aria-pressed', String(section === 'projects'));
    tabs[1].setAttribute('aria-pressed', String(isNotes));
    tabs[2].setAttribute('aria-pressed', String(isStorage));
    if (isNotes && !loaded) load().catch(e => showStatus(e.message, true));
    if (isStorage) window.dispatchEvent(new Event('photo-storage-open'));
  }
  tabs[0].addEventListener('click', () => switchTo('projects'));
  tabs[1].addEventListener('click', () => switchTo('notes'));
  tabs[2].addEventListener('click', () => switchTo('storage'));
  const noteArea = $('note-body');
  const preview = $('note-preview');
  function renderPreview() {
    window.NoteFormatter?.render(preview, noteArea.value);
    if (!noteArea.value.trim()) preview.textContent = 'Start writing to preview your note.';
  }
  $('note-preview-toggle').addEventListener('click', () => {
    previewVisible = !previewVisible;
    preview.hidden = !previewVisible;
    $('note-preview-toggle').setAttribute('aria-pressed', String(previewVisible));
    $('note-preview-toggle').textContent = previewVisible ? 'Hide preview' : 'Preview';
    if (previewVisible) renderPreview();
  });
  function replaceSelection(prefix, suffix='', placeholder='text') {
    const start = noteArea.selectionStart, end = noteArea.selectionEnd;
    const selectedText = noteArea.value.slice(start, end) || placeholder;
    const inserted = prefix + selectedText + suffix;
    if (noteArea.value.length - (end-start) + inserted.length > noteArea.maxLength) {
      showStatus('This note has reached the maximum length.', true);return;
    }
    noteArea.setRangeText(inserted, start, end, 'select');
    const from = start + prefix.length;
    noteArea.setSelectionRange(from,from+selectedText.length);
    noteArea.focus();noteArea.dispatchEvent(new Event('input',{bubbles:true}));
  }
  function prefixLine(prefix) {
    const start=noteArea.value.lastIndexOf('\n',noteArea.selectionStart-1)+1;
    if (noteArea.value.length+prefix.length>noteArea.maxLength) return;
    noteArea.setRangeText(prefix,start,start,'end');
    noteArea.focus();noteArea.dispatchEvent(new Event('input',{bubbles:true}));
  }
  function addEmbed(url) {
    if (!window.NoteFormatter?.embedSource(url)) {showStatus('Paste a valid YouTube or Spotify share link.',true);return;}
    const start=noteArea.selectionStart, end=noteArea.selectionEnd;
    const before=noteArea.value.slice(0,start),after=noteArea.value.slice(end);
    const inserted = (before && !before.endsWith('\n\n')?'\n\n':'')+url.trim()+(after && !after.startsWith('\n\n')?'\n\n':'');
    if (noteArea.value.length-(end-start)+inserted.length > noteArea.maxLength) {showStatus('The note is too long.',true);return;}
    noteArea.setRangeText(inserted,start,end,'end');noteArea.focus();noteArea.dispatchEvent(new Event('input',{bubbles:true}));
  }
  document.querySelectorAll('[data-note-format]').forEach(button => button.addEventListener('click', () => {
    if (busy) return;
    switch(button.dataset.noteFormat) {
      case 'bold': replaceSelection('**','**'); break;
      case 'italic': replaceSelection('*','*'); break;
      case 'heading': prefixLine('# '); break;
      case 'bullet': prefixLine('- '); break;
      case 'quote': prefixLine('> '); break;
      case 'link': {
        const url = window.prompt('Enter a web link (https://...) or email address (mailto:...):','https://');
        if (url === null) break;
        if (!/^(https?:\/\/|mailto:)[^\s]+$/.test(url.trim())) {showStatus('Use an http(s) or mailto URL.',true);break;}
        replaceSelection('[',']('+url.trim()+')','link text');break;
      }
      case 'embed': {
        const url = window.prompt('Paste a YouTube or Spotify share URL:','https://');
        if (url !== null) addEmbed(url);break;
      }
    }
  }));
  noteArea.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      const command=event.key.toLowerCase();
      if (command === 'b' || command === 'i') {
        event.preventDefault();replaceSelection(command === 'b'?'**':'*',command === 'b'?'**':'*');
      }
    }
  });
  $('add-note').addEventListener('click', () => newSelection(null));
  for (const id of ['note-title', 'note-body']) $(id).addEventListener('input', () => { dirty = true; if (id === 'note-body' && previewVisible) { clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 250); } });
  $('note-published').addEventListener('change', () => { dirty = true; });
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  $('note-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (busy) return;
    const title = $('note-title').value.trim(), body = $('note-body').value.trim();
    if (!title || !body) { showStatus('Enter a title and some text.', true); return; }
    busy = true; $('save-note').disabled = true; $('delete-note').disabled = true;
    try {
      showStatus('Saving note to GitHub…');
      const saved = await api('POST', {slug:selected?.slug || null, revision:selected?.revision || null,
        title, body, published:$('note-published').checked});
      dirty = false;
      window.PortfolioDrafts?.clear('note',noteKey());
      await load(saved.slug, true);
      showStatus('Note saved. Cloudflare will update the public Notes page shortly.');
    } catch (error) { showStatus(error.message, true); }
    finally { busy = false; $('save-note').disabled = false; $('delete-note').disabled = false; }
  });
  $('delete-note').addEventListener('click', async () => {
    if (busy || !selected?.slug) return;
    if (dirty) { showStatus('Save or discard your edits before deleting.', true); return; }
    const typed = window.prompt(`Delete note "${selected.title}"? Type its exact title to confirm:`);
    if (typed === null) return;
    if (typed.trim() !== selected.title) { showStatus('Deletion cancelled: title did not match.', true); return; }
    busy = true; $('save-note').disabled = true;
    try {
      await api('DELETE', {slug:selected.slug, revision:selected.revision, confirmTitle:selected.title});
      dirty = false;
      window.PortfolioDrafts?.clear('note',noteKey());
      await load(null, true);
      showStatus('Note deleted. Cloudflare will redeploy shortly.');
    } catch (error) { showStatus(error.message, true); }
    finally { busy = false; $('save-note').disabled = false; }
  });
})();
