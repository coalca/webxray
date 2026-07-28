import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createConnection } from 'node:net';
import { generateXrayConfig } from './config.mjs';
import { now } from './utils.mjs';

const MAX_LOGS = 1000;

function runCommand(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    const timer = options.timeout
      ? setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error(`命令超时：${binary} ${args.join(' ')}`));
        }, options.timeout)
      : null;
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function operationError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function hasTunInbound(config) {
  return Array.isArray(config?.inbounds) && config.inbounds.some((inbound) => inbound.protocol === 'tun');
}

function hasTunAutoRoutes(config) {
  return Array.isArray(config?.inbounds) && config.inbounds.some((inbound) => (
    inbound.protocol === 'tun'
    && Array.isArray(inbound.settings?.autoSystemRoutingTable)
    && inbound.settings.autoSystemRoutingTable.length > 0
  ));
}

function versionLineParts(versionLine) {
  const match = String(versionLine || '').match(/\bXray\s+(\d+)\.(\d+)\.(\d+)\b/i);
  return match ? match.slice(1).map(Number) : null;
}

export function xrayVersionBefore(versionLine, minimum) {
  const current = versionLineParts(versionLine);
  if (!current) return false;
  for (let index = 0; index < minimum.length; index += 1) {
    if (current[index] !== minimum[index]) return current[index] < minimum[index];
  }
  return false;
}

export function xrayValidationFailed(code, output) {
  return code !== 0 || /(?:^|\n)Failed to start:/i.test(String(output || ''));
}

export function xrayRuntimeFailure(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .findLast((line) => /Failed to start:/i.test(line)) || '';
}

export class CoreController extends EventEmitter {
  constructor({
    store,
    dataDir,
    binary = process.platform === 'win32' ? path.join(dataDir, 'xray', 'xray.exe') : path.join(dataDir, 'xray', 'xray'),
    runtimeDir = path.join(dataDir, 'xray'),
    assetDir = process.env.XRAY_LOCATION_ASSET || path.join(dataDir, 'xray')
  }) {
    super();
    this.store = store;
    this.binary = binary;
    this.assetDir = assetDir;
    this.runtimeDir = runtimeDir;
    this.configPath = path.join(this.runtimeDir, 'config.json');
    this.candidatePath = path.join(this.runtimeDir, 'config.candidate.json');
    this.child = null;
    this.logs = [];
    this.logSequence = 0;
    this.startedAt = null;
    this.lastExit = null;
    this.lastError = null;
    this.desiredRunning = false;
    this.version = null;
    this.traffic = {
      upRate: 0,
      downRate: 0,
      upTotal: 0,
      downTotal: 0,
      sampledAt: null
    };
    this.previousTraffic = null;
    this.operationQueue = Promise.resolve();
  }

  async init() {
    await mkdir(this.runtimeDir, { recursive: true });
    try {
      await access(this.binary);
      const result = await runCommand(this.binary, ['-version'], { timeout: 5000 });
      this.version = (result.stdout || result.stderr).split('\n')[0].trim() || 'Xray';
      this.addLog('system', `检测到 ${this.version}`);
    } catch (error) {
      this.lastError = `Xray 不可用：${error.message}`;
      this.addLog('error', this.lastError);
    }
    setInterval(() => this.sampleTraffic(), 1000).unref();
  }

  addLog(level, message) {
    const text = String(message || '').trimEnd();
    if (!text) return;
    for (const line of text.split(/\r?\n/)) {
      this.logs.push({ id: ++this.logSequence, at: now(), level, message: line });
    }
    if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
    this.emit('log');
  }

