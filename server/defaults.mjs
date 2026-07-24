export function createDefaultState() {
  return {
    version: 1,
    activeProfileId: null,
    profiles: [],
    subscriptions: [],
    settings: {
      mixedPort: 10808,
      allowLan: true,
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
      tunMtu: 9000,
      tunIpv6: false,
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

export function normalizeState(value) {
  const defaults = createDefaultState();
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
