import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoreController, tcpDelay } from './core.mjs';
import { normalizeProfile, parseShareLink, parseSubscriptionText, toShareLink } from './profiles.mjs';
import { serveStatic } from './static.mjs';
import { Store } from './store.mjs';
import { HttpError, now } from './utils.mjs';
import {
  normalizeBackupState,
  normalizeRouting,
  normalizeSettings,
  normalizeSubscription
} from './validation.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = path.resolve(process.env.WEBXRAY_DATA_DIR || path.join(rootDir, 'data'));
const frontendDir = path.resolve(process.env.WEBXRAY_FRONTEND_DIR || path.join(rootDir, 'frontend'));
const port = Number(process.env.WEBXRAY_PORT || 3000);
const host = process.env.WEBXRAY_HOST || '0.0.0.0';
const authToken = process.env.WEBXRAY_AUTH_TOKEN || '';
const corsOrigins = String(process.env.WEBXRAY_CORS_ORIGINS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const store = new Store(dataDir);
await store.init();
const core = new CoreController({
  store,
  dataDir,
  binary: process.env.XRAY_BIN,
  runtimeDir: process.env.XRAY_RUNTIME_DIR,
  assetDir: process.env.XRAY_LOCATION_ASSET
});
await core.init();

function json(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extraHeaders
  });
  res.end(`${JSON.stringify(body)}\n`);
}

function success(res, data = {}, extraHeaders = {}) {
  json(res, 200, { ok: true, ...data }, extraHeaders);
}

