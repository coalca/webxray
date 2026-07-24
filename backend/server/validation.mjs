import { isIP } from 'node:net';
import { createDefaultState } from './defaults.mjs';
import { normalizeProfile, PROFILE_TYPES } from './profiles.mjs';
import { asBoolean, HttpError, id, isPlainObject, now } from './utils.mjs';

const LOG_LEVELS = new Set(['debug', 'info', 'warning', 'error', 'none']);
const DOMAIN_STRATEGIES = new Set(['AsIs', 'IPIfNonMatch', 'IPOnDemand']);
const ROUTING_MODES = new Set(['proxy', 'bypass-cn', 'direct']);
const OUTBOUND_TAGS = new Set(['proxy', 'direct', 'block']);
const NETWORKS = new Set(['', 'tcp', 'udp', 'tcp,udp']);

function normalizeList(value) {
  return (Array.isArray(value) ? value : String(value || '').split(/[\n,]+/))
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function validCidr(value) {
  const separator = value.lastIndexOf('/');
  if (separator <= 0) return false;
  const address = value.slice(0, separator);
  const prefix = Number(value.slice(separator + 1));
  const version = isIP(address);
  return Boolean(version) && Number.isInteger(prefix) && prefix >= 0 && prefix <= (version === 4 ? 32 : 128);
}

function cidrVersion(value) {
  return isIP(value.slice(0, value.lastIndexOf('/')));
}

function validPortExpression(value) {
  if (!value) return true;
  return String(value).split(',').every((part) => {
    const match = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!match) return false;
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    return start >= 1 && end <= 65535 && start <= end;
  });
}

export function normalizeSettings(current = {}, patch = {}) {
  const defaults = createDefaultState().settings;
  const base = {
    ...defaults,
    ...current,
    inboundAuth: { ...defaults.inboundAuth, ...(current.inboundAuth || {}) }
  };
  const input = isPlainObject(patch) ? patch : {};
  const next = {
    ...base,
    ...input,
    inboundAuth: { ...base.inboundAuth, ...(input.inboundAuth || {}) }
  };

  for (const key of ['mixedPort', 'metricsPort']) {
    next[key] = Number(next[key]);
    if (!Number.isInteger(next[key]) || next[key] < 1 || next[key] > 65535) {
      throw new HttpError(400, `${key} 必须在 1 到 65535 之间`);
    }
  }
  if (next.mixedPort === next.metricsPort) throw new HttpError(400, 'mixedPort 和 metricsPort 不能相同');
  if (!LOG_LEVELS.has(next.logLevel)) throw new HttpError(400, '日志级别无效');
  if (!DOMAIN_STRATEGIES.has(next.domainStrategy)) throw new HttpError(400, 'Domain Strategy 无效');

  for (const key of [
    'allowLan',
    'udpEnabled',
    'sniffingEnabled',
    'routeOnly',
    'autoStart',
    'muxEnabled',
    'tunEnabled',
    'tunAutoRoute',
    'tunIpv6'
  ]) {
    next[key] = asBoolean(next[key], base[key]);
  }

  next.inboundAuth.enabled = asBoolean(next.inboundAuth.enabled, base.inboundAuth.enabled);
  next.inboundAuth.username = String(next.inboundAuth.username || '').trim();
  next.inboundAuth.password = String(next.inboundAuth.password || '');
  if (next.inboundAuth.enabled && (!next.inboundAuth.username || !next.inboundAuth.password)) {
    throw new HttpError(400, '启用本地代理认证时必须填写用户名和密码');
  }

  next.dnsServers = normalizeList(next.dnsServers);
  next.tunMtu = Number(next.tunMtu);
  if (!Number.isInteger(next.tunMtu) || next.tunMtu < 1280 || next.tunMtu > 9000) {
    throw new HttpError(400, 'TUN MTU 必须在 1280 到 9000 之间');
  }
  next.tunName = String(next.tunName || 'xray_tun').trim();
  if (!/^[a-zA-Z0-9_.-]{1,15}$/.test(next.tunName)) {
    throw new HttpError(400, 'TUN 接口名称只能包含字母、数字、点、下划线或连字符，最长 15 个字符');
  }
  next.tunGateway = normalizeList(next.tunGateway);
  next.tunRoutes = normalizeList(next.tunRoutes);
  if (!next.tunGateway.length || next.tunGateway.some((entry) => !validCidr(entry))) {
    throw new HttpError(400, 'TUN 接口地址必须是有效 CIDR');
  }
  if (next.tunRoutes.some((entry) => !validCidr(entry))) {
    throw new HttpError(400, 'TUN 自动路由必须是有效 CIDR');
  }
  if (next.tunEnabled && next.tunAutoRoute && !next.tunRoutes.length) {
    throw new HttpError(400, '启用 TUN 自动路由时至少需要一个目标 CIDR');
  }
  const hasIpv4Gateway = next.tunGateway.some((entry) => cidrVersion(entry) === 4);
  const hasIpv6Gateway = next.tunGateway.some((entry) => cidrVersion(entry) === 6);
  const hasIpv4Route = next.tunRoutes.some((entry) => cidrVersion(entry) === 4);
  const hasIpv6Route = next.tunRoutes.some((entry) => cidrVersion(entry) === 6);
  if (next.tunEnabled && hasIpv4Route && !hasIpv4Gateway) {
    throw new HttpError(400, 'IPv4 TUN 路由需要至少一个 IPv4 接口地址');
  }
  if (next.tunEnabled && hasIpv6Route && !hasIpv6Gateway && !next.tunIpv6) {
    throw new HttpError(400, 'IPv6 TUN 路由需要 IPv6 接口地址或启用 IPv6 接管');
  }
  return next;
}