  status() {
    return {
      available: Boolean(this.version),
      version: this.version,
      running: Boolean(this.child && !this.child.killed && this.child.exitCode === null),
      pid: this.child?.pid || null,
      startedAt: this.startedAt,
      uptimeSeconds: this.startedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(this.startedAt)) / 1000)) : 0,
      lastExit: this.lastExit,
      lastError: this.lastError,
      desiredRunning: this.desiredRunning,
      paths: {
        binary: this.binary,
        assets: this.assetDir,
        config: this.configPath
      },
      traffic: this.traffic
    };
  }

  getLogs(after = 0) {
    return this.logs.filter((entry) => entry.id > after);
  }

  config() {
    try {
      return generateXrayConfig(this.store.get());
    } catch (error) {
      error.status ||= 422;
      throw error;
    }
  }

  enqueue(operation) {
    const pending = this.operationQueue.then(operation);
    this.operationQueue = pending.catch(() => {});
    return pending;
  }

  async writeCandidate(config) {
    await writeFile(this.candidatePath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  }

  validate(config) {
    return this.enqueue(() => this.validateNow(config || this.config()));
  }

  async validateNow(config) {
    if (!this.version) throw operationError(503, this.lastError || 'Xray 二进制不可用');
    await this.writeCandidate(config);
    const result = await runCommand(this.binary, ['run', '-test', '-c', this.candidatePath], {
      cwd: this.runtimeDir,
      timeout: 15000
    });
    const output = `${result.stdout}\n${result.stderr}`.trim();
    if (xrayValidationFailed(result.code, output)) {
      this.addLog('error', output || 'Xray 配置校验失败');
      throw operationError(422, output || 'Xray 配置校验失败');
    }
    this.addLog('system', output || 'Xray 配置校验通过');
    return { valid: true, output };
  }

  async tunStatus() {
    const linux = process.platform === 'linux';
    let device = false;
    let netAdmin = false;
    if (linux) {
      try {
        await access('/dev/net/tun');
        device = true;
      } catch {
        device = false;
      }
      try {
        const status = await readFile('/proc/self/status', 'utf8');
        const capEff = status.match(/^CapEff:\s*([0-9a-fA-F]+)/m)?.[1] || '0';
        netAdmin = (BigInt(`0x${capEff}`) & (1n << 12n)) !== 0n;
      } catch {
        netAdmin = false;
      }
    }
    const versionKnown = Boolean(versionLineParts(this.version));
    const autoRouteSupported = versionKnown
      ? !xrayVersionBefore(this.version, [26, 7, 11])
      : null;
    return {
      platform: process.platform,
      linux,
      device,
      netAdmin,
      coreAvailable: Boolean(this.version),
      autoRouteSupported,
      ready: linux && device && netAdmin && Boolean(this.version),
      minimumAutoRouteVersion: '26.7.11'
    };
  }

  async assertTunReady(config) {
    if (!hasTunInbound(config)) return;
    const status = await this.tunStatus();
    if (!status.linux) {
      throw operationError(422, 'Xray TUN 透明代理只支持 Linux 宿主网络模式');
    }
    if (hasTunAutoRoutes(config) && status.autoRouteSupported === false) {
      throw operationError(422, 'Linux 自动 TUN 地址和路由需要 Xray 26.7.11 或更高版本');
    }
    if (!status.device) {
      throw operationError(422, '未检测到 /dev/net/tun，请确认 Docker 挂载了 TUN 设备');
    }
    if (!status.netAdmin) {
      throw operationError(422, '当前进程没有 CAP_NET_ADMIN，无法创建 TUN 接口或写入系统路由');
    }
  }

  start() {
    return this.enqueue(() => this.startNow());
  }

  async startNow() {
    if (this.child && this.child.exitCode === null) return this.status();
    const config = this.config();
    await this.validateNow(config);
    await this.assertTunReady(config);
    await rename(this.candidatePath, this.configPath);
    this.desiredRunning = true;
    this.lastError = null;
    const child = spawn(this.binary, ['run', '-c', this.configPath], {
      cwd: this.runtimeDir,
      env: {
        ...process.env,
        XRAY_LOCATION_ASSET: this.assetDir
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this.child = child;
    this.startedAt = now();
    let runtimeFailure = '';
    const capture = (level, chunk) => {
      const text = chunk.toString();
      runtimeFailure = xrayRuntimeFailure(text) || runtimeFailure;
      this.addLog(level, text);
    };
    child.stdout.on('data', (chunk) => capture('stdout', chunk));
    child.stderr.on('data', (chunk) => capture('stderr', chunk));
    child.once('error', (error) => {
      this.lastError = error.message;
      this.addLog('error', `Xray 启动失败：${error.message}`);
    });
    child.once('exit', (code, signal) => {
      this.lastExit = { code, signal, at: now() };
      if (this.desiredRunning && code !== 0) this.lastError = runtimeFailure || `Xray 意外退出：${code ?? signal ?? 'unknown'}`;
      this.addLog(code === 0 || !this.desiredRunning ? 'system' : 'error', `Xray 已退出（code=${code ?? '-'}, signal=${signal || '-'}）`);
      if (this.child === child) this.child = null;
      this.startedAt = null;
      this.traffic.upRate = 0;
      this.traffic.downRate = 0;
      this.previousTraffic = null;
    });
    await this.waitForStartup(child, config);
    this.addLog('system', `Xray 已启动，PID ${child.pid}`);
    return this.status();
  }

  stop() {
    return this.enqueue(() => this.stopNow());
  }

  async stopNow() {
    this.desiredRunning = false;
    const child = this.child;
    if (!child || child.exitCode !== null) return this.status();
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ]);
    if (child.exitCode === null) {
      child.kill('SIGKILL');
      await new Promise((resolve) => child.once('exit', resolve));
    }
    return this.status();
  }

  restart() {
    return this.enqueue(() => this.restartNow());
  }

  async restartNow() {
    const config = this.config();
    await this.validateNow(config);
    await this.assertTunReady(config);
    await this.stopNow();
    await rename(this.candidatePath, this.configPath);
    return this.startFromValidatedConfig(config);
  }

  async startFromValidatedConfig(config) {
    if (!this.version) throw operationError(503, this.lastError || 'Xray 二进制不可用');
    this.desiredRunning = true;
    this.lastError = null;
    const child = spawn(this.binary, ['run', '-c', this.configPath], {
      cwd: this.runtimeDir,
      env: {
        ...process.env,
        XRAY_LOCATION_ASSET: this.assetDir
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this.child = child;
    this.startedAt = now();
    let runtimeFailure = '';
    const capture = (level, chunk) => {
      const text = chunk.toString();
      runtimeFailure = xrayRuntimeFailure(text) || runtimeFailure;
      this.addLog(level, text);
    };
    child.stdout.on('data', (chunk) => capture('stdout', chunk));
    child.stderr.on('data', (chunk) => capture('stderr', chunk));
    child.once('error', (error) => {
      this.lastError = error.message;
      this.addLog('error', `Xray 启动失败：${error.message}`);
    });
    child.once('exit', (code, signal) => {
      this.lastExit = { code, signal, at: now() };
      if (this.desiredRunning && code !== 0) this.lastError = runtimeFailure || `Xray 意外退出：${code ?? signal ?? 'unknown'}`;
      this.addLog(code === 0 || !this.desiredRunning ? 'system' : 'error', `Xray 已退出（code=${code ?? '-'}, signal=${signal || '-'}）`);
      if (this.child === child) this.child = null;
      this.startedAt = null;
    });
    await this.waitForStartup(child, config);
    this.addLog('system', `Xray 已重启，PID ${child.pid}`);
    return this.status();
  }

  async waitForStartup(child, config) {
    await delay(1000);
    if (child.exitCode !== null) {
      throw operationError(409, this.lastError || `Xray 启动后立即退出：${child.exitCode}`);
    }
    const mixedInbound = Array.isArray(config?.inbounds)
      ? config.inbounds.find((inbound) => inbound.protocol === 'mixed' && inbound.port)
      : null;
    if (!mixedInbound) return;
    const host = !mixedInbound.listen || mixedInbound.listen === '0.0.0.0' || mixedInbound.listen === '::'
      ? '127.0.0.1'
      : mixedInbound.listen;
    const ready = await tcpDelay(host, Number(mixedInbound.port), 800);
    if (!ready.ok) {
      await delay(250);
      if (child.exitCode !== null) {
        throw operationError(409, this.lastError || `Xray 启动后立即退出：${child.exitCode}`);
      }
      await this.stopNow();
      throw operationError(409, `Xray 已启动但 mixed 端口 ${host}:${mixedInbound.port} 未就绪：${ready.error}`);
    }
  }

  applyIfRunning() {
    return this.enqueue(() => (
      this.status().running
        ? this.restartNow()
        : this.validateNow(this.config())
    ));
  }

  async sampleTraffic() {
    if (!this.status().running) return;
    const state = this.store.get();
    try {
      const response = await fetch(`http://127.0.0.1:${state.settings.metricsPort}/debug/vars`, {
        signal: AbortSignal.timeout(700)
      });
      if (!response.ok) return;
      const body = await response.json();
      const outbound = body?.stats?.outbound || {};
      let upTotal = 0;
      let downTotal = 0;
      for (const [tag, stats] of Object.entries(outbound)) {
        if (tag === 'proxy' || tag.startsWith('proxy')) {
          upTotal += Number(stats?.uplink || 0);
          downTotal += Number(stats?.downlink || 0);
        }
      }
      const sampledAt = Date.now();
      let upRate = 0;
      let downRate = 0;
      if (this.previousTraffic) {
        const seconds = Math.max(0.001, (sampledAt - this.previousTraffic.sampledAt) / 1000);
        upRate = Math.max(0, (upTotal - this.previousTraffic.upTotal) / seconds);
        downRate = Math.max(0, (downTotal - this.previousTraffic.downTotal) / seconds);
      }
      this.previousTraffic = { upTotal, downTotal, sampledAt };
      this.traffic = { upRate, downRate, upTotal, downTotal, sampledAt: new Date(sampledAt).toISOString() };
    } catch {
      // Metrics are best-effort and should not affect the core lifecycle.
    }
  }
}

export function tcpDelay(host, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const started = performance.now();
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ ok: true, delayMs: Math.round(performance.now() - started) }));
    socket.once('timeout', () => finish({ ok: false, delayMs: null, error: '连接超时' }));
    socket.once('error', (error) => finish({ ok: false, delayMs: null, error: error.message }));
  });
}