function applySecurityHeaders(res) {
  res.setHeader('content-security-policy', "default-src 'self'; connect-src 'self' http: https:; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('permissions-policy', 'camera=(), geolocation=(), microphone=()');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function originMatches(pattern, origin) {
  if (pattern === '*') return true;
  if (!pattern.includes('*')) return pattern === origin;
  return new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`).test(origin);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    if (new URL(origin).host === (forwardedHost || req.headers.host)) return true;
  } catch {
    return false;
  }
  const allowed = corsOrigins.some((pattern) => originMatches(pattern, origin));
  if (!allowed) return false;
  res.setHeader('vary', 'Origin');
  res.setHeader('access-control-allow-origin', corsOrigins.includes('*') ? '*' : origin);
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('access-control-allow-headers', req.headers['access-control-request-headers'] || 'content-type, authorization');
  res.setHeader('access-control-expose-headers', 'content-disposition');
  res.setHeader('access-control-max-age', '86400');
  return true;
}

function parseCookies(req) {
  const cookies = {};
  for (const part of String(req.headers.cookie || '').split(';').map((item) => item.trim()).filter(Boolean)) {
    try {
      const index = part.indexOf('=');
      if (index > 0) cookies[part.slice(0, index)] = decodeURIComponent(part.slice(index + 1));
    } catch {
      // Ignore malformed cookies instead of turning an auth check into a 500 response.
    }
  }
  return cookies;
}

function authenticated(req) {
  if (!authToken) return true;
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return bearer === authToken || parseCookies(req).webxray_session === authToken;
}

async function readJson(req, limit = 10 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, '请求体过大');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, '请求体不是有效 JSON');
  }
}

function profileIdentity(profile) {
  return [
    profile.type,
    profile.server,
    profile.port,
    profile.uuid,
    profile.username,
    profile.password,
    profile.method
  ].join('|');
}

function replaceState(draft, snapshot) {
  for (const key of Object.keys(draft)) delete draft[key];
  Object.assign(draft, structuredClone(snapshot));
}

async function transactionalUpdate(mutator, apply = false) {
  const snapshot = store.get();
  const wasRunning = core.status().running;
  try {
    const result = await store.update(mutator);
    if (apply && store.get().activeProfileId && core.status().available) await core.applyIfRunning();
    return result;
  } catch (error) {
    await store.update((draft) => replaceState(draft, snapshot));
    if (apply && wasRunning && snapshot.activeProfileId && core.status().available && !core.status().running) {
      try {
        await core.start();
      } catch (restoreError) {
        core.addLog('error', `恢复上一份配置失败：${restoreError.message}`);
      }
    }
    throw error;
  }
}

async function fetchSubscription(subscription) {
  let url;
  try {
    url = new URL(subscription.url);
  } catch {
    throw new Error('订阅地址无效');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('订阅仅支持 HTTP 或 HTTPS');
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    redirect: 'follow',
    headers: { 'user-agent': subscription.userAgent || 'v2rayN/7.0 WebXray/0.1' }
  });
  if (!response.ok) throw new Error(`订阅请求失败：HTTP ${response.status}`);
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 10 * 1024 * 1024) throw new Error('订阅内容超过 10 MiB 限制');
  const text = await response.text();
  if (Buffer.byteLength(text) > 10 * 1024 * 1024) throw new Error('订阅内容超过 10 MiB 限制');
  const parsed = parseSubscriptionText(text);
  if (!parsed.profiles.length) throw new Error(parsed.errors[0] || '订阅中没有可识别节点');
  return parsed;
}

async function updateSubscription(subscriptionId) {
  const state = store.get();
  const subscription = state.subscriptions.find((item) => item.id === subscriptionId);
  if (!subscription) throw new HttpError(404, '订阅不存在');
  const parsed = await fetchSubscription(subscription);
  const existing = state.profiles.filter((profile) => profile.subscriptionId === subscriptionId);
  const existingByIdentity = new Map(existing.map((profile) => [profileIdentity(profile), profile]));
  const normalized = [];
  const normalizeErrors = [];
  for (const raw of parsed.profiles) {
    try {
      const candidate = { ...raw, group: subscription.name, subscriptionId };
      const previous = existingByIdentity.get(profileIdentity(candidate));
      normalized.push(normalizeProfile(candidate, previous || {}));
    } catch (error) {
      normalizeErrors.push(error.message);
    }
  }
  if (!normalized.length) throw new Error(normalizeErrors[0] || '订阅中没有有效节点');
  const activeWasInSubscription = existing.some((profile) => profile.id === state.activeProfileId);
  const oldActive = existing.find((profile) => profile.id === state.activeProfileId);
  const replacementActive = oldActive
    ? normalized.find((profile) => profileIdentity(profile) === profileIdentity(oldActive))
    : null;
  await transactionalUpdate((draft) => {
    draft.profiles = [
      ...draft.profiles.filter((profile) => profile.subscriptionId !== subscriptionId),
      ...normalized
    ];
    if (activeWasInSubscription) draft.activeProfileId = replacementActive?.id || normalized[0]?.id || null;
    const target = draft.subscriptions.find((item) => item.id === subscriptionId);
    target.updatedAt = now();
    target.nodeCount = normalized.length;
    target.lastError = '';
  }, activeWasInSubscription && core.status().running);
  const errors = [...parsed.errors, ...normalizeErrors];
  return { imported: normalized.length, skipped: errors.length, errors };
}

async function handleApi(req, res, url) {
  const method = req.method || 'GET';
  const pathname = url.pathname;

  if (pathname === '/api/health') {
    return success(res, { status: 'ok', core: core.status().running ? 'running' : 'stopped' });
  }
  if (pathname === '/api/auth/status') {
    return success(res, { required: Boolean(authToken), authenticated: authenticated(req) });
  }
  if (pathname === '/api/auth/login' && method === 'POST') {
    const body = await readJson(req);
    if (!authToken || body.token === authToken) {
      return success(res, {}, {
        'set-cookie': `webxray_session=${encodeURIComponent(authToken)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`
      });
    }
    throw new HttpError(401, '访问令牌不正确');
  }
  if (pathname === '/api/auth/logout' && method === 'POST') {
    return success(res, {}, { 'set-cookie': 'webxray_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }
  if (!authenticated(req)) throw new HttpError(401, '需要登录');

  if (pathname === '/api/state' && method === 'GET') {
    return success(res, { state: store.get(), core: core.status(), tun: await core.tunStatus() });
  }
  if (pathname === '/api/core/status' && method === 'GET') {
    return success(res, { core: core.status(), tun: await core.tunStatus() });
  }
  if (pathname === '/api/tun/status' && method === 'GET') {
    return success(res, { tun: await core.tunStatus() });
  }
  if (pathname === '/api/core/config' && method === 'GET') {
    return success(res, { config: core.config() });
  }
  if (pathname === '/api/core/validate' && method === 'POST') {
    const result = await core.validate();
    return success(res, result);
  }
  if (pathname === '/api/core/start' && method === 'POST') {
    return success(res, { core: await core.start() });
  }
  if (pathname === '/api/core/stop' && method === 'POST') {
    return success(res, { core: await core.stop() });
  }
  if (pathname === '/api/core/restart' && method === 'POST') {
    return success(res, { core: await core.restart() });
  }
  if (pathname === '/api/logs' && method === 'GET') {
    return success(res, { logs: core.getLogs(Number(url.searchParams.get('after') || 0)) });
  }
  if (pathname === '/api/settings' && method === 'PUT') {
    const body = await readJson(req);
    await transactionalUpdate((draft) => {
      draft.settings = normalizeSettings(draft.settings, body);
    }, true);
    return success(res, { state: store.get(), core: core.status() });
  }
  if (pathname === '/api/routing' && method === 'PUT') {
    const body = await readJson(req);
    await transactionalUpdate((draft) => {
      draft.routing = normalizeRouting(draft.routing, body);
    }, true);
    return success(res, { state: store.get(), core: core.status() });
  }

  if (pathname === '/api/profiles' && method === 'POST') {
    const body = await readJson(req);
    const profile = normalizeProfile(body);
    await store.update((draft) => draft.profiles.push(profile));
    return json(res, 201, { ok: true, profile });
  }
  if (pathname === '/api/profiles/import' && method === 'POST') {
    const body = await readJson(req);
    const text = String(body.content || '');
    const parsed = text.trim().startsWith('{')
      ? { profiles: [parseShareLink(text)], errors: [] }
      : parseSubscriptionText(text);
    const group = String(body.group || '手动导入').trim() || '手动导入';
    const existingKeys = new Set(store.get().profiles.map(profileIdentity));
    const profiles = [];
    const normalizeErrors = [];
    for (const raw of parsed.profiles) {
      try {
        const profile = normalizeProfile({ ...raw, group, subscriptionId: null });
        const key = profileIdentity(profile);
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        profiles.push(profile);
      } catch (error) {
        normalizeErrors.push(error.message);
      }
    }
    await store.update((draft) => draft.profiles.push(...profiles));
    const errors = [...parsed.errors, ...normalizeErrors];
    return success(res, { imported: profiles.length, skipped: errors.length, errors });
  }
  if (pathname === '/api/profiles/test' && method === 'POST') {
    const body = await readJson(req);
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const profiles = store.get().profiles.filter((profile) => ids.includes(profile.id) && profile.type !== 'custom');
    const results = [];
    for (let index = 0; index < profiles.length; index += 8) {
      const batch = profiles.slice(index, index + 8);
      results.push(...await Promise.all(batch.map(async (profile) => ({
        id: profile.id,
        ...await tcpDelay(profile.server, profile.port)
      }))));
    }
    await store.update((draft) => {
      for (const result of results) {
        const profile = draft.profiles.find((item) => item.id === result.id);
        if (profile) profile.stats = { delayMs: result.delayMs, testedAt: now(), error: result.error || '' };
      }
    });
    return success(res, { results, state: store.get() });
  }

  const profileMatch = pathname.match(/^\/api\/profiles\/([^/]+)(?:\/(activate|share))?$/);
  if (profileMatch) {
    const profileId = decodeURIComponent(profileMatch[1]);
    const action = profileMatch[2];
    const current = store.get().profiles.find((profile) => profile.id === profileId);
    if (!current) throw new HttpError(404, '节点不存在');
    if (action === 'share' && method === 'GET') return success(res, { link: toShareLink(current) });
    if (action === 'activate' && method === 'POST') {
      const snapshot = store.get();
      const wasRunning = core.status().running;
      try {
        await store.update((draft) => { draft.activeProfileId = profileId; });
        const status = core.status().running ? await core.restart() : await core.start();
        return success(res, { state: store.get(), core: status });
      } catch (error) {
        await store.update((draft) => replaceState(draft, snapshot));
        if (wasRunning && snapshot.activeProfileId && core.status().available && !core.status().running) {
          try {
            await core.start();
          } catch (restoreError) {
            core.addLog('error', `恢复上一活动节点失败：${restoreError.message}`);
          }
        }
        throw error;
      }
    }
    if (!action && method === 'PUT') {
      const body = await readJson(req);
      const profile = normalizeProfile(body, current);
      await transactionalUpdate((draft) => {
        const index = draft.profiles.findIndex((item) => item.id === profileId);
        draft.profiles[index] = profile;
      }, store.get().activeProfileId === profileId);
      return success(res, { profile, state: store.get(), core: core.status() });
    }
    if (!action && method === 'DELETE') {
      const wasActive = store.get().activeProfileId === profileId;
      if (wasActive) await core.stop();
      await store.update((draft) => {
        draft.profiles = draft.profiles.filter((profile) => profile.id !== profileId);
        if (draft.activeProfileId === profileId) draft.activeProfileId = null;
      });
      return success(res, { state: store.get(), core: core.status() });
    }
  }

  if (pathname === '/api/subscriptions' && method === 'POST') {
    const body = await readJson(req);
    const subscription = normalizeSubscription(body);
    await store.update((draft) => draft.subscriptions.push(subscription));
    return json(res, 201, { ok: true, subscription });
  }
  if (pathname === '/api/subscriptions/update-all' && method === 'POST') {
    const targets = store.get().subscriptions.filter((item) => item.enabled);
    const results = [];
    for (const subscription of targets) {
      try {
        results.push({ id: subscription.id, ok: true, ...await updateSubscription(subscription.id) });
      } catch (error) {
        await store.update((draft) => {
          const target = draft.subscriptions.find((item) => item.id === subscription.id);
          if (target) target.lastError = error.message;
        });
        results.push({ id: subscription.id, ok: false, error: error.message });
      }
    }
    return success(res, { results, state: store.get() });
  }
  const subscriptionMatch = pathname.match(/^\/api\/subscriptions\/([^/]+)(?:\/update)?$/);
  if (subscriptionMatch) {
    const subscriptionId = decodeURIComponent(subscriptionMatch[1]);
    const isUpdate = pathname.endsWith('/update');
    const current = store.get().subscriptions.find((item) => item.id === subscriptionId);
    if (!current) throw new HttpError(404, '订阅不存在');
    if (isUpdate && method === 'POST') {
      try {
        return success(res, { ...await updateSubscription(subscriptionId), state: store.get(), core: core.status() });
      } catch (error) {
        await store.update((draft) => {
          const target = draft.subscriptions.find((item) => item.id === subscriptionId);
          target.lastError = error.message;
        });
        throw error;
      }
    }
    if (!isUpdate && method === 'PUT') {
      const body = await readJson(req);
      const subscription = normalizeSubscription(body, current);
      await store.update((draft) => {
        const target = draft.subscriptions.find((item) => item.id === subscriptionId);
        const previousName = target.name;
        Object.assign(target, subscription);
        if (target.name !== previousName) {
          for (const profile of draft.profiles) {
            if (profile.subscriptionId === subscriptionId) profile.group = target.name;
          }
        }
      });
      return success(res, { state: store.get() });
    }
    if (!isUpdate && method === 'DELETE') {
      const state = store.get();
      const removedProfileIds = new Set(state.profiles.filter((profile) => profile.subscriptionId === subscriptionId).map((profile) => profile.id));
      const removesActive = removedProfileIds.has(state.activeProfileId);
      if (removesActive) await core.stop();
      await store.update((draft) => {
        draft.subscriptions = draft.subscriptions.filter((item) => item.id !== subscriptionId);
        draft.profiles = draft.profiles.filter((profile) => profile.subscriptionId !== subscriptionId);
        if (removedProfileIds.has(draft.activeProfileId)) draft.activeProfileId = null;
      });
      return success(res, { state: store.get(), core: core.status() });
    }
  }

  if (pathname === '/api/backup' && method === 'GET') {
    return json(res, 200, {
      ok: true,
      exportedAt: now(),
      app: 'WebXray',
      state: store.get()
    }, { 'content-disposition': `attachment; filename="webxray-backup-${new Date().toISOString().slice(0, 10)}.json"` });
  }
  if (pathname === '/api/backup' && method === 'POST') {
    const body = await readJson(req);
    const imported = normalizeBackupState(body.state || body);
    await core.stop();
    await store.update((draft) => replaceState(draft, imported));
    return success(res, { state: store.get(), core: core.status() });
  }

  throw new HttpError(404, '接口不存在');
}

const server = createServer(async (req, res) => {
  let url;
  try {
    applySecurityHeaders(res);
    url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const corsAllowed = applyCors(req, res);
      if (req.method === 'OPTIONS') {
        res.writeHead(corsAllowed ? 204 : 403);
        res.end();
        return;
      }
      if (!corsAllowed) throw new HttpError(403, 'CORS origin is not allowed');
      await handleApi(req, res, url);
      return;
    }
    if (await serveStatic(req, res, frontendDir)) return;
    throw new HttpError(404, '页面不存在');
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) core.addLog('error', `${req.method} ${url?.pathname || req.url}: ${error.stack || error.message}`);
    json(res, status, { ok: false, error: error.message || '内部错误', details: error.details });
  }
});

server.headersTimeout = 10_000;
server.requestTimeout = 120_000;
server.keepAliveTimeout = 5_000;

server.listen(port, host, async () => {
  console.log(`WebXray listening on http://${host}:${port}`);
  const state = store.get();
  if (state.settings.autoStart && state.activeProfileId && core.status().available) {
    try {
      await core.start();
    } catch (error) {
      core.addLog('error', `自动启动失败：${error.message}`);
    }
  }
});

async function shutdown(signal) {
  core.addLog('system', `收到 ${signal}，正在关闭`);
  await core.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