export function normalizeRouting(current = {}, patch = {}) {
  const defaults = createDefaultState().routing;
  const base = { ...defaults, ...current };
  const input = isPlainObject(patch) ? patch : {};
  const mode = String(input.mode ?? base.mode);
  if (!ROUTING_MODES.has(mode)) throw new HttpError(400, '路由模式无效');
  const rawRules = input.rules === undefined ? base.rules : input.rules;
  if (!Array.isArray(rawRules)) throw new HttpError(400, '路由规则必须是数组');

  const rules = rawRules.map((raw, index) => {
    if (!isPlainObject(raw)) throw new HttpError(400, `第 ${index + 1} 条路由规则无效`);
    const outboundTag = String(raw.outboundTag || 'proxy');
    const network = String(raw.network || '');
    const port = String(raw.port || '').trim();
    if (!OUTBOUND_TAGS.has(outboundTag)) throw new HttpError(400, `第 ${index + 1} 条路由规则的出站无效`);
    if (!NETWORKS.has(network)) throw new HttpError(400, `第 ${index + 1} 条路由规则的网络类型无效`);
    if (!validPortExpression(port)) throw new HttpError(400, `第 ${index + 1} 条路由规则的端口无效`);
    return {
      id: String(raw.id || id('rule')),
      enabled: asBoolean(raw.enabled, true),
      name: String(raw.name || '').trim(),
      domain: normalizeList(raw.domain),
      ip: normalizeList(raw.ip),
      protocol: normalizeList(raw.protocol),
      inboundTag: normalizeList(raw.inboundTag),
      port,
      network,
      outboundTag
    };
  });

  return {
    mode,
    blockAds: asBoolean(input.blockAds, base.blockAds),
    rules
  };
}

export function normalizeSubscription(input, existing = {}) {
  if (!isPlainObject(input)) throw new HttpError(400, '订阅数据无效');
  const name = String(input.name ?? existing.name ?? '新订阅').trim();
  const url = String(input.url ?? existing.url ?? '').trim();
  const userAgent = String(input.userAgent ?? existing.userAgent ?? '').trim();
  if (!name) throw new HttpError(400, '订阅名称不能为空');
  if (!url) throw new HttpError(400, '订阅地址不能为空');
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new HttpError(400, '订阅地址无效');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new HttpError(400, '订阅仅支持 HTTP 或 HTTPS');
  }
  if (/[\r\n]/.test(userAgent)) throw new HttpError(400, '订阅 User-Agent 不能包含换行');
  return {
    id: String(existing.id || input.id || id('sub')),
    name,
    url,
    userAgent,
    enabled: asBoolean(input.enabled, existing.enabled ?? true),
    nodeCount: Number(existing.nodeCount ?? input.nodeCount ?? 0) || 0,
    lastError: String(existing.lastError ?? input.lastError ?? ''),
    createdAt: existing.createdAt || input.createdAt || now(),
    updatedAt: existing.updatedAt ?? input.updatedAt ?? null
  };
}

export function normalizeBackupState(input) {
  if (!isPlainObject(input) || !Array.isArray(input.profiles)) {
    throw new HttpError(400, '备份文件格式无效');
  }
  const defaults = createDefaultState();
  const profiles = input.profiles.map((profile, index) => {
    if (!isPlainObject(profile) || !PROFILE_TYPES.includes(profile.type)) {
      throw new HttpError(400, `备份中的第 ${index + 1} 个节点类型无效`);
    }
    try {
      return normalizeProfile(profile);
    } catch (error) {
      throw new HttpError(400, `备份中的第 ${index + 1} 个节点无效：${error.message}`);
    }
  });
  const profileIds = new Set(profiles.map((profile) => profile.id));
  if (profileIds.size !== profiles.length) throw new HttpError(400, '备份中存在重复节点 ID');

  const subscriptions = (Array.isArray(input.subscriptions) ? input.subscriptions : [])
    .map((subscription) => normalizeSubscription(subscription, subscription));
  const subscriptionIds = new Set(subscriptions.map((subscription) => subscription.id));
  if (subscriptionIds.size !== subscriptions.length) throw new HttpError(400, '备份中存在重复订阅 ID');
  for (const profile of profiles) {
    if (profile.subscriptionId && !subscriptionIds.has(profile.subscriptionId)) profile.subscriptionId = null;
  }

  return {
    version: 1,
    activeProfileId: profileIds.has(input.activeProfileId) ? input.activeProfileId : null,
    profiles,
    subscriptions,
    settings: normalizeSettings(defaults.settings, input.settings || {}),
    routing: normalizeRouting(defaults.routing, input.routing || {})
  };
}
