import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureRuntimeConfig } from './runtime-config.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = path.resolve(process.env.WEBXRAY_DATA_DIR || path.join(rootDir, 'data'));
const runtime = await ensureRuntimeConfig(dataDir);
if (runtime.created) console.log(`已生成首次运行配置：${runtime.file}`);

await import('./index.mjs');
