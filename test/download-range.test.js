import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDownloadRange, downloadMimeType } from '../lib/download-range.js';

test('byte range helper supports fixed, open-ended, and suffix ranges', () => {
  assert.deepEqual(parseDownloadRange('bytes=1-4', 10), { start: 1, end: 4, length: 4 });
  assert.deepEqual(parseDownloadRange('bytes=5-', 10), { start: 5, end: 9, length: 5 });
  assert.deepEqual(parseDownloadRange('bytes=-3', 10), { start: 7, end: 9, length: 3 });
  assert.deepEqual(parseDownloadRange('bytes=8-99', 10), { start: 8, end: 9, length: 2 });
});

test('byte range helper rejects malformed and unsatisfiable ranges', () => {
  assert.equal(parseDownloadRange('bytes=-', 10), null);
  assert.equal(parseDownloadRange('bytes=0-1,4-5', 10), null);
  assert.equal(parseDownloadRange('nonsense', 10), null);
  assert.deepEqual(parseDownloadRange('bytes=10-11', 10), { unsatisfiable: true });
  assert.deepEqual(parseDownloadRange('bytes=8-7', 10), { unsatisfiable: true });
});

test('video mime type follows the actual filename extension', () => {
  assert.equal(downloadMimeType('Movie.MP4'), 'video/mp4');
  assert.equal(downloadMimeType('Episode.webm'), 'video/webm');
  assert.equal(downloadMimeType('Film.mkv'), 'video/x-matroska');
  assert.equal(downloadMimeType('No-extension'), 'application/octet-stream');
});
