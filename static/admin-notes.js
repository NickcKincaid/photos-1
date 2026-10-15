/* Private notes editor. Plain text only; GitHub holds the note JSON files. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const pane = $('notes-pane'), projectPane = $('projects-pane');
  if (!pane || !projectPane) return;
  const tabs = [$('show-projects'), $('show-notes')];
  let notes = [], selected = null, dirty = false, busy = false, loaded = false;
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
  function newSelection(note, force=false) {
    if ((busy && !force) || (!force && !canDiscard())) return false;
    selected = note || null;
    dirty = false;
    $('note-title').value = note?.title || '';
    $('note-body').value = note?.body || '';
    $('note-published').checked = Boolean(note?.published);
    $('delete-note').hidden = !note?.slug;
    $('note-form').hidden = false;
    showStatus(note ? (note.published ? 'Published note. Changes will redeploy after saving.' : 'Unpublished draft.') : 'New note. Publication time is set when you publish.');
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
    if (section === 'notes' && window.photoEditorHasPendingChanges?.() &&
        !window.confirm('Your project has unsaved changes. Switch to Notes anyway?')) return;
    if (section === 'projects' && !canDiscard('Your note has unsaved changes. Switch to Projects anyway?')) return;
    const isNotes = section === 'notes';
    pane.hidden = !isNotes;
    projectPane.hidden = isNotes;
    tabs[0].setAttribute('aria-pressed', String(!isNotes));
    tabs[1].setAttribute('aria-pressed', String(isNotes));
    if (isNotes && !loaded) load().catch(e => showStatus(e.message, true));
  }
  tabs[0].addEventListener('click', () => switchTo('projects'));
  tabs[1].addEventListener('click', () => switchTo('notes'));
  $('add-note').addEventListener('click', () => newSelection(null));
  for (const id of ['note-title', 'note-body']) $(id).addEventListener('input', () => { dirty = true; });
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
      await load(null, true);
      showStatus('Note deleted. Cloudflare will redeploy shortly.');
    } catch (error) { showStatus(error.message, true); }
    finally { busy = false; $('save-note').disabled = false; }
  });
})();
