/* Accessible modal photo viewer; canvas sampling never uploads image data. */
(() => {
  const dialog = document.querySelector('#lightbox');
  if (!dialog || typeof dialog.showModal !== 'function') return;

  const image = dialog.querySelector('.lightbox-image');
  const counter = dialog.querySelector('.lightbox-counter');
  const metadata = dialog.querySelector('.lightbox-metadata');
  const closeButton = dialog.querySelector('.lightbox-close');
  const prevButton = dialog.querySelector('.lightbox-prev');
  const nextButton = dialog.querySelector('.lightbox-next');
  const copyButton = dialog.querySelector('.lightbox-copy');
  const downloadLink = dialog.querySelector('.lightbox-download');
  const items = Array.from(document.querySelectorAll('[data-lightbox]'));
  if (!items.length) return;
  let current = 0;
  let lastFocus = null;
  let touchStart = null;
  const sourceURL = new URL(window.location.href);
  sourceURL.searchParams.delete('photo');
  if (sourceURL.hash.startsWith('#photo=')) sourceURL.hash = '';
  const baseURL = sourceURL.pathname + sourceURL.search + sourceURL.hash;

  function urlFor(index) {
    const url = new URL(window.location.href);
    url.searchParams.delete('photo');
    url.hash = 'photo=' + encodeURIComponent(items[index].dataset.photoId || String(index + 1));
    return url.pathname + url.search + url.hash;
  }
  function selectedFromUrl() {
    const url = new URL(location.href);
    const id = url.hash.startsWith('#photo=') ? decodeURIComponent(url.hash.slice(7)) : url.searchParams.get('photo');
    if (!id) return -1;
    const byId = items.findIndex(item => item.dataset.photoId === id);
    if (byId !== -1) return byId;
    const byLegacy = items.findIndex(item => item.dataset.photoLegacyId === id);
    if (byLegacy !== -1) return byLegacy;
    if (/^[0-9]+$/.test(id)) { const number = Number(id); return number >= 1 && number <= items.length ? number - 1 : -1; }
    return -1;
  }
  function safeHistory(method, state, url) {
    // Embedded previews or non-http contexts can reject History API URL
    // updates; the viewer should still remain fully usable.
    try { history[method](state, '', url); } catch { /* leave URL unchanged */ }
  }
  function updateAddress(index, firstOpen = false) {
    safeHistory(firstOpen ? 'pushState' : 'replaceState', {photoViewer:true}, urlFor(index));
  }

  // Gallery-style atmosphere: a fixed charcoal background with only a
  // restrained hint of the current image color. Never paint the entire screen
  // its dominant hue: that can be distracting or reduce control contrast.
  function updateViewerColor() {
    if (!dialog.open || !image.complete || !image.naturalWidth) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 20;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0, 20, 20);
      const pixels = context.getImageData(0, 0, 20, 20).data;
      const total = [0, 0, 0];
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 180) continue;
        for (let c = 0; c < 3; c++) total[c] += pixels[i + c];
        count++;
      }
      if (!count) return;
      const avg = total.map(v => v / count);
      const gray = avg[0] * .2126 + avg[1] * .7152 + avg[2] * .0722;
      // Desaturate the sampled hue before blending it into the neutral stage.
      const accent = avg.map(v => Math.round(v * .38 + gray * .62));
      dialog.style.setProperty('--viewer-glow', accent.join(', '));
    } catch {
      // Unsupported image formats and cross-origin canvas restrictions fall
      // back to the same restrained neutral background.
    }
  }

  function show(index) {
    current = (index + items.length) % items.length;
    const item = items[current];
    if (copyButton) copyButton.textContent = 'Copy link';
    const thumb = item.querySelector('img');
    dialog.style.setProperty('--viewer-glow', '30, 33, 32');
    image.classList.remove('is-loaded');
    image.alt = thumb ? thumb.alt : 'Project photograph';
    image.src = item.dataset.fullSrc || item.getAttribute('href');
    if (downloadLink) {
      // The R2 key never changes. The suggested name comes from the current
      // published gallery position and project title, not the stored key.
      const original = new URL(item.dataset.fullSrc, location.origin);
      const suggested = item.dataset.downloadName;
      original.searchParams.set('download', suggested);
      downloadLink.href = original.pathname + original.search;
      downloadLink.setAttribute('download', suggested);
      downloadLink.setAttribute('aria-label', `Download ${suggested}`);
    }
    counter.textContent = `${String(current + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`;
    metadata.textContent = item.getAttribute('data-meta') || '';
    if (image.complete && image.naturalWidth) {
      image.classList.add('is-loaded');
      updateViewerColor();
    }
  }

  function dismiss(fromHistory = false) {
    if (!fromHistory && dialog.open) safeHistory('replaceState', null, baseURL);
    if (dialog.open) dialog.close();
  }

  items.forEach((item, index) => item.addEventListener('click', event => {
    event.preventDefault();
    lastFocus = item;
    const opening = !dialog.open;
    if (opening) dialog.showModal();
    show(index);
    updateAddress(index, opening);
  }));
  image.addEventListener('load', () => {
    image.classList.add('is-loaded');
    updateViewerColor();
  });

  closeButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    dismiss();
  });
  function navigate(delta) {
    show(current + delta);
    updateAddress(current);
  }
  prevButton.addEventListener('click', () => navigate(-1));
  nextButton.addEventListener('click', () => navigate(1));
  copyButton?.addEventListener('click', async () => {
    const target = new URL(urlFor(current), location.origin).href;
    try {
      await navigator.clipboard.writeText(target);
      copyButton.textContent = 'Copied';
      setTimeout(() => { copyButton.textContent = 'Copy link'; }, 1500);
    } catch {
      // Browsers without Clipboard API can still copy the address-bar URL.
      copyButton.textContent = 'Copy URL above';
      copyButton.focus();
    }
  });

  // Swipe horizontally, while ignoring vertical gestures and taps.
  dialog.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) return;
    touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  dialog.addEventListener('touchend', event => {
    if (!touchStart || event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) navigate(dx < 0 ? 1 : -1);
  }, { passive: true });

  function syncAddress() {
    const selected = selectedFromUrl();
    if (selected !== -1) {
      if (!dialog.open) dialog.showModal();
      show(selected);
    } else dismiss(true);
  }
  window.addEventListener('popstate', syncAddress);
  window.addEventListener('hashchange', syncAddress);
  // Direct links work when opened in a fresh tab as well as after browser Back.
  const deepLink = selectedFromUrl();
  if (deepLink !== -1) {
    if (new URL(location.href).searchParams.has('photo')) safeHistory('replaceState', null, urlFor(deepLink));
    lastFocus = items[deepLink];
    dialog.showModal();
    show(deepLink);
  }


  // Clicking a blank part of the viewer closes it; clicking a photo does not.
  dialog.addEventListener('click', event => {
    if (event.target === dialog || event.target.classList.contains('lightbox-stage')) {
      dismiss();
    }
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  dialog.addEventListener('close', () => {
    if (selectedFromUrl() !== -1) safeHistory('replaceState', null, baseURL);
    image.classList.remove('is-loaded');
    image.removeAttribute('src');
    lastFocus?.focus({ preventScroll: true });
  });
  document.addEventListener('keydown', event => {
    if (!dialog.open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      dismiss();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      navigate(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      navigate(1);
    }
  });
})();
