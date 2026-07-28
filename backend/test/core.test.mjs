import assert from 'node:assert/strict';
import test from 'node:test';
import { CoreController, xrayRuntimeFailure } from '../server/core.mjs';

test('extracts an actionable Xray startup failure', () => {
  const output = [
    'Xray 26.7.11',
    'Failed to start: app/proxyman/inbound: failed to listen TCP on 10808: address already in use'
  ].join('\n');
  assert.equal(
    xrayRuntimeFailure(output),
    'Failed to start: app/proxyman/inbound: failed to listen TCP on 10808: address already in use'
  );
  assert.equal(xrayRuntimeFailure('Configuration OK.'), '');
});

test('serializes core lifecycle operations', async () => {
  const controller = new CoreController({ store: null, dataDir: '/tmp' });
  const events = [];
  let releaseFirst;
  controller.startNow = async () => {
    events.push('start:begin');
    await new Promise((resolve) => { releaseFirst = resolve; });
    events.push('start:end');
    return 'started';
  };
  controller.stopNow = async () => {
    events.push('stop');
    return 'stopped';
  };

  const starting = controller.start();
  const stopping = controller.stop();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ['start:begin']);

  releaseFirst();
  assert.deepEqual(await Promise.all([starting, stopping]), ['started', 'stopped']);
  assert.deepEqual(events, ['start:begin', 'start:end', 'stop']);
});

test('continues the core queue after a failed operation', async () => {
  const controller = new CoreController({ store: null, dataDir: '/tmp' });
  controller.startNow = async () => { throw new Error('failed'); };
  controller.stopNow = async () => 'stopped';

  await assert.rejects(controller.start(), /failed/);
  assert.equal(await controller.stop(), 'stopped');
});
