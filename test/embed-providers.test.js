import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createEmbedProviderRegistry } from '../lib/embed-providers.js';

async function withConfig(config, run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'luma-embed-providers-'));
  const configPath = path.join(dir, 'providers.json');
  try {
    if (config !== undefined) await writeFile(configPath, JSON.stringify(config), 'utf8');
    await run(configPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('provider registry exposes only enabled HTTPS templates with required placeholders', async () => {
  await withConfig({ providers: [
    { name: 'Studio Player', enabled: true, movie: 'https://media.example.com/movie/{id}', tv: 'https://media.example.com/tv/{id}/{season}/{episode}' },
    { name: 'Disabled Source', enabled: false, movie: 'https://disabled.example/movie/{id}', tv: 'https://disabled.example/tv/{id}/{season}/{episode}' },
    { name: 'Insecure Source', enabled: true, movie: 'http://media.example.com/movie/{id}', tv: 'https://media.example.com/tv/{id}/{season}/{episode}' },
    { name: 'Missing Episode Placeholders', enabled: true, movie: 'https://media.example.com/movie/{id}', tv: 'https://media.example.com/tv/{id}' },
    { name: 'Studio Player', enabled: true, movie: 'https://second.example/movie/{id}', tv: 'https://second.example/tv/{id}/{season}/{episode}' },
    { name: 'Bad Host Placeholder', enabled: true, movie: 'https://{id}.example.com/movie', tv: 'https://{id}.example.com/tv/{id}/{season}/{episode}' },
  ] }, async configPath => {
    const providers = createEmbedProviderRegistry({ configPath }).getProviders();
    assert.deepEqual(providers, [{
      name: 'Studio Player',
      movie: 'https://media.example.com/movie/{id}',
      tv: 'https://media.example.com/tv/{id}/{season}/{episode}',
    }, {
      name: 'Insecure Source',
      movie: null,
      tv: 'https://media.example.com/tv/{id}/{season}/{episode}',
    }, {
      name: 'Missing Episode Placeholders',
      movie: 'https://media.example.com/movie/{id}',
      tv: null,
    }]);
  });
});

test('missing or malformed provider config safely returns an empty list', async () => {
  await withConfig(undefined, async configPath => {
    assert.deepEqual(createEmbedProviderRegistry({ configPath }).getProviders(), []);
    await writeFile(configPath, '{not-json', 'utf8');
    assert.deepEqual(createEmbedProviderRegistry({ configPath }).getProviders(), []);
  });
  assert.deepEqual(createEmbedProviderRegistry().getProviders(), []);
});


test('packaged configuration enables known templates and excludes retired/unverified hosts', async () => {
  const configPath = new URL('../data/embed-providers.json', import.meta.url);
  const fs = await import('node:fs/promises');
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const providers = createEmbedProviderRegistry({ configPath: configPath.pathname }).getProviders();
  const names = providers.map(provider => provider.name);
  for (const required of ['CineSrc', 'FilmU', '2Embed', 'VidLink', 'VidRift', 'SuperEmbed', 'SmashyStream', 'VidEasy', 'VidSrc.cc', 'RiveStream', 'YapGrid', 'VidPlus', 'VidZee', 'Frembed', 'PrimeWire Embed', 'P-Stream']) {
    assert.ok(names.includes(required), `missing active provider: ${required}`);
  }
  for (const retired of ['Embed.su', 'VidSrc.pro', 'NonoFlix', 'HydraStream']) {
    assert.ok(config.providers.some(provider => provider.name === retired && provider.enabled === false), `expected ${retired} to remain disabled until verified`);
    assert.ok(!names.includes(retired), `retired/unverified provider should not be advertised: ${retired}`);
  }
  assert.equal(providers.length, 16);
  assert.equal(config.providers.find(provider => provider.name === 'SmashyStream').movie, 'https://embed.smashystream.com/playere.php?tmdb={id}');
  assert.equal(config.providers.find(provider => provider.name === 'P-Stream').movie, 'https://iframe.pstream.org/embed/tmdb-movie-{id}');
  assert.equal(config.providers.find(provider => provider.name === 'Frembed').tv, 'https://www.frembed.bar/embed/serie/{id}?sa={season}&epi={episode}');
  assert.ok(providers.every(provider => provider.movie && provider.tv));
});
