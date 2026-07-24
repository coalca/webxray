import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultState } from '../server/defaults.mjs';
import {
  normalizeBackupState,
  normalizeRouting,
  normalizeSettings,
  normalizeSubscription
} from '../server/validation.mjs';

test('normalizes boolean settings and validates TUN address families', () => {
  const defaults = createDefaultState().settings;
  const settings = normalizeSettings(defaults, {
    tunEnabled: 'false',
    tunAutoRoute: 'true',
    allowLan: '0'
  });
  assert.equal(settings.tunEnabled, false);
  assert.equal(settings.tunAutoRoute, true);
  assert.equal(settings.allowLan, false);

  assert.throws(() => normalizeSettings(defaults, {
    tunEnabled: true,
    tunGateway: ['fdfe:dcba:9876::1/126'],
    tunRoutes: ['0.0.0.0/1']
  }), /IPv4 TUN 路由/);
});

test('validates routing modes, ports and outbound tags', () => {
  const defaults = createDefaultState().routing;
  assert.throws(() => normalizeRouting(defaults, { mode: 'invalid' }), /路由模式无效/);
  assert.throws(() => normalizeRouting(defaults, {
    rules: [{ port: '70000', outboundTag: 'proxy' }]
  }), /端口无效/);
  assert.throws(() => normalizeRouting(defaults, {
    rules: [{ outboundTag: 'unknown' }]
  }), /出站无效/);
});

test('validates subscription URLs and headers', () => {
  assert.throws(() => normalizeSubscription({ name: '', url: 'https://example.com' }), /名称不能为空/);
  assert.throws(() => normalizeSubscription({ name: 'Local', url: 'file:///tmp/sub' }), /HTTP 或 HTTPS/);
  assert.throws(() => normalizeSubscription({
    name: 'Header',
    url: 'https://example.com/sub',
    userAgent: 'test\ninvalid'
  }), /不能包含换行/);
});

test('normalizes backup state and rejects invalid profile types', () => {
  const backup = normalizeBackupState({
    activeProfileId: 'missing',
    profiles: [],
    subscriptions: [],
    settings: { tunEnabled: 'false' },
    routing: { mode: 'proxy', rules: [] }
  });
  assert.equal(backup.activeProfileId, null);
  assert.equal(backup.settings.tunEnabled, false);
  assert.equal(backup.routing.mode, 'proxy');

  assert.throws(() => normalizeBackupState({
    profiles: [{ type: 'invalid' }]
  }), /节点类型无效/);
});
