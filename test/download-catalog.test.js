import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDownloadCatalog } from '../lib/download-catalog.js';

test('catalog exposes existing local files ordered highest resolution first', async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'luma-download-catalog-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'media');
  await mkdir(path.join(root, 'movie'), { recursive: true });
  await writeFile(path.join(root, 'movie', 'full-hd.mp4'), Buffer.alloc(12));
  await writeFile(path.join(root, 'movie', 'hd.mp4'), Buffer.alloc(7));
  await writeFile(path.join(temp, 'outside.mp4'), Buffer.alloc(99));
  await symlink(path.join(temp, 'outside.mp4'), path.join(root, 'movie', 'outside.mp4'));
  const catalogPath = path.join(temp, 'catalog.json');
  await writeFile(catalogPath, JSON.stringify({
    movies: { '123': { title: 'Test title', qualities: [
      { id: '720p', label: '720p HD', height: 720, file: 'movie/hd.mp4' },
      { id: '1080p', label: '1080p Full HD', height: 1080, bitrate: 5_000_000, file: 'movie/full-hd.mp4', filename: '../unsafe:name.mp4' },
      { id: '2160p', label: '4K', height: 2160, file: 'movie/missing.mp4' },
      { id: 'escape', label: 'Outside path', height: 4320, file: '../outside.mp4' },
      { id: 'symlink', label: 'External symlink', height: 4320, file: 'movie/outside.mp4' },
    ] } },
  }));

  const service = createDownloadCatalog({ catalogPath, downloadRoot: root });
  const listing = service.list('movie', 123);
  assert.equal(listing.title, 'Test title');
  assert.deepEqual(listing.qualities.map(item => item.id), ['1080p', '720p']);
  assert.equal(listing.qualities[0].sizeBytes, 12);
  assert.equal(listing.qualities[0].filename.includes('/'), false);
  assert.equal(service.resolve('movie', 123, null, null, '1080p').filePath, path.join(root, 'movie', 'full-hd.mp4'));
  assert.equal(service.resolve('movie', 123, null, null, 'escape'), null);
});

test('series downloads are episode-specific and unsupported catalogue shapes fail closed', async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'luma-download-series-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'media');
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'episode.mp4'), 'video bytes');
  const catalogPath = path.join(temp, 'catalog.json');
  await writeFile(catalogPath, JSON.stringify({
    tv: { '456': { seasons: { '2': { episodes: { '4': { title: 'Episode 4', qualities: [
      { id: '1080p', label: '1080p', height: 1080, file: 'episode.mp4' },
    ] } } } } } },
  }));
  const service = createDownloadCatalog({ catalogPath, downloadRoot: root });
  assert.equal(service.list('tv', 456, 2, 4).qualities.length, 1);
  assert.equal(service.list('tv', 456, 2, 3).qualities.length, 0);
  assert.equal(service.list('unknown', 456, 2, 4).qualities.length, 0);
});
