import { isPlainObject, normalizeArray } from './utils.mjs';
import { validateProfile } from './profiles.mjs';

function transportSettings(profile) {
  const network = profile.transport || 'raw';
  const settings = { network, security: profile.security || 'none' };

  if (network === 'raw') {
    settings.rawSettings = { header: { type: 'none' } };
  } else if (network === 'ws') {
    settings.wsSettings = {
      path: profile.path || '/',
      headers: profile.host ? { Host: profile.host } : {}
    };
  } else if (network === 'grpc') {
    settings.grpcSettings = {
      serviceName: profile.serviceName || profile.path || '',
      authority: profile.host || undefined
    };
  } else if (network === 'httpupgrade') {
    settings.httpupgradeSettings = {
      path: profile.path || '/',
      host: profile.host || undefined
    };
  } else if (network === 'xhttp') {
    settings.xhttpSettings = {
      path: profile.path || '/',
      host: profile.host || undefined,
      mode: 'auto'
    };
  } else if (network === 'h2') {
    settings.httpSettings = {
      path: profile.path || '/',
      host: profile.host ? normalizeArray(profile.host) : undefined
    };
  } else if (network === 'kcp') {
    settings.kcpSettings = {
      header: { type: 'none' },
      seed: profile.path || undefined
    };
  }

  if (settings.security === 'tls') {
    settings.tlsSettings = {
      serverName: profile.sni || profile.host || profile.server,
      allowInsecure: Boolean(profile.allowInsecure),
      alpn: profile.alpn?.length ? profile.alpn : undefined,
      fingerprint: profile.fingerprint || undefined
    };
  } else if (settings.security === 'reality') {
    settings.realitySettings = {
      serverName: profile.sni || profile.server,
      fingerprint: profile.fingerprint || 'chrome',
      publicKey: profile.publicKey,
      shortId: profile.shortId || '',
      spiderX: profile.spiderX || '/'
    };
  }
  return stripUndefined(settings);
}

function proxyOutbound(profile, muxEnabled) {
  const outbound = {
    tag: 'proxy',
    protocol: profile.type,
    settings: {},
    streamSettings: transportSettings(profile),
    mux: { enabled: Boolean(muxEnabled) }
  };

  if (profile.type === 'vmess') {
    outbound.settings.vnext = [{
      address: profile.server,
      port: profile.port,
      users: [{
        id: profile.uuid,
        alterId: profile.alterId || 0,
        security: profile.encryption || 'auto'
      }]
    }];
  } else if (profile.type === 'vless') {
    outbound.settings.vnext = [{
      address: profile.server,
      port: profile.port,
      users: [{
        id: profile.uuid,
        encryption: profile.encryption || 'none',
        flow: profile.flow || undefined
      }]
    }];
  } else if (profile.type === 'trojan') {
    outbound.settings.servers = [{
      address: profile.server,
      port: profile.port,
      password: profile.password,
      flow: profile.flow || undefined
    }];
  } else if (profile.type === 'shadowsocks') {
    outbound.settings.servers = [{
      address: profile.server,
      port: profile.port,
      method: profile.method,
      password: profile.password,
      uot: true
    }];
    delete outbound.streamSettings;
  } else if (profile.type === 'socks') {
    outbound.settings.servers = [{
      address: profile.server,
      port: profile.port,
      users: profile.username || profile.password
        ? [{ user: profile.username, pass: profile.password }]
        : undefined
    }];
    delete outbound.streamSettings;
  } else if (profile.type === 'http') {
    outbound.settings.servers = [{
      address: profile.server,
      port: profile.port,
      users: profile.username || profile.password
        ? [{ user: profile.username, pass: profile.password }]
        : undefined
    }];
    if (profile.security !== 'tls') delete outbound.streamSettings;
  } else {
    throw new Error(`Xray 不支持节点类型 ${profile.type}`);
  }
  return stripUndefined(outbound);
}

function customRule(rule) {
  const result = {
    type: 'field',
    outboundTag: rule.outboundTag || 'proxy'
  };
  const domain = normalizeArray(rule.domain);
  const ip = normalizeArray(rule.ip);
  const protocol = normalizeArray(rule.protocol);
  const inboundTag = normalizeArray(rule.inboundTag);
  if (domain.length) result.domain = domain;
  if (ip.length) result.ip = ip;
  if (protocol.length) result.protocol = protocol;
  if (inboundTag.length) result.inboundTag = inboundTag;
  if (rule.port) result.port = String(rule.port);
  if (rule.network) result.network = rule.network;
  return Object.keys(result).length > 2 ? result : null;
}

