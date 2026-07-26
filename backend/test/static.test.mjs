import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { serveStatic, staticAsset } from '../server/static.mjs';

class TestResponse {
  constructor() {
    this.status = null;
    this.headers = {};
    this.body = null;
  }

  writeHead(status, headers = {}) {
    this.status = status;
    Object.assign(this.headers, headers);
  }

  end(body) {
    this.body = body;
  }
}

test('maps only known frontend assets', () => {
  assert.deepEqual(staticAsset('/'), ['index.html', 'text/html; charset=utf-8']);
  assert.deepEqual(staticAsset('/styles.css'), ['styles.css', 'text/css; charset=utf-8']);
  assert.equal(staticAsset('/../server/index.mjs'), null);
  assert.equal(staticAsset('/%2e%2e/server/index.mjs'), null);
  assert.equal(staticAsset('/missing.js'), null);
});

test('serves frontend assets with HEAD and ETag support', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'webxray-static-'));
  try {
    await writeFile(path.join(directory, 'index.html'), '<h1>WebXray</h1>');

    const getResponse = new TestResponse();
    assert.equal(await serveStatic({ method: 'GET', url: '/', headers: {} }, getResponse, directory), true);
    assert.equal(getResponse.status, 200);
    assert.equal(getResponse.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(getResponse.body.toString(), '<h1>WebXray</h1>');

    const headResponse = new TestResponse();
    assert.equal(await serveStatic({ method: 'HEAD', url: '/', headers: {} }, headResponse, directory), true);
    assert.equal(headResponse.status, 200);
    assert.equal(headResponse.body, undefined);

    const cachedResponse = new TestResponse();
    const headers = { 'if-none-match': getResponse.headers.etag };
    assert.equal(await serveStatic({ method: 'GET', url: '/', headers }, cachedResponse, directory), true);
    assert.equal(cachedResponse.status, 304);
    assert.equal(cachedResponse.body, undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
