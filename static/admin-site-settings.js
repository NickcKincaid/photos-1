/* Simple, private switch for the public Notes navigation link. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const checkbox = $('site-show-notes-tab');
  const button = $('save-notes-visibility');
  const status = $('notes-visibility-status');
  const notesTab = $('show-notes');
  if (!checkbox || !button || !status || !notesTab) return;
  let revision = null;
  let initial = true;
  let busy = false;
  let loaded = false;
  checkbox.disabled = true;
  button.disabled = true;
  const message = text => { status.textContent = text; };
  async function request(method, data) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/admin/site-settings', {
        method, credentials:'same-origin', cache:'no-store', signal: controller.signal,
        ...(data ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(data)} : {})
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(body.error || `Setting request failed (HTTP ${response.status}).`);
      return body;
    } catch (error) {
      if (controller.signal.aborted) throw Error('The setting request timed out. Reload before retrying.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function load() {
    if (busy) return;
    busy = true;
    message('Loading Notes navigation setting…');
    try {
      const result = await request('GET');
      if (typeof result.show_notes_tab !== 'boolean' || !/^[a-f0-9]{40}$/i.test(result.revision || ''))
        throw Error('Unexpected setting response.');
      revision = result.revision;
      initial = result.show_notes_tab;
      checkbox.checked = initial;
      loaded = true;
      checkbox.disabled = false;
      button.disabled = true;
      message('This only controls the public navigation link. Published Notes and their URLs remain available.');
    } catch (error) {
      loaded = false;
      checkbox.disabled = true;
      button.disabled = true;
      message(error.message || 'Could not load the Notes navigation setting.');
    } finally { busy = false; }
  }
  checkbox.addEventListener('change', () => {
    button.disabled = !loaded || busy || checkbox.checked === initial;
  });
  button.addEventListener('click', async () => {
    if (busy || !loaded || checkbox.checked === initial) return;
    busy = true;
    checkbox.disabled = true;
    button.disabled = true;
    message('Saving navigation setting…');
    try {
      const result = await request('POST',{show_notes_tab:checkbox.checked,revision});
      if (!result.ok || !/^[a-f0-9]{40}$/i.test(result.revision || '')) throw Error('Unexpected save response. Reload before retrying.');
      revision = result.revision;
      initial = result.show_notes_tab;
      checkbox.checked = initial;
      message('Saved. The public navigation updates after Cloudflare redeploys.');
    } catch(error) {
      message(error.message || 'Could not save the setting.');
    } finally {
      busy = false;
      checkbox.disabled = !loaded;
      button.disabled = !loaded || checkbox.checked === initial;
    }
  });
  // The Notes editor is available regardless of the public navigation setting.
  notesTab.addEventListener('click', () => { if (!loaded && !busy) load(); });
})();
