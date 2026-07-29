export const APP_VERSION = '0.3.1';

const DISTRIBUTIONS = new Set(['source', 'docker', 'deb', 'windows-portable', 'windows-service']);

export function systemInfo(environment = process.env, platform = process.platform, arch = process.arch) {
  const requested = String(environment.WEBXRAY_DISTRIBUTION || 'source').trim().toLowerCase();
  const distribution = DISTRIBUTIONS.has(requested) ? requested : 'source';
  return {
    name: 'WebXray',
    version: APP_VERSION,
    platform,
    arch,
    distribution,
    capabilities: {
      tun: platform === 'linux',
      service: distribution === 'deb' || distribution === 'windows-service',
      portable: distribution === 'windows-portable'
    }
  };
}
