import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_PORT = 3000;
const DEFAULT_TIMEZONE = 'Asia/Shanghai';

function normalizedPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('config.json 中的 webPort 必须是 1 到 65535 之间的整数');
  }
  return port;
}

function normalizedOrigins(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  }
  if (typeof value === 'string') {
    return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
  }
  throw new Error('config.json 中的 corsOrigins 必须是字符串数组');
}

export function normalizeRuntimeConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('config.json 必须是 JSON 对象');
  }
  const authToken = String(value.authToken || '').trim();
  if (authToken.length < 32) throw new Error('config.json 中的 authToken 不能少于 32 个字符');
  const timezone = String(value.timezone || '').trim();
  if (!timezone) throw new Error('config.json 中的 timezone 不能为空');
  return {
    authToken,
    webPort: normalizedPort(value.webPort),
    corsOrigins: normalizedOrigins(value.corsOrigins),
    timezone
  };
}

function generatedConfig(environment) {
  return normalizeRuntimeConfig({
    authToken: environment.WEBXRAY_AUTH_TOKEN || randomBytes(32).toString('hex'),
    webPort: environment.WEBXRAY_PORT || DEFAULT_PORT,
    corsOrigins: environment.WEBXRAY_CORS_ORIGINS || [],
    timezone: environment.TZ || DEFAULT_TIMEZONE
  });
}

async function readConfig(file) {
  let value;
  try {
    value = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${file} 不是有效 JSON`);
    throw error;
  }
  return normalizeRuntimeConfig(value);
}

export async function ensureRuntimeConfig(dataDir, environment = process.env) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const file = path.join(dataDir, 'config.json');
  let config;
  let created = false;
  try {
    config = await readConfig(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    config = generatedConfig(environment);
    try {
      await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      created = true;
    } catch (writeError) {
      if (writeError.code !== 'EEXIST') throw writeError;
      config = await readConfig(file);
    }
  }
  await chmod(file, 0o600);

  const effective = normalizeRuntimeConfig({
    authToken: environment.WEBXRAY_AUTH_TOKEN || config.authToken,
    webPort: environment.WEBXRAY_PORT || config.webPort,
    corsOrigins: Object.hasOwn(environment, 'WEBXRAY_CORS_ORIGINS')
      ? environment.WEBXRAY_CORS_ORIGINS
      : config.corsOrigins,
    timezone: environment.TZ || config.timezone
  });
  environment.WEBXRAY_AUTH_TOKEN = effective.authToken;
  environment.WEBXRAY_PORT = String(effective.webPort);
  environment.WEBXRAY_CORS_ORIGINS = effective.corsOrigins.join(',');
  environment.TZ = effective.timezone;
  return { config, effective, file, created };
}
