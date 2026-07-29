import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_VERSION, systemInfo } from '../server/meta.mjs';

test('reports stable release and platform capabilities', () => {
  assert.equal(APP_VERSION, '0.3.1');
  assert.deepEqual(systemInfo({ WEBXRAY_DISTRIBUTION: 'docker' }, 'linux', 'arm64'), {
    name: 'WebXray',
    version: '0.3.1',
    platform: 'linux',
    arch: 'arm64',
    distribution: 'docker',
    capabilities: { tun: true, service: false, portable: false }
  });
  assert.deepEqual(systemInfo({ WEBXRAY_DISTRIBUTION: 'windows-service' }, 'win32', 'x64').capabilities, {
    tun: false,
    service: true,
    portable: false
  });
});

test('falls back to source for unknown distribution labels', () => {
  assert.equal(systemInfo({ WEBXRAY_DISTRIBUTION: 'unknown' }, 'linux', 'x64').distribution, 'source');
});
