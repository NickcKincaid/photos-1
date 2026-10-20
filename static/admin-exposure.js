/* Camera-setting formats; keep in sync with admin-lib/exposure.js. */
(() => {
'use strict';
function normalizeExposureValue(key, input) {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  const text = raw.replace(/,/g, '.');
  let match, number;
  if (key === 'focal_length') {
    match = /^(\d+(?:\.\d+)?)\s*(?:mm)?$/i.exec(text);
    if (!match) return null;
    number = Number(match[1]);
    return number > 0 && number <= 2000 ? `${number}mm` : null;
  }
  if (key === 'aperture') {
    match = /^(?:f\s*\/?\s*)?(\d+(?:\.\d+)?)$/i.exec(text);
    if (!match) return null;
    number = Number(match[1]);
    return number > 0 && number <= 128 ? `f/${number}` : null;
  }
  if (key === 'shutter_speed') {
    match = /^(\d+)\s*\/\s*(\d+)\s*(?:s|sec|secs|second|seconds)?$/i.exec(text);
    if (match) {
      const numerator = Number(match[1]), denominator = Number(match[2]);
      return numerator > 0 && denominator > 0 && numerator / denominator <= 36000 ? `${numerator}/${denominator}s` : null;
    }
    match = /^(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)?$/i.exec(text);
    if (!match) return null;
    number = Number(match[1]);
    // Bare numbers mean SECONDS, not a reciprocal. Enter 1/250 for 1/250 s.
    if (!(number > 0 && number <= 36000)) return null;
    if (number < 1) {
      const denominator=Math.round(1/number);
      if (denominator>=2 && denominator<=8000 && Math.abs(1/denominator-number)/number < 0.01) {
        return `1/${denominator}s`;
      }
    }
    return `${number}s`;
  }
  if (key === 'iso') {
    match = /^(?:iso\s*[-:]?\s*)?(\d+)$/i.exec(text);
    if (!match) return null;
    number = Number(match[1]);
    return Number.isSafeInteger(number) && number >= 1 && number <= 4096000 ? `ISO ${number}` : null;
  }
  return raw;
}
function exposureCaption(meta) {
  return ['focal_length', 'aperture', 'shutter_speed', 'iso']
    .map(key => normalizeExposureValue(key, meta?.[key]))
    .filter(value => value && value !== null).join(' · ');
}
window.PortfolioExposure = Object.freeze({normalizeExposureValue, exposureCaption});
})();
