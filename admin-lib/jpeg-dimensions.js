// Parse the dimensions in a bounded JPEG header. Does not decode pixels.
// Useful for old R2 photographs created before dimension metadata was stored.
const SOF = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
export function jpegDimensions(data) {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (b.length < 10 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i++] !== 0xff) return null;
    while (i < b.length && b[i] === 0xff) i++;
    if (i >= b.length) return null;
    const marker = b[i++];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (i + 2 > b.length) return null;
    const length = b[i] * 256 + b[i + 1];
    if (length < 2 || i + length > b.length) return null;
    if (SOF.has(marker)) {
      if (length < 7) return null;
      const height = b[i + 3] * 256 + b[i + 4];
      const width = b[i + 5] * 256 + b[i + 6];
      return width > 0 && height > 0 && width <= 40000 && height <= 40000 ? {width, height} : null;
    }
    i += length;
  }
  return null;
}
export async function r2JpegDimensions(bucket, key) {
  // Normal photo headers fit in 128KiB; retry a larger prefix only when needed.
  for (const size of [131072, 524288]) {
    const object = await bucket.get(key, {range: {offset:0, length:size}});
    if (!object) return null;
    const bytes = new Uint8Array(await object.arrayBuffer());
    const found = jpegDimensions(bytes);
    if (found) return found;
    if (bytes.byteLength < size) return null;
  }
  return null;
}
