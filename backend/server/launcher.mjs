import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureRuntimeAssets } from './runtime-assets.mjs';
import { ensureRuntimeConfig } from './runtime-config.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = path.resolve(process.env.WEBXRAY_DATA_DIR || path.join(rootDir, 'data'));
const runtime = await ensureRuntimeConfig(dataDir);
if (runtime.created) console.log(`已生成首次运行配置：${runtime.file}`);
const assets = await ensureRuntimeAssets(dataDir);
if (assets.copied.length) console.log(`已释放 Xray 运行文件：${assets.xrayDir}`);
if (process.argv.includes('--print-token')) {
  console.log(runtime.config.authToken);
  process.exit(0);
}

await import('./index.mjs');
