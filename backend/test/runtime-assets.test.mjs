import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ensureRuntimeAssets, runtimeLayout } from '../server/runtime-assets.mjs';

test('uses one visible xray directory for binaries, geo data and generated config', () => {
  const layout = runtimeLayout('/data', 'linux');
  assert.equal(layout.binary, path.join('/data', 'xray', 'xray'));
  assert.equal(layout.geoip, path.join('/data', 'xray', 'geoip.dat'));
  assert.equal(layout.geosite, path.join('/data', 'xray', 'geosite.dat'));
  assert.equal(layout.config, path.join('/data', 'xray', 'config.json'));
  assert.equal(runtimeLayout('C:\\WebXray\\data', 'win32').binary, path.join('C:\\WebXray\\data', 'xray', 'xray.exe'));
});

test('copies bundled Xray files once and preserves user replacements', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'webxray-assets-'));
  const bundled = path.join(directory, 'bundled');
  const data = path.join(directory, 'data');
  try {
    await mkdir(bundled);
    await writeFile(path.join(bundled, 'xray'), 'bundled-binary');
    await writeFile(path.join(bundled, 'geoip.dat'), 'bundled-geoip');
    await writeFile(path.join(bundled, 'geosite.dat'), 'bundled-geosite');
    const environment = { WEBXRAY_BUNDLED_XRAY_DIR: bundled };

    const first = await ensureRuntimeAssets(data, environment, { platform: 'linux' });
    assert.equal(first.copied.length, 3);
    assert.equal(environment.XRAY_BIN, path.join(data, 'xray', 'xray'));
    assert.equal(environment.XRAY_LOCATION_ASSET, path.join(data, 'xray'));
    assert.equal((await stat(first.binary)).mode & 0o777, 0o755);

    await writeFile(first.geoip, 'user-geoip');
    const second = await ensureRuntimeAssets(data, environment, { platform: 'linux' });
    assert.equal(second.copied.length, 0);
    assert.equal(await readFile(first.geoip, 'utf8'), 'user-geoip');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
