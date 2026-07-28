import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map((value) => Number.parseInt(value, 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(first, second) {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

test('primary command colors meet WCAG AA contrast', () => {
  assert.ok(contrast('#0f766e', '#ffffff') >= 4.5);
  assert.ok(contrast('#55c7b8', '#102523') >= 4.5);
});

test('design stays restrained and responsive', async () => {
  const [css, app] = await Promise.all([
    readFile('frontend/styles.css', 'utf8'),
    readFile('frontend/app.js', 'utf8')
  ]);
  assert.doesNotMatch(css, /(?:linear|radial)-gradient/i);
  assert.doesNotMatch(css, /letter-spacing:\s*-/i);
  assert.match(css, /\.mobile-profile-list/);
  assert.match(css, /\.desktop-profile-list/);
  assert.match(app, /class="connection-button/);
  assert.match(app, /class="overview-band/);
  assert.match(app, /class="exposure-notice/);
  assert.match(app, /function updateNodeFields/);
});