function routingRules(routing) {
  const rules = (routing.rules || [])
    .filter((rule) => rule.enabled !== false)
    .map(customRule)
    .filter(Boolean);

  if (routing.blockAds) {
    rules.push({ type: 'field', domain: ['geosite:category-ads-all'], outboundTag: 'block' });
  }
  rules.push({
    type: 'field',
    ip: ['geoip:private'],
    domain: ['geosite:private'],
    outboundTag: 'direct'
  });
  if (routing.mode === 'bypass-cn') {
    rules.push({ type: 'field', domain: ['geosite:cn'], outboundTag: 'direct' });
    rules.push({ type: 'field', ip: ['geoip:cn'], outboundTag: 'direct' });
  } else if (routing.mode === 'direct') {
    rules.push({ type: 'field', network: 'tcp,udp', outboundTag: 'direct' });
  }
  return rules;
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .map(([key, entry]) => [key, stripUndefined(entry)]));
}

export function generateXrayConfig(state) {
  const profile = state.profiles.find((item) => item.id === state.activeProfileId);
  if (!profile) throw new Error('请先选择活动节点');
  validateProfile(profile);
  if (profile.security === 'reality' && !['raw', 'xhttp', 'grpc'].includes(profile.transport)) {
    throw new Error('REALITY 目前只支持 RAW、XHTTP 和 gRPC 传输');
  }
  if (profile.type === 'custom') return structuredClone(profile.customConfig);

  const settings = state.settings;
  const auth = settings.inboundAuth || {};
  const inboundSettings = {
    udp: settings.udpEnabled !== false,
    auth: auth.enabled ? 'password' : 'noauth',
    accounts: auth.enabled ? [{ user: auth.username, pass: auth.password }] : undefined
  };
  const inbounds = [{
    tag: 'mixed-in',
    listen: settings.allowLan ? '0.0.0.0' : '127.0.0.1',
    port: Number(settings.mixedPort),
    protocol: 'mixed',
    settings: inboundSettings,
    sniffing: {
      enabled: settings.sniffingEnabled !== false,
      destOverride: ['http', 'tls', 'quic'],
      routeOnly: Boolean(settings.routeOnly)
    }
  }];
  if (settings.tunEnabled) {
    const gateway = normalizeArray(settings.tunGateway || ['169.254.10.1/30']);
    const routes = normalizeArray(settings.tunRoutes || ['0.0.0.0/1', '128.0.0.0/1']);
    if (settings.tunIpv6 && !gateway.some((entry) => entry.includes(':'))) gateway.push('fdfe:dcba:9876::1/126');
    if (settings.tunIpv6 && settings.tunAutoRoute && !routes.some((entry) => entry.includes(':'))) {
      routes.push('::/1', '8000::/1');
    }
    const tunSettings = {
      name: settings.tunName || 'xray_tun',
      mtu: Number(settings.tunMtu) || 9000,
      gateway,
      autoOutboundsInterface: 'auto'
    };
    if (settings.tunAutoRoute) tunSettings.autoSystemRoutingTable = routes;
    inbounds.push({
      tag: 'tun-in',
      protocol: 'tun',
      settings: tunSettings,
      sniffing: {
        enabled: true,
        destOverride: ['http', 'tls'],
        routeOnly: Boolean(settings.routeOnly)
      }
    });
  }

  return stripUndefined({
    log: { loglevel: settings.logLevel || 'warning' },
    dns: {
      servers: settings.dnsServers?.length ? settings.dnsServers : ['localhost']
    },
    inbounds,
    outbounds: [
      proxyOutbound(profile, settings.muxEnabled),
      { tag: 'direct', protocol: 'freedom' },
      { tag: 'block', protocol: 'blackhole' }
    ],
    routing: {
      domainStrategy: settings.domainStrategy || 'AsIs',
      rules: routingRules(state.routing)
    },
    metrics: { listen: `127.0.0.1:${Number(settings.metricsPort)}` },
    stats: {},
    policy: {
      system: {
        statsOutboundUplink: true,
        statsOutboundDownlink: true
      }
    }
  });
}
