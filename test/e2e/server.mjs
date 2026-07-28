import { rm } from 'node:fs/promises';

const dataDir = '/tmp/webxray-playwright-data';
process.env.WEBXRAY_DATA_DIR = dataDir;
await rm(dataDir, { recursive: true, force: true });
await import('../../backend/server/launcher.mjs');
