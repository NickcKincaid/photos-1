"""Minimal, dependency-free EXIF reader for JPEG/TIFF images.

Reads selected camera settings at build time, without altering source images.
Works with JPEG, WebP, PNG, or TIFF images that preserve EXIF data. For
exports without EXIF, the site can use optional CMS overrides.
"""
from __future__ import annotations

import struct
from pathlib import Path

TYPES = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8}


def _tiff_fields(data: bytes) -> dict[int, object]:
    if len(data) < 8 or data[:2] not in (b'II', b'MM'):
        return {}
    endian = '<' if data[:2] == b'II' else '>'

    def unpack(fmt: str, offset: int):
        size = struct.calcsize(endian + fmt)
        if offset < 0 or offset + size > len(data):
            raise ValueError('Invalid EXIF offset')
        return struct.unpack_from(endian + fmt, data, offset)[0]

    if unpack('H', 2) != 42:
        return {}

    def read_value(field_type: int, count: int, where: int):
        unit = TYPES.get(field_type, 0)
        length = unit * count
        if not unit or count > 100000 or length > 200000:
            return None
        raw_offset = where if length <= 4 else unpack('I', where)
        if raw_offset < 0 or raw_offset + length > len(data):
            return None
        raw = data[raw_offset:raw_offset + length]
        if field_type == 2:
            return raw.split(b'\x00', 1)[0].decode('utf-8', 'replace').strip()
        if field_type in (5, 10):
            fmt = ('i' if field_type == 10 else 'I')
            n, d = struct.unpack_from(endian + fmt * 2, raw)
            return n / d if d else None
        if field_type in (3, 4, 9):
            fmt = {3: 'H', 4: 'I', 9: 'i'}[field_type]
            return unpack(fmt, raw_offset)
        return None

    def ifd(offset: int) -> dict[int, object]:
        if offset < 8 or offset + 2 > len(data):
            return {}
        count = unpack('H', offset)
        if count > 1000 or offset + 2 + count * 12 > len(data):
            return {}
        result = {}
        for i in range(count):
            entry = offset + 2 + i * 12
            tag = unpack('H', entry)
            field_type = unpack('H', entry + 2)
            quantity = unpack('I', entry + 4)
            value = read_value(field_type, quantity, entry + 8)
            if value is not None:
                result[tag] = value
        return result

    primary = ifd(unpack('I', 4))
    exif_pointer = primary.get(34665)
    extra = ifd(exif_pointer) if isinstance(exif_pointer, int) else {}
    return {**primary, **extra}


def _jpeg_exif(path: Path) -> bytes:
    # Read only JPEG APP markers; never decode photo pixels during build.
    with path.open('rb') as f:
        if f.read(2) != b'\xff\xd8':
            return b''
        while True:
            marker_prefix = f.read(1)
            if marker_prefix != b'\xff':
                return b''
            marker = f.read(1)
            while marker == b'\xff':
                marker = f.read(1)
            if not marker or marker in (b'\xd9', b'\xda'):
                return b''
            # Standalone markers (not expected in regular EXIF JPEG files).
            if marker in (b'\x01',) or b'\xd0' <= marker <= b'\xd7':
                continue
            length_bytes = f.read(2)
            if len(length_bytes) != 2:
                return b''
            segment_length = int.from_bytes(length_bytes, 'big') - 2
            if segment_length < 0:
                return b''
            if marker == b'\xe1' and segment_length <= 8 * 1024 * 1024:
                chunk = f.read(segment_length)
                if chunk.startswith(b'Exif\x00\x00'):
                    return chunk[6:]
            else:
                f.seek(segment_length, 1)



def _webp_exif(path: Path) -> bytes:
    with path.open('rb') as f:
        header = f.read(12)
        if len(header) != 12 or header[:4] != b'RIFF' or header[8:] != b'WEBP':
            return b''
        while True:
            chunk = f.read(8)
            if len(chunk) != 8:
                return b''
            name, length = chunk[:4], int.from_bytes(chunk[4:], 'little')
            if name == b'EXIF' and length <= 8 * 1024 * 1024:
                result = f.read(length)
                return result[6:] if result.startswith(b'Exif\x00\x00') else result
            f.seek(length + (length & 1), 1)


def _png_exif(path: Path) -> bytes:
    with path.open('rb') as f:
        if f.read(8) != b'\x89PNG\r\n\x1a\n':
            return b''
        while True:
            header = f.read(8)
            if len(header) != 8:
                return b''
            length = int.from_bytes(header[:4], 'big')
            name = header[4:]
            if name == b'eXIf' and length <= 8 * 1024 * 1024:
                return f.read(length)
            if name == b'IEND':
                return b''
            f.seek(length + 4, 1)  # includes four-byte CRC


def read_exif(path: Path) -> dict[str, str]:
    """Return safely formatted photo info. Empty dict if EXIF is unavailable."""
    try:
        ext = path.suffix.lower()
        if ext in ('.jpg', '.jpeg'):
            tiff_data = _jpeg_exif(path)
        elif ext == '.webp':
            tiff_data = _webp_exif(path)
        elif ext == '.png':
            tiff_data = _png_exif(path)
        elif ext in ('.tif', '.tiff'):
            tiff_data = path.read_bytes()
        else:
            return {}
        if not tiff_data:
            return {}
        fields = _tiff_fields(tiff_data)
    except (OSError, ValueError, struct.error, OverflowError):
        return {}

    result = {}
    make = str(fields.get(271) or '').strip()
    model = str(fields.get(272) or '').strip()
    if model:
        result['camera'] = model if not make or make.lower() in model.lower() else f'{make} {model}'
    lens = fields.get(42036)
    if lens:
        result['lens'] = str(lens)
    focal = fields.get(37386)
    if isinstance(focal, (float, int)) and 0 < focal < 2000:
        result['focal_length'] = f'{focal:g} mm'
    aperture = fields.get(33437)
    if isinstance(aperture, (float, int)) and 0 < aperture < 128:
        result['aperture'] = f'f/{aperture:g}'
    shutter = fields.get(33434)
    if isinstance(shutter, (float, int)) and 0 < shutter < 36000:
        if shutter < 1:
            denom = round(1 / shutter)
            result['shutter_speed'] = f'1/{denom} s' if denom else f'{shutter:.2f} s'
        else:
            result['shutter_speed'] = f'{shutter:g} s'
    iso = fields.get(34855)
    if isinstance(iso, (float, int)) and 1 <= iso <= 4096000:
        result['iso'] = f'ISO {round(iso)}'
    return result
