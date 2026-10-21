import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { safeFilename } from './download-catalog.js';
import { parseDownloadRange, downloadMimeType } from './download-range.js';

function jsonError(res, status, message) {
  if (res.headersSent) {
    if (!res.writableEnded) res.destroy();
    return;
  }
  for (const header of ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Content-Disposition', 'Content-Type']) {
    res.removeHeader?.(header);
  }
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const body = Buffer.from(JSON.stringify({ error: message }));
  res.setHeader('Content-Length', String(body.length));
  res.end(body);
}

function contentDisposition(filename) {
  const safe = safeFilename(filename, 'luma-download.mp4');
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(safe).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Stream an already-resolved local media file to a Node/Express response. */
export async function streamDownloadFile(req, res, file) {
  const size = Number(file?.quality?.sizeBytes);
  if (!file?.filePath || !Number.isSafeInteger(size) || size <= 0) {
    jsonError(res, 404, 'The selected video file is unavailable.');
    return;
  }

  const rangeHeader = req.headers?.range;
  const range = rangeHeader ? parseDownloadRange(rangeHeader, size) : null;
  if (rangeHeader && (!range || range.unsatisfiable)) {
    res.statusCode = 416;
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Range', `bytes */${size}`);
    res.end();
    return;
  }

  const start = range ? range.start : 0;
  const end = range ? range.end : size - 1;
  const length = end - start + 1;
  const filename = safeFilename(file.filename, 'luma-download.mp4');
  res.statusCode = range ? 206 : 200;
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', String(length));
  res.setHeader('Content-Disposition', contentDisposition(filename));
  res.setHeader('Content-Type', downloadMimeType(filename));
  if (range) res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  try {
    await pipeline(createReadStream(file.filePath, { start, end }), res);
  } catch (error) {
    if (!res.headersSent) jsonError(res, 404, 'The selected video file could not be read.');
    else if (!res.writableEnded) res.destroy(error);
  }
}
