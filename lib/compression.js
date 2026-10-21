import { gzipSync } from 'node:zlib';

const COMPRESSIBLE = /^(text\/|application\/(?:json|javascript|x-javascript|xml)|image\/svg\+xml)/i;

function acceptsGzip(header = '') {
  return String(header).split(',').some((part) => {
    const [coding, ...parameters] = part.trim().split(';');
    if (!['gzip', '*'].includes(String(coding || '').trim().toLowerCase())) return false;
    const qParam = parameters.find((param) => /^\s*q\s*=/.test(param));
    if (!qParam) return true;
    const q = Number(qParam.split('=')[1]);
    return Number.isFinite(q) && q > 0;
  });
}

function appendVary(res, value) {
  const current = String(res.getHeader('Vary') || '').trim();
  if (current === '*') return;
  const values = current ? current.split(',').map((part) => part.trim().toLowerCase()) : [];
  if (!values.includes(value.toLowerCase())) values.push(value);
  res.setHeader('Vary', values.filter(Boolean).join(', '));
}

/**
 * Bounded gzip response compression for small text responses and static JS/CSS.
 * It buffers at most maxBufferBytes per response, then switches back to passthrough.
 * Node's built-in zlib is used so the feature does not depend on an unavailable registry install.
 */
export function compressionMiddleware({ threshold = 1024, maxBufferBytes = 1024 * 1024 } = {}) {
  return (req, res, next) => {
    if (req.method === 'HEAD' || req.headers.range || !acceptsGzip(req.headers['accept-encoding'])) return next();

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    const chunks = [];
    let size = 0;
    let passthrough = false;
    let completed = false;

    const canCompress = () => {
      const contentType = String(res.getHeader('Content-Type') || '');
      const cacheControl = String(res.getHeader('Cache-Control') || '');
      return COMPRESSIBLE.test(contentType)
        && !res.getHeader('Content-Encoding')
        && !/no-transform/i.test(cacheControl)
        && ![204, 206, 304].includes(res.statusCode);
    };

    const flushBufferedRaw = () => {
      if (!chunks.length) return;
      const body = Buffer.concat(chunks);
      chunks.length = 0;
      size = 0;
      originalWrite(body);
    };

    const asBuffer = (chunk, encoding) => Buffer.isBuffer(chunk)
      ? chunk
      : ArrayBuffer.isView(chunk)
        ? Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
        : Buffer.from(String(chunk), typeof encoding === 'string' ? encoding : undefined);

    res.write = function writeCompressed(chunk, encoding, callback) {
      if (typeof encoding === 'function') { callback = encoding; encoding = undefined; }
      if (passthrough) return originalWrite(chunk, encoding, callback);
      if (chunk === null || chunk === undefined) return originalWrite(chunk, encoding, callback);
      const buffer = asBuffer(chunk, encoding);
      if (!canCompress() || size + buffer.length > maxBufferBytes) {
        passthrough = true;
        flushBufferedRaw();
        if (callback) return originalWrite(buffer, callback);
        return originalWrite(buffer);
      }
      chunks.push(buffer);
      size += buffer.length;
      if (callback) process.nextTick(callback);
      return true;
    };

    res.end = function endCompressed(chunk, encoding, callback) {
      if (typeof chunk === 'function') { callback = chunk; chunk = undefined; encoding = undefined; }
      else if (typeof encoding === 'function') { callback = encoding; encoding = undefined; }
      if (completed) return res;
      completed = true;
      if (passthrough) return originalEnd(chunk, encoding, callback);

      if (chunk !== undefined && chunk !== null) {
        const buffer = asBuffer(chunk, encoding);
        if (!canCompress() || size + buffer.length > maxBufferBytes) {
          passthrough = true;
          flushBufferedRaw();
          return originalEnd(buffer, callback);
        }
        chunks.push(buffer);
        size += buffer.length;
      }

      const body = chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
      chunks.length = 0;
      if (body.length < threshold || !canCompress()) {
        return originalEnd(body.length ? body : undefined, callback);
      }

      const compressed = gzipSync(body, { level: 5 });
      if (compressed.length >= body.length) return originalEnd(body, callback);

      appendVary(res, 'Accept-Encoding');
      res.setHeader('Content-Encoding', 'gzip');
      res.removeHeader('Content-Length');
      res.removeHeader('Content-MD5');
      res.removeHeader('ETag');
      return originalEnd(compressed, callback);
    };

    next();
  };
}
