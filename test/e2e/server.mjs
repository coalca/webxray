import { rm } from 'node:fs/promises';
import path from 'node:path';

const dataDir = '/tmp/webxray-playwright-data';
process.env.WEBXRAY_DATA_DIR = dataDir;
process.env.XRAY_BIN = path.resolve('test/e2e/fake-xray.mjs');
process.env.WEBXRAY_DISTRIBUTION = 'source';
await rm(dataDir, { recursive: true, force: true });
await import('../../backend/server/launcher.mjs');
