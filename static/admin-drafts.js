/* Browser-local recovery, not cloud publishing. Deliberately excludes binary photos and secrets. */
(() => {
  'use strict';
  const prefix = 'nickckincaid:draft:v24:';
  function key(section, slug) { return prefix + section + ':' + (slug || 'new'); }
  function save(section, slug, revision, value) {
    try {
      const raw = JSON.stringify({revision:revision||null, value, savedAt:new Date().toISOString()});
      if (raw.length > 400000) return false;
      localStorage.setItem(key(section,slug),raw);
      return true;
    } catch { return false; }
  }
  function read(section,slug) {
    try {
      const data = JSON.parse(localStorage.getItem(key(section,slug)) || 'null');
      return data && data.value && typeof data.value === 'object' ? data : null;
    } catch { return null; }
  }
  function clear(section,slug) {
    try { localStorage.removeItem(key(section,slug)); } catch { /* browser storage disabled */ }
  }
  window.PortfolioDrafts = {save,read,clear};
})();
