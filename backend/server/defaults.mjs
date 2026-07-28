export function createDefaultState(environment = process.env) {
  return {
    version: 1,
    activeProfileId: null,
    profiles: [],
    subscriptions: [],
    settings: {
      mixedPort: 10808,
      allowLan: String(environment.WEBXRAY_DEFAULT_ALLOW_LAN || '').toLowerCase() === 'true',
      udpEnabled: true,
      sniffingEnabled: true,
      routeOnly: false,
      logLevel: 'warning',
      dnsServers: ['https+local://1.1.1.1/dns-query', 'localhost'],
      domainStrategy: 'AsIs',
      metricsPort: 11111,
      autoStart: true,
      muxEnabled: false,
      tunEnabled: false,
      tunAutoRoute: true,
      tunName: 'xray_tun',
      tunMtu: 9000,
      tunIpv6: false,
      tunGateway: ['169.254.10.1/30'],
      tunRoutes: ['0.0.0.0/1', '128.0.0.0/1'],
      inboundAuth: {
        enabled: false,
        username: '',
        password: ''
      }
    },
    routing: {
      mode: 'bypass-cn',
      blockAds: true,
      rules: []
    }
  };
}

export function normalizeState(value, environment = process.env) {
  const defaults = createDefaultState(environment);
  if (!value || typeof value !== 'object') return defaults;
  return {
    ...defaults,
    ...value,
    profiles: Array.isArray(value.profiles) ? value.profiles : [],
    subscriptions: Array.isArray(value.subscriptions) ? value.subscriptions : [],
    settings: {
      ...defaults.settings,
      ...(value.settings || {}),
      inboundAuth: {
        ...defaults.settings.inboundAuth,
        ...(value.settings?.inboundAuth || {})
      }
    },
    routing: {
      ...defaults.routing,
      ...(value.routing || {}),
      rules: Array.isArray(value.routing?.rules) ? value.routing.rules : []
    }
  };
}
