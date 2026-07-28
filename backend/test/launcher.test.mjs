import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execute = promisify(execFile);
const launcher = path.resolve('backend/server/launcher.mjs');

test('launcher utility commands return machine-readable output only', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'webxray-launcher-'));
  const token = 'c'.repeat(64);
  const environment = {
    ...process.env,
    WEBXRAY_DATA_DIR: dataDir,
    WEBXRAY_AUTH_TOKEN: token,
    WEBXRAY_PORT: '3456',
    WEBXRAY_DISTRIBUTION: 'deb'
  };
  delete environment.WEBXRAY_BUNDLED_XRAY_DIR;
  delete environment.XRAY_BIN;
  delete environment.XRAY_LOCATION_ASSET;
  delete environment.XRAY_RUNTIME_DIR;
  try {
    const tokenResult = await execute(process.execPath, [launcher, '--print-token'], { env: environment });
    assert.equal(tokenResult.stdout, `${token}\n`);

    const urlResult = await execute(process.execPath, [launcher, '--print-url'], { env: environment });
    assert.equal(urlResult.stdout, 'http://127.0.0.1:3456\n');

    const doctorResult = await execute(process.execPath, [launcher, '--doctor'], { env: environment });
    const doctor = JSON.parse(doctorResult.stdout);
    assert.equal(doctor.distribution, 'deb');
    assert.equal(doctor.webPort, 3456);
    assert.equal(doctor.xray, false);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
