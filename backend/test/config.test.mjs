import assert from 'node:assert/strict';
import test from 'node:test';
import { generateXrayConfig } from '../server/config.mjs';
import { xrayValidationFailed, xrayVersionBefore } from '../server/core.mjs';
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

test('generates TUN inbound with explicit gateway and route CIDRs', () => {
  const state = createDefaultState();
  const profile = normalizeProfile({
    type: 'vless',
    name: 'Tun',
    server: 'example.com',
    port: 443,
    uuid: '11111111-1111-1111-1111-111111111111'
  });
  state.profiles = [profile];
  state.activeProfileId = profile.id;
  state.settings.tunEnabled = true;
  state.settings.tunName = 'tun0';
  state.settings.tunMtu = 1500;
  state.settings.tunGateway = ['169.254.10.1/30'];
  state.settings.tunRoutes = ['10.0.0.0/8'];

  const config = generateXrayConfig(state);
  const tun = config.inbounds.find((inbound) => inbound.protocol === 'tun');
  assert.equal(tun.settings.name, 'tun0');
  assert.equal(tun.settings.mtu, 1500);
  assert.deepEqual(tun.settings.gateway, ['169.254.10.1/30']);
  assert.deepEqual(tun.settings.autoSystemRoutingTable, ['10.0.0.0/8']);

  state.settings.tunAutoRoute = false;
  const manual = generateXrayConfig(state).inbounds.find((inbound) => inbound.protocol === 'tun');
  assert.equal(manual.settings.autoSystemRoutingTable, undefined);
});

test('uses split default routes and adds split IPv6 routes when requested', () => {
  const state = createDefaultState();
  const profile = normalizeProfile({
    type: 'vless',
    name: 'Tun defaults',
    server: 'example.com',
    port: 443,
    uuid: '11111111-1111-1111-1111-111111111111'
  });
  state.profiles = [profile];
  state.activeProfileId = profile.id;
  state.settings.tunEnabled = true;
  state.settings.tunIpv6 = true;

  const tun = generateXrayConfig(state).inbounds.find((inbound) => inbound.protocol === 'tun');
  assert.deepEqual(tun.settings.autoSystemRoutingTable, [
    '0.0.0.0/1',
    '128.0.0.0/1',
    '::/1',
    '8000::/1'
  ]);
  assert.deepEqual(tun.settings.gateway, ['169.254.10.1/30', 'fdfe:dcba:9876::1/126']);
});

test('detects old Xray TUN routing versions and zero-exit validation failures', () => {
  assert.equal(xrayVersionBefore('Xray 26.3.27 (Xray)', [26, 7, 11]), true);
  assert.equal(xrayVersionBefore('Xray 26.7.11 (Xray)', [26, 7, 11]), false);
  assert.equal(xrayValidationFailed(0, 'Configuration OK.'), false);
  assert.equal(xrayValidationFailed(0, 'Failed to start: operation not permitted'), true);
});
