import { URL, URLSearchParams } from 'node:url';
import {
  asBoolean,
  asPort,
  asString,
  decodeBase64,
  encodeBase64,
  id,
  isPlainObject,
  normalizeArray,
  now
} from './utils.mjs';

export const PROFILE_TYPES = ['vless', 'vmess', 'trojan', 'shadowsocks', 'socks', 'http', 'custom'];
export const TRANSPORTS = ['raw', 'ws', 'grpc', 'httpupgrade', 'xhttp', 'h2', 'kcp'];
export const SECURITIES = ['none', 'tls', 'reality'];

const EMPTY_PROFILE = {
  type: 'vless',
  name: '',
  server: '',
  port: 443,
  uuid: '',
  password: '',
  username: '',
  method: 'aes-128-gcm',
  encryption: 'none',
  alterId: 0,
  flow: '',
  transport: 'raw',
  security: 'none',
  sni: '',
  host: '',
  path: '',
  serviceName: '',
  alpn: [],
  fingerprint: '',
  publicKey: '',
  shortId: '',
  spiderX: '',
  allowInsecure: false,
  group: '默认分组',
  subscriptionId: null,
  customConfig: null,
  stats: { delayMs: null, testedAt: null }
};

function displayName(profile) {
  return profile.name || `${profile.type.toUpperCase()} ${profile.server || '未命名节点'}`;
}

function queryValue(query, ...keys) {
  for (const key of keys) {
    const value = query.get(key);
    if (value !== null && value !== '') return value;
  }
  return '';
}

function parseUrlProfile(raw, type) {
  const url = new URL(raw);
  const query = url.searchParams;
  const user = decodeURIComponent(url.username || '');
  const name = decodeURIComponent(url.hash.slice(1) || '');
  const transportRaw = queryValue(query, 'type', 'net') || 'raw';
  const transport = transportRaw === 'tcp' ? 'raw' : transportRaw;
  const security = queryValue(query, 'security', 'tls') || (type === 'trojan' ? 'tls' : 'none');
  const profile = {
    ...EMPTY_PROFILE,
    type,
    name,
    server: url.hostname,
    port: asPort(url.port, type === 'trojan' ? 443 : 0),
    transport: TRANSPORTS.includes(transport) ? transport : 'raw',
    security: SECURITIES.includes(security) ? security : 'none',
    sni: queryValue(query, 'sni', 'serverName'),
    host: queryValue(query, 'host'),
    path: queryValue(query, 'path'),
    serviceName: queryValue(query, 'serviceName'),
    alpn: normalizeArray(queryValue(query, 'alpn')),
    fingerprint: queryValue(query, 'fp', 'fingerprint'),
    publicKey: queryValue(query, 'pbk', 'publicKey'),
    shortId: queryValue(query, 'sid', 'shortId'),
    spiderX: queryValue(query, 'spx', 'spiderX'),
    allowInsecure: asBoolean(queryValue(query, 'allowInsecure', 'insecure')),
    flow: queryValue(query, 'flow')
  };

  if (type === 'vless') {
    profile.uuid = user;
    profile.encryption = queryValue(query, 'encryption') || 'none';
  } else if (type === 'trojan') {
    profile.password = user;
  } else if (type === 'socks' || type === 'http') {
    profile.username = user;
    profile.password = decodeURIComponent(url.password || '');
  }
  return profile;
}

function parseVmess(raw) {
  const encoded = raw.slice('vmess://'.length);
  if (encoded.includes('@')) {
    const profile = parseUrlProfile(raw, 'vmess');
    profile.uuid = decodeURIComponent(new URL(raw).username || '');
    return profile;
  }
  const payload = JSON.parse(decodeBase64(encoded));
  const network = payload.net === 'tcp' ? 'raw' : (payload.net || 'raw');
  return {
    ...EMPTY_PROFILE,
    type: 'vmess',
    name: asString(payload.ps),
    server: asString(payload.add),
    port: asPort(payload.port),
    uuid: asString(payload.id),
    alterId: Number.parseInt(payload.aid || '0', 10) || 0,
    encryption: asString(payload.scy, 'auto'),
    transport: TRANSPORTS.includes(network) ? network : 'raw',
    security: SECURITIES.includes(payload.tls) ? payload.tls : 'none',
    sni: asString(payload.sni),
    host: asString(payload.host),
    path: asString(payload.path),
    serviceName: network === 'grpc' ? asString(payload.path) : '',
    alpn: normalizeArray(payload.alpn),
    fingerprint: asString(payload.fp),
    allowInsecure: payload.insecure === '1' || payload.insecure === 1
  };
}

