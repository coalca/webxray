import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureRuntimeAssets } from './runtime-assets.mjs';
import { ensureRuntimeConfig } from './runtime-config.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = path.resolve(process.env.WEBXRAY_DATA_DIR || path.join(rootDir, 'data'));
const commandMode = ['--print-token', '--print-url', '--doctor'].some((flag) => process.argv.includes(flag));
const runtime = await ensureRuntimeConfig(dataDir);
if (runtime.created && !commandMode) console.log(`已生成首次运行配置：${runtime.file}`);
const assets = await ensureRuntimeAssets(dataDir);
if (assets.copied.length && !commandMode) console.log(`已释放 Xray 运行文件：${assets.xrayDir}`);
if (process.argv.includes('--print-token')) {
  console.log(runtime.effective.authToken);
  process.exit(0);
}
if (process.argv.includes('--print-url')) {
  console.log(`http://127.0.0.1:${runtime.effective.webPort}`);
  process.exit(0);
}
if (process.argv.includes('--doctor')) {
  console.log(JSON.stringify({
    platform: process.platform,
    arch: process.arch,
    distribution: process.env.WEBXRAY_DISTRIBUTION || 'source',
    dataDir,
    webPort: runtime.effective.webPort,
    xray: assets.binaryAvailable,
    geoip: assets.geoipAvailable,
    geosite: assets.geositeAvailable,
    paths: {
      config: runtime.file,
      xray: assets.binary,
      assets: assets.xrayDir
    }
  }, null, 2));
  process.exit(0);
}

await import('./index.mjs');
