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
  const items = Array.from(document.querySelectorAll('[data-lightbox]'));
  if (!items.length) return;
  let current = 0;
  let lastFocus = null;

  // The viewer uses an approximation of the photograph's dominant color.
  // Sampling a tiny, same-origin canvas is much cheaper than an image-analysis library.
  function updateViewerColor() {
    if (!dialog.open || !image.complete || !image.naturalWidth) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 32;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0, 32, 32);
      const pixels = context.getImageData(0, 0, 32, 32).data;
      const histogram = new Map();
      const sum = [0, 0, 0];
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 230) continue;
        const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
        rgb.forEach((v, c) => { sum[c] += v; });
        count += 1;
        const key = `${rgb[0] >> 5}-${rgb[1] >> 5}-${rgb[2] >> 5}`;
        const bin = histogram.get(key) || { count: 0, rgb: [0, 0, 0] };
        bin.count += 1;
        rgb.forEach((v, c) => { bin.rgb[c] += v; });
        histogram.set(key, bin);
      }
      if (!count) return;
      let dominant = null;
      for (const bin of histogram.values()) {
        if (!dominant || bin.count > dominant.count) dominant = bin;
      }
      const avg = sum.map(v => v / count);
      const chosen = dominant && dominant.count > 20
        ? dominant.rgb.map(v => v / dominant.count)
        : avg;
      // Mix the most frequent tone with the overall image tone; reduce intensity
      // a little so controls remain readable and the photograph is the focus.
      const color = chosen.map((v, i) => Math.round(v * 0.64 + avg[i] * 0.24 + 115 * 0.12));
      const luminance = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
      dialog.style.setProperty('--viewer-bg', `rgb(${color.join(', ')})`);
      dialog.style.setProperty('--viewer-text', luminance > 118 ? '#181a17' : '#ffffff');
    } catch (error) {
      // Unsupported formats and unusual browser security settings use the default.
    }
  }

  function show(index) {
    current = (index + items.length) % items.length;
    const item = items[current];
    const thumb = item.querySelector('img');
    dialog.style.setProperty('--viewer-bg', '#252824');
    dialog.style.setProperty('--viewer-text', '#ffffff');
    image.alt = thumb ? thumb.alt : 'Project photograph';
    image.src = item.getAttribute('href');
    counter.textContent = `${String(current + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`;
    metadata.textContent = item.getAttribute('data-meta') || '';
    if (image.complete && image.naturalWidth) updateViewerColor();
  }

  function dismiss() {
    if (dialog.open) dialog.close();
  }

  items.forEach((item, index) => item.addEventListener('click', event => {
    event.preventDefault();
    lastFocus = item;
    if (!dialog.open) dialog.showModal();
    show(index);
  }));
  image.addEventListener('load', updateViewerColor);

  closeButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    dismiss();
  });
  prevButton.addEventListener('click', () => show(current - 1));
  nextButton.addEventListener('click', () => show(current + 1));

  // Clicking a blank part of the viewer closes it; clicking a photo does not.
  dialog.addEventListener('click', event => {
    if (event.target === dialog || event.target.classList.contains('lightbox-stage')) {
      dismiss();
    }
  });
  dialog.addEventListener('close', () => {
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
      show(current - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      show(current + 1);
    }
  });
})();
