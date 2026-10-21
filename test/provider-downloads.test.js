import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProviderDownloadAdapter } from '../lib/provider-downloads.js';

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

test('provider adapter ranks only explicit, allowed direct-file renditions and scopes temporary links', async () => {
  const adapter = createProviderDownloadAdapter({
    resolverUrl: 'https://resolver.example.test/downloads',
    resolverToken: 'test-token',
    allowedHosts: ['media.example.test', 'cdn.example.test'],
    fetchImpl: async (url, options) => {
      assert.equal(new URL(url).searchParams.get('id'), '123');
      assert.equal(new URL(url).searchParams.get('type'), 'movie');
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      return jsonResponse({ title: 'Test film', qualities: [
        { id: '720p', label: '720p HD', height: 720, format: 'mp4', mimeType: 'video/mp4', downloadable: true, url: 'https://media.example.test/720.mp4' },
        { id: '4k', label: '4K UHD', height: 2160, bitrate: 12_000_000, format: 'mp4', mimeType: 'video/mp4', downloadable: true, url: 'https://cdn.example.test/signed-file' },
        { id: 'hostile', label: 'Hostile host', height: 4320, format: 'mp4', mimeType: 'video/mp4', downloadable: true, url: 'https://not-media.example.test/file.mp4' },
        { id: 'playlist', label: 'Playlist', height: 4320, format: 'mp4', mimeType: 'video/mp4', downloadable: true, url: 'https://media.example.test/master.m3u8' },
        { id: 'not-downloadable', label: 'No permission', height: 4320, format: 'mp4', mimeType: 'video/mp4', downloadable: false, url: 'https://media.example.test/blocked.mp4' },
      ] });
    },
  });

  const listed = await adapter.list({ media: 'movie', id: 123 });
  assert.equal(listed.configured, true);
  assert.equal(listed.title, 'Test film');
  assert.deepEqual(listed.qualities.map((quality) => quality.label), ['4K UHD', '720p HD']);
  const source = adapter.getSource(listed.qualities[0].sourceId, { media: 'movie', id: 123, season: null, episode: null });
  assert.equal(source.height, 2160);
  assert.equal(adapter.getSource(listed.qualities[0].sourceId, { media: 'movie', id: 999, season: null, episode: null }), null);
  assert.equal(adapter.isAllowedUrl('https://media.example.test/any-file.mp4'), true);
  assert.equal(adapter.isAllowedUrl('https://media.example.test.evil.test/any-file.mp4'), false);
  assert.equal(adapter.isAllowedUrl('https://media.example.test/manifest.m3u8'), false);
});


test('provider adapter accepts a source inventory only when entries explicitly identify direct downloadable files', async () => {
  const adapter = createProviderDownloadAdapter({
    resolverUrl: 'https://resolver.example.test/resolve',
    allowedHosts: ['media.example.test'],
    fetchImpl: async () => jsonResponse({ data: { sources: [
      { id: 'direct-1080', label: '1080p', height: 1080, format: 'mp4', mimeType: 'video/mp4', downloadable: true, url: 'https://media.example.test/movie.mp4' },
      { id: 'embed-only', label: 'Embed', height: 2160, format: 'mp4', mimeType: 'video/mp4', downloadable: true, url: 'https://media.example.test/embed/movie/123' },
      { id: 'not-authorized', label: 'Not downloadable', height: 4320, format: 'mp4', mimeType: 'video/mp4', downloadable: false, url: 'https://media.example.test/blocked.mp4' },
    ] } }),
  });
  const result = await adapter.list({ media: 'movie', id: 123 });
  assert.deepEqual(result.qualities.map(item => item.label), ['1080p']);
});

test('provider adapter returns an explicit unconfigured state rather than fake download links', async () => {
  const adapter = createProviderDownloadAdapter({ resolverUrl: '', allowedHosts: [] });
  const listed = await adapter.list({ media: 'movie', id: 1 });
  assert.equal(listed.configured, false);
  assert.equal(listed.qualities.length, 0);
});

test('provider file proxy forwards byte ranges, validates redirects and rejects playlists', async (t) => {
  const body = Buffer.from('actual-video-content-bytes');
  let rangeSeen = null;
  const localServer = http.createServer((req, res) => {
    if (new URL(req.url, 'http://127.0.0.1').pathname === '/resolve') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ qualities: [
        { id: '1080p', label: '1080p Full HD', height: 1080, format: 'mp4', mimeType: 'video/mp4', downloadable: true, url: `http://127.0.0.1:${localServer.address().port}/media.mp4`, filename: 'Test-1080p.mp4' },
      ] }));
      return;
    }
    if (req.url === '/media.mp4') {
      rangeSeen = req.headers.range || null;
      if (rangeSeen === 'bytes=2-5') {
        res.writeHead(206, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-range': `bytes 2-5/${body.length}`, 'content-length': '4' });
        res.end(body.subarray(2, 6));
      } else {
        res.writeHead(200, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': String(body.length) });
        res.end(body);
      }
      return;
    }
    if (req.url === '/playlist') {
      res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' });
      res.end('#EXTM3U');
      return;
    }
    if (req.url === '/redirect-hostile') {
      res.writeHead(302, { location: 'https://outside.example.test/file.mp4' });
      res.end();
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('missing');
  });
  localServer.listen(0, '127.0.0.1');
  await new Promise((resolve) => localServer.once('listening', resolve));
  t.after(() => new Promise((resolve) => localServer.close(resolve)));
  const origin = `http://127.0.0.1:${localServer.address().port}`;

  const adapter = createProviderDownloadAdapter({
    resolverUrl: `${origin}/resolve`,
    allowedHosts: ['127.0.0.1'],
    fetchImpl: fetch,
  });
  const listing = await adapter.list({ media: 'movie', id: 10 });
  assert.equal(listing.qualities.length, 1);
  const source = adapter.getSource(listing.qualities[0].sourceId, { media: 'movie', id: 10, season: null, episode: null });
  const ranged = await adapter.fetchFile(source, 'bytes=2-5');
  assert.equal(ranged.status, 206);
  assert.equal(rangeSeen, 'bytes=2-5');
  assert.equal(Buffer.from(await ranged.arrayBuffer()).toString(), body.subarray(2, 6).toString());

  await assert.rejects(() => adapter.fetchFile({ ...source, url: `${origin}/playlist` }, undefined), /not a downloadable video file|allowed|supported/);
  await assert.rejects(() => adapter.fetchFile({ ...source, url: `${origin}/redirect-hostile` }, undefined), /not allowed/);
  await assert.rejects(() => adapter.fetchFile(source, 'bytes=1-2,4-5'), /Invalid byte range/);
});

