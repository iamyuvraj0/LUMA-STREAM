const VIDEO_MIME_TYPES = new Map([
  ['.mp4', 'video/mp4'],
  ['.m4v', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.mkv', 'video/x-matroska'],
  ['.mov', 'video/quicktime'],
]);

/** Parse exactly one RFC 7233 byte range for a known-size file. */
export function parseDownloadRange(header, size) {
  if (typeof header !== 'string' || !Number.isSafeInteger(size) || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
    if (start >= size || end < start) return { unsatisfiable: true };
    end = Math.min(end, size - 1);
  }
  return { start, end, length: end - start + 1 };
}

export function downloadMimeType(filename) {
  const value = String(filename || '').toLowerCase();
  const dot = value.lastIndexOf('.');
  return VIDEO_MIME_TYPES.get(dot >= 0 ? value.slice(dot) : '') || 'application/octet-stream';
}
