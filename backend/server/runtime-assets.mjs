import { constants } from 'node:fs';
import { access, chmod, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export function runtimeLayout(dataDir, platform = process.platform) {
  const xrayDir = path.join(dataDir, 'xray');
  return {
    dataDir,
    xrayDir,
    binary: path.join(xrayDir, platform === 'win32' ? 'xray.exe' : 'xray'),
    geoip: path.join(xrayDir, 'geoip.dat'),
    geosite: path.join(xrayDir, 'geosite.dat'),
    config: path.join(xrayDir, 'config.json'),
    candidateConfig: path.join(xrayDir, 'config.candidate.json')
  };
}

async function copyMissing(source, target, mode) {
  if (!source || await exists(target) || !await exists(source)) return false;
  try {
    await copyFile(source, target, constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return false;
  }
  if (mode && process.platform !== 'win32') await chmod(target, mode);
  return true;
}

export async function ensureRuntimeAssets(dataDir, environment = process.env, options = {}) {
  const platform = options.platform || process.platform;
  const layout = runtimeLayout(dataDir, platform);
  await mkdir(layout.xrayDir, { recursive: true, mode: 0o700 });

  const bundledDir = String(environment.WEBXRAY_BUNDLED_XRAY_DIR || '').trim();
  const binaryName = platform === 'win32' ? 'xray.exe' : 'xray';
  const copied = [];
  for (const [name, target, mode] of [
    [binaryName, layout.binary, 0o755],
    ['geoip.dat', layout.geoip, 0o644],
    ['geosite.dat', layout.geosite, 0o644]
  ]) {
    if (await copyMissing(bundledDir && path.join(bundledDir, name), target, mode)) copied.push(target);
  }

  if (platform !== 'win32' && await exists(layout.binary)) await chmod(layout.binary, 0o755);
  if (!environment.XRAY_BIN && await exists(layout.binary)) environment.XRAY_BIN = layout.binary;
  if (!environment.XRAY_LOCATION_ASSET && (await exists(layout.geoip) || await exists(layout.geosite))) {
    environment.XRAY_LOCATION_ASSET = layout.xrayDir;
  }
  environment.XRAY_RUNTIME_DIR ||= layout.xrayDir;

  return {
    ...layout,
    bundledDir: bundledDir || null,
    copied,
    binaryAvailable: await exists(environment.XRAY_BIN || layout.binary),
    geoipAvailable: await exists(layout.geoip),
    geositeAvailable: await exists(layout.geosite)
  };
}