test('provider download HTTP route lists quality and streams direct files as attachments', async (t) => {
  try { await import('express'); await import('dotenv/config'); } catch { t.skip('Install project dependencies to run the HTTP integration test.'); return; }
  const temp = await mkdtemp(path.join(os.tmpdir(), 'luma-provider-downloads-'));
  let resolverServer;
  let appServer;
  const body720 = Buffer.from('720p-provider-file');
  const body1080 = Buffer.from('1080p-provider-file-bytes');
  resolverServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/resolve') {
      const origin = `http://127.0.0.1:${resolverServer.address().port}`;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ title: 'Provider integration test', qualities: [
        { id: '720p', label: '720p HD', height: 720, format: 'mp4', mimeType: 'video/mp4', downloadable: true, url: `${origin}/720.mp4`, filename: 'Provider-720p.mp4' },
        { id: '1080p', label: '1080p Full HD', height: 1080, bitrate: 5_000_000, format: 'mp4', mimeType: 'video/mp4', downloadable: true, url: `${origin}/1080.mp4`, filename: 'Provider-1080p.mp4' },
      ] }));
      return;
    }
    const file = url.pathname === '/720.mp4' ? body720 : url.pathname === '/1080.mp4' ? body1080 : null;
    if (!file) { res.writeHead(404); res.end(); return; }
    const match = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range || ''));
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), file.length - 1) : file.length - 1;
      res.writeHead(206, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${file.length}`, 'content-length': String(Math.max(0, end - start + 1)) });
      res.end(file.subarray(start, end + 1));
    } else {
      res.writeHead(200, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': String(file.length) });
      res.end(file);
    }
  });
  resolverServer.listen(0, '127.0.0.1');
  await new Promise((resolve) => resolverServer.once('listening', resolve));

  const oldEnv = {
    DOWNLOAD_CATALOG: process.env.DOWNLOAD_CATALOG,
    MEDIA_DOWNLOADS_DIR: process.env.MEDIA_DOWNLOADS_DIR,
    LUMA_DOWNLOAD_RESOLVER_URL: process.env.LUMA_DOWNLOAD_RESOLVER_URL,
    LUMA_DOWNLOAD_RESOLVER_TOKEN: process.env.LUMA_DOWNLOAD_RESOLVER_TOKEN,
    LUMA_DOWNLOAD_ALLOWED_HOSTS: process.env.LUMA_DOWNLOAD_ALLOWED_HOSTS,
  };
  process.env.DOWNLOAD_CATALOG = path.join(temp, 'catalog.json');
  process.env.MEDIA_DOWNLOADS_DIR = path.join(temp, 'media');
  process.env.LUMA_DOWNLOAD_RESOLVER_URL = `http://127.0.0.1:${resolverServer.address().port}/resolve`;
  process.env.LUMA_DOWNLOAD_RESOLVER_TOKEN = '';
  process.env.LUMA_DOWNLOAD_ALLOWED_HOSTS = '127.0.0.1';
  t.after(async () => {
    if (appServer) {
      appServer.closeAllConnections?.();
      await new Promise((resolve) => appServer.close(resolve));
    }
    resolverServer.closeAllConnections?.();
    await new Promise((resolve) => resolverServer.close(resolve));
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(temp, { recursive: true, force: true });
  });

  const { app } = await import('../server.js?provider-download-http-test');
  appServer = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => appServer.once('listening', resolve));
  const base = `http://127.0.0.1:${appServer.address().port}`;
  const response = await fetch(`${base}/api/downloads/movie/765?provider=VidKing`);
  assert.equal(response.status, 200);
  const listing = await response.json();
  assert.equal(listing.available, true);
  assert.equal(listing.title, 'Provider integration test');
  assert.equal(listing.qualities[0].label, '1080p Full HD');
  assert.equal(listing.qualities[0].provider, true);

  const fileUrl = `${base}${listing.qualities[0].downloadUrl}`;
  const download = await fetch(fileUrl);
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition'), /Provider-1080p\.mp4/);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), body1080);
  const ranged = await fetch(fileUrl, { headers: { Range: 'bytes=1-4' } });
  assert.equal(ranged.status, 206);
  assert.match(ranged.headers.get('content-range'), /^bytes 1-4\//);
  assert.equal(Buffer.from(await ranged.arrayBuffer()).toString(), body1080.subarray(1, 5).toString());
});
