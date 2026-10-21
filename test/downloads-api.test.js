import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDownloadCatalog } from '../lib/download-catalog.js';
import { streamDownloadFile } from '../lib/download-http.js';

const serverSource = await readFile(new URL('../server.js', import.meta.url), 'utf8');
test('Express local-download route resolves catalogue files and delegates to the tested streaming handler', () => {
  assert.match(serverSource, /app\.get\('\/api\/downloads\/:media\/:id\/file'/);
  assert.match(serverSource, /downloadCatalog\.resolve\(parts\.media, parts\.id, parts\.season, parts\.episode, qualityId\)/);
  assert.match(serverSource, /return streamDownloadFile\(req, res, file\)/);
});

test('local catalogue download returns the actual file bytes, quality order, and byte ranges over HTTP', async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'luma-download-api-'));
  const root = path.join(temp, 'media');
  await mkdir(path.join(root, 'movies'), { recursive: true });
  const file720 = Buffer.from('720p-file-bytes');
  const file1080 = Buffer.from('1080p-file-bytes');
  await writeFile(path.join(root, 'movies', 'movie-720.mp4'), file720);
  await writeFile(path.join(root, 'movies', 'movie-1080.mp4'), file1080);
  const catalogPath = path.join(temp, 'catalog.json');
  await writeFile(catalogPath, JSON.stringify({ movies: { '123': { title: 'API test movie', qualities: [
    { id: '720p', label: '720p HD', height: 720, file: 'movies/movie-720.mp4', filename: 'Movie-720p.mp4' },
    { id: '1080p', label: '1080p Full HD', height: 1080, file: 'movies/movie-1080.mp4', filename: 'Movie-1080p.mp4' },
  ] } } }));
  const catalog = createDownloadCatalog({ catalogPath, downloadRoot: root });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const fileMatch = url.pathname.match(/^\/api\/downloads\/(movie|tv)\/(\d+)\/file$/);
    if (fileMatch) {
      const file = catalog.resolve(fileMatch[1], Number(fileMatch[2]), null, null, url.searchParams.get('quality'));
      if (!file) { res.writeHead(404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Not found' })); return; }
      await streamDownloadFile(req, res, file);
      return;
    }
    const listMatch = url.pathname.match(/^\/api\/downloads\/(movie|tv)\/(\d+)$/);
    if (listMatch) {
      const listing = catalog.list(listMatch[1], Number(listMatch[2]));
      const qualities = listing.qualities.map(q => ({ ...q, downloadUrl: `/api/downloads/${listMatch[1]}/${listMatch[2]}/file?quality=${encodeURIComponent(q.id)}` }));
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ available: qualities.length > 0, title: listing.title, qualities }));
      return;
    }
    res.writeHead(404); res.end();
  });
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/downloads/movie/123`);
  assert.equal(response.status, 200);
  const listing = await response.json();
  assert.equal(listing.available, true);
  assert.equal(listing.title, 'API test movie');
  assert.equal(listing.qualities[0].id, '1080p');

  const fileUrl = `${base}${listing.qualities[0].downloadUrl}`;
  const fullResponse = await fetch(fileUrl);
  assert.equal(fullResponse.status, 200);
  assert.match(fullResponse.headers.get('content-disposition'), /Movie-1080p\.mp4/);
  assert.equal(fullResponse.headers.get('content-type'), 'video/mp4');
  assert.deepEqual(Buffer.from(await fullResponse.arrayBuffer()), file1080);

  const rangeResponse = await fetch(fileUrl, { headers: { Range: 'bytes=1-4' } });
  assert.equal(rangeResponse.status, 206);
  assert.equal(rangeResponse.headers.get('content-range'), `bytes 1-4/${file1080.length}`);
  assert.equal(Buffer.from(await rangeResponse.arrayBuffer()).toString(), '080p');

  const suffixResponse = await fetch(fileUrl, { headers: { Range: 'bytes=-4' } });
  assert.equal(suffixResponse.status, 206);
  assert.equal(Buffer.from(await suffixResponse.arrayBuffer()).toString(), file1080.subarray(-4).toString());

  const unsatisfiable = await fetch(fileUrl, { headers: { Range: `bytes=${file1080.length}-` } });
  assert.equal(unsatisfiable.status, 416);
  assert.equal(unsatisfiable.headers.get('content-range'), `bytes */${file1080.length}`);

  const missing = await fetch(`${base}/api/downloads/movie/123/file?quality=not-in-catalog`);
  assert.equal(missing.status, 404);
});