function parseShadowsocks(raw) {
  const noScheme = raw.slice('ss://'.length);
  const fragmentIndex = noScheme.indexOf('#');
  const main = fragmentIndex >= 0 ? noScheme.slice(0, fragmentIndex) : noScheme;
  const name = fragmentIndex >= 0 ? decodeURIComponent(noScheme.slice(fragmentIndex + 1)) : '';
  const atIndex = main.lastIndexOf('@');
  if (atIndex < 0) {
    const decoded = decodeBase64(main);
    const match = decoded.match(/^(.+?):(.*?)@(.+?):(\d+)$/);
    if (!match) throw new Error('无法解析 Shadowsocks 分享链接');
    return {
      ...EMPTY_PROFILE,
      type: 'shadowsocks',
      name,
      method: match[1],
      password: match[2],
      server: match[3],
      port: asPort(match[4])
    };
  }
  const addressPart = main.slice(atIndex + 1).split('?')[0];
  const credentials = main.slice(0, atIndex);
  const decodedCredentials = credentials.includes(':') ? decodeURIComponent(credentials) : decodeBase64(credentials);
  const credentialIndex = decodedCredentials.indexOf(':');
  const hostPortIndex = addressPart.lastIndexOf(':');
  if (credentialIndex <= 0 || hostPortIndex <= 0) throw new Error('无法解析 Shadowsocks 分享链接');
  return {
    ...EMPTY_PROFILE,
    type: 'shadowsocks',
    name,
    method: decodedCredentials.slice(0, credentialIndex),
    password: decodedCredentials.slice(credentialIndex + 1),
    server: addressPart.slice(0, hostPortIndex),
    port: asPort(addressPart.slice(hostPortIndex + 1))
  };
}

function parseCustom(raw) {
  const config = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!isPlainObject(config)) throw new Error('完整 Xray 配置必须是 JSON 对象');
  return {
    ...EMPTY_PROFILE,
    type: 'custom',
    name: asString(config.remarks, '完整 Xray 配置'),
    customConfig: config
  };
}

export function parseShareLink(raw) {
  const source = asString(raw);
  if (!source) throw new Error('分享链接为空');
  if (source.startsWith('{')) return parseCustom(source);
  const scheme = source.slice(0, source.indexOf('://')).toLowerCase();
  try {
    switch (scheme) {
      case 'vless': return parseUrlProfile(source, 'vless');
      case 'trojan': return parseUrlProfile(source, 'trojan');
      case 'socks': return parseUrlProfile(source, 'socks');
      case 'http': return parseUrlProfile(source, 'http');
      case 'https': {
        const profile = parseUrlProfile(source, 'http');
        profile.security = 'tls';
        return profile;
      }
      case 'vmess': return parseVmess(source);
      case 'ss': return parseShadowsocks(source);
      default: throw new Error(`暂不支持 ${scheme || '未知'} 协议`);
    }
  } catch (error) {
    throw new Error(`导入失败：${error.message}`);
  }
}

export function parseSubscriptionText(body) {
  const raw = String(body || '').trim();
  if (!raw) return { profiles: [], errors: [] };
  const decoded = raw.includes('://') || raw.includes('\n') ? raw : decodeBase64(raw);
  const lines = decoded.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const profiles = [];
  const errors = [];
  for (const line of lines) {
    try {
      profiles.push(parseShareLink(line));
    } catch (error) {
      errors.push(error.message);
    }
  }
  return { profiles, errors };
}

export function normalizeProfile(input, existing = {}) {
  const raw = isPlainObject(input) ? input : {};
  const type = PROFILE_TYPES.includes(raw.type) ? raw.type : existing.type || EMPTY_PROFILE.type;
  const profile = {
    ...EMPTY_PROFILE,
    ...existing,
    ...raw,
    id: existing.id || raw.id || id('node'),
    type,
    name: asString(raw.name, existing.name || ''),
    server: asString(raw.server, existing.server || ''),
    port: asPort(raw.port, existing.port || (type === 'trojan' ? 443 : 0)),
    uuid: asString(raw.uuid, existing.uuid || ''),
    password: asString(raw.password, existing.password || ''),
    username: asString(raw.username, existing.username || ''),
    method: asString(raw.method, existing.method || 'aes-128-gcm'),
    encryption: asString(raw.encryption, existing.encryption || (type === 'vless' ? 'none' : 'auto')),
    alterId: Number.parseInt(raw.alterId ?? existing.alterId ?? 0, 10) || 0,
    flow: asString(raw.flow, existing.flow || ''),
    transport: TRANSPORTS.includes(raw.transport) ? raw.transport : (TRANSPORTS.includes(existing.transport) ? existing.transport : 'raw'),
    security: SECURITIES.includes(raw.security) ? raw.security : (SECURITIES.includes(existing.security) ? existing.security : 'none'),
    sni: asString(raw.sni, existing.sni || ''),
    host: asString(raw.host, existing.host || ''),
    path: asString(raw.path, existing.path || ''),
    serviceName: asString(raw.serviceName, existing.serviceName || ''),
    alpn: normalizeArray(raw.alpn ?? existing.alpn),
    fingerprint: asString(raw.fingerprint, existing.fingerprint || ''),
    publicKey: asString(raw.publicKey, existing.publicKey || ''),
    shortId: asString(raw.shortId, existing.shortId || ''),
    spiderX: asString(raw.spiderX, existing.spiderX || ''),
    allowInsecure: asBoolean(raw.allowInsecure, asBoolean(existing.allowInsecure)),
    group: asString(raw.group, existing.group || '默认分组'),
    subscriptionId: raw.subscriptionId ?? existing.subscriptionId ?? null,
    customConfig: type === 'custom' ? (raw.customConfig ?? existing.customConfig ?? null) : null,
    createdAt: existing.createdAt || raw.createdAt || now(),
    updatedAt: now(),
    stats: { ...EMPTY_PROFILE.stats, ...existing.stats, ...raw.stats }
  };
  validateProfile(profile);
  profile.name = displayName(profile);
  return profile;
}

