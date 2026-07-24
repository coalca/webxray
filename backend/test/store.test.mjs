import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Store } from '../server/store.mjs';

test('store queue continues after a failed mutation', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'webxray-store-'));
  const store = new Store(directory);
  await store.init();

  await assert.rejects(
    store.update(() => { throw new Error('invalid update'); }),
    /invalid update/
  );
  await store.update((draft) => { draft.settings.mixedPort = 18080; });

  assert.equal(store.get().settings.mixedPort, 18080);
  const persisted = JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8'));
  assert.equal(persisted.settings.mixedPort, 18080);
});
