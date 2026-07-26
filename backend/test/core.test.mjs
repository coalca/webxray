import assert from 'node:assert/strict';
import test from 'node:test';
import { CoreController } from '../server/core.mjs';

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