export function validateProfile(profile) {
  if (profile.type === 'custom') {
    if (!isPlainObject(profile.customConfig)) throw new Error('完整 Xray 配置不能为空');
    return;
  }
  if (!profile.server) throw new Error('服务器地址不能为空');
  if (!asPort(profile.port)) throw new Error('端口必须在 1 到 65535 之间');
  if ((profile.type === 'vless' || profile.type === 'vmess') && !profile.uuid) throw new Error('UUID 不能为空');
  if ((profile.type === 'trojan' || profile.type === 'shadowsocks') && !profile.password) throw new Error('密码不能为空');
  if (profile.type === 'shadowsocks' && !profile.method) throw new Error('加密方法不能为空');
  if (profile.security === 'reality' && !profile.publicKey) throw new Error('REALITY 公钥不能为空');
}

function urlWithProfile(profile, scheme, user, query, password = '') {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value) && value.length) params.set(key, value.join(','));
    else if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const search = params.toString();
  const fragment = profile.name ? `#${encodeURIComponent(profile.name)}` : '';
  const credentials = user || password
    ? `${encodeURIComponent(user)}${password ? `:${encodeURIComponent(password)}` : ''}@`
    : '';
  return `${scheme}://${credentials}${profile.server}:${profile.port}${search ? `?${search}` : ''}${fragment}`;
}

function transportQuery(profile) {
  const result = {
    type: profile.transport === 'raw' ? 'tcp' : profile.transport,
    security: profile.security,
    sni: profile.sni,
    host: profile.host,
    path: profile.path,
    serviceName: profile.serviceName,
    alpn: profile.alpn,
    fp: profile.fingerprint,
    pbk: profile.publicKey,
    sid: profile.shortId,
    spx: profile.spiderX,
    allowInsecure: profile.allowInsecure ? '1' : ''
  };
  return result;
}

export function toShareLink(profile) {
  if (profile.type === 'custom') return JSON.stringify(profile.customConfig, null, 2);
  if (profile.type === 'vless') return urlWithProfile(profile, 'vless', profile.uuid, { encryption: profile.encryption || 'none', flow: profile.flow, ...transportQuery(profile) });
  if (profile.type === 'trojan') return urlWithProfile(profile, 'trojan', profile.password, { flow: profile.flow, ...transportQuery(profile) });
  if (profile.type === 'socks' || profile.type === 'http') {
    const scheme = profile.type === 'http' && profile.security === 'tls' ? 'https' : profile.type;
    return urlWithProfile(profile, scheme, profile.username || '', {}, profile.password || '');
  }
  if (profile.type === 'shadowsocks') {
    const credential = encodeBase64(`${profile.method}:${profile.password}`);
    return `ss://${credential}@${profile.server}:${profile.port}${profile.name ? `#${encodeURIComponent(profile.name)}` : ''}`;
  }
  if (profile.type === 'vmess') {
    return `vmess://${encodeBase64(JSON.stringify({
      v: '2', ps: profile.name, add: profile.server, port: String(profile.port), id: profile.uuid,
      aid: String(profile.alterId || 0), scy: profile.encryption || 'auto', net: profile.transport === 'raw' ? 'tcp' : profile.transport,
      type: 'none', host: profile.host, path: profile.transport === 'grpc' ? profile.serviceName : profile.path,
      tls: profile.security, sni: profile.sni, alpn: profile.alpn.join(','), fp: profile.fingerprint,
      insecure: profile.allowInsecure ? '1' : '0'
    }))}`;
  }
  throw new Error(`无法导出 ${profile.type} 节点`);
}
