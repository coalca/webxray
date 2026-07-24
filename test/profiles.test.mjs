import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeProfile, parseShareLink, parseSubscriptionText, toShareLink } from '../server/profiles.mjs';

test('parses VLESS links with transport and REALITY fields', () => {
  const profile = normalizeProfile(parseShareLink('vless://11111111-1111-1111-1111-111111111111@example.com:443?encryption=none&security=reality&type=grpc&sni=cdn.example.com&fp=chrome&pbk=public-key&sid=abcd&serviceName=edge#Tokyo'));
  assert.equal(profile.type, 'vless');
  assert.equal(profile.transport, 'grpc');
  assert.equal(profile.security, 'reality');
  assert.equal(profile.name, 'Tokyo');
  assert.equal(profile.publicKey, 'public-key');
});

test('round trips a VMess profile', () => {
  const original = normalizeProfile({
    type: 'vmess',
    name: 'VMess WS',
    server: 'example.com',
    port: 443,
    uuid: '11111111-1111-1111-1111-111111111111',
    transport: 'ws',
    security: 'tls',
    host: 'edge.example.com',
    path: '/ws'
  });
  const parsed = normalizeProfile(parseShareLink(toShareLink(original)));
  assert.equal(parsed.name, original.name);
  assert.equal(parsed.server, original.server);
  assert.equal(parsed.transport, 'ws');
  assert.equal(parsed.host, original.host);
});

test('parses base64 subscriptions and reports unsupported lines', () => {
  const source = [
    'trojan://secret@example.com:443?security=tls#One',
    'unsupported://value'
  ].join('\n');
  const parsed = parseSubscriptionText(Buffer.from(source).toString('base64'));
  assert.equal(parsed.profiles.length, 1);
  assert.equal(parsed.errors.length, 1);
});

test('preserves TLS when importing and exporting an HTTPS upstream', () => {
  const profile = normalizeProfile(parseShareLink('https://user:secret@proxy.example.com:8443#Office'));
  assert.equal(profile.type, 'http');
  assert.equal(profile.security, 'tls');
  assert.match(toShareLink(profile), /^https:\/\/user:secret@proxy\.example\.com:8443/);
});
