import assert from 'node:assert/strict';
import test from 'node:test';
import { generateXrayConfig } from '../server/config.mjs';
import { createDefaultState } from '../server/defaults.mjs';
import { normalizeProfile } from '../server/profiles.mjs';

test('generates a VLESS REALITY client config with mixed inbound and metrics', () => {
  const state = createDefaultState();
  const profile = normalizeProfile({
    type: 'vless',
    name: 'Reality',
    server: 'example.com',
    port: 443,
    uuid: '11111111-1111-1111-1111-111111111111',
    security: 'reality',
    transport: 'raw',
    sni: 'www.example.com',
    publicKey: 'test-public-key',
    shortId: 'abcd',
    fingerprint: 'chrome'
  });
  state.profiles = [profile];
  state.activeProfileId = profile.id;
  const config = generateXrayConfig(state);
  assert.equal(config.inbounds[0].protocol, 'mixed');
  assert.equal(config.outbounds[0].protocol, 'vless');
  assert.equal(config.outbounds[0].streamSettings.realitySettings.publicKey, 'test-public-key');
  assert.equal(config.metrics.listen, '127.0.0.1:11111');
  assert.ok(config.routing.rules.some((rule) => rule.outboundTag === 'direct'));
});

test('returns custom Xray JSON without mutation', () => {
  const state = createDefaultState();
  const custom = { log: { loglevel: 'debug' }, inbounds: [], outbounds: [] };
  const profile = normalizeProfile({ type: 'custom', name: 'Raw', customConfig: custom });
  state.profiles = [profile];
  state.activeProfileId = profile.id;
  assert.deepEqual(generateXrayConfig(state), custom);
});

test('rejects unsupported REALITY transport combinations before core validation', () => {
  const state = createDefaultState();
  const profile = normalizeProfile({
    type: 'vless',
    name: 'Invalid Reality WS',
    server: 'example.com',
    port: 443,
    uuid: '11111111-1111-1111-1111-111111111111',
    security: 'reality',
    transport: 'ws',
    publicKey: 'test-public-key'
  });
  state.profiles = [profile];
  state.activeProfileId = profile.id;
  assert.throws(() => generateXrayConfig(state), /REALITY.*RAW.*XHTTP.*gRPC/);
});
