import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ensureRuntimeConfig, normalizeRuntimeConfig } from '../server/runtime-config.mjs';

test('generates a secure first-run config and applies it to the environment', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'webxray-runtime-'));
  try {
    const environment = {};
    const result = await ensureRuntimeConfig(directory, environment);
    const persisted = JSON.parse(await readFile(result.file, 'utf8'));
    const mode = (await stat(result.file)).mode & 0o777;

    assert.equal(result.created, true);
    assert.match(persisted.authToken, /^[a-f0-9]{64}$/);
    assert.equal(persisted.webPort, 3000);
    assert.deepEqual(persisted.corsOrigins, []);
    assert.equal(environment.WEBXRAY_AUTH_TOKEN, persisted.authToken);
    assert.equal(environment.WEBXRAY_PORT, '3000');
    assert.equal(mode, 0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('loads an existing config while preserving explicit environment overrides', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'webxray-runtime-'));
  try {
    await writeFile(path.join(directory, 'config.json'), JSON.stringify({
      authToken: 'a'.repeat(32),
      webPort: 3100,
      corsOrigins: ['https://ui.example.com'],
      timezone: 'UTC'
    }));
    const environment = { WEBXRAY_PORT: '3200' };
    const result = await ensureRuntimeConfig(directory, environment);

    assert.equal(result.created, false);
    assert.equal(environment.WEBXRAY_AUTH_TOKEN, 'a'.repeat(32));
    assert.equal(environment.WEBXRAY_PORT, '3200');
    assert.equal(environment.WEBXRAY_CORS_ORIGINS, 'https://ui.example.com');
    assert.equal(environment.TZ, 'UTC');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects invalid runtime configuration', () => {
  assert.throws(() => normalizeRuntimeConfig({
    authToken: 'short',
    webPort: 3000,
    corsOrigins: [],
    timezone: 'UTC'
  }), /authToken/);
  assert.throws(() => normalizeRuntimeConfig({
    authToken: 'a'.repeat(32),
    webPort: 70000,
    corsOrigins: [],
    timezone: 'UTC'
  }), /webPort/);
});

test('rejects invalid environment overrides', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'webxray-runtime-'));
  try {
    await assert.rejects(
      ensureRuntimeConfig(directory, { WEBXRAY_AUTH_TOKEN: 'too-short' }),
      /authToken/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
