(function () {
  const root = document.getElementById('root');
  const TYPE_LABELS = {
    vless: 'VLESS',
    vmess: 'VMess',
    trojan: 'Trojan',
    shadowsocks: 'Shadowsocks',
    socks: 'SOCKS',
    http: 'HTTP',
    custom: '自定义 JSON'
  };
  const PROFILE_TYPES = ['vless', 'vmess', 'trojan', 'shadowsocks', 'socks', 'http', 'custom'];
  const TRANSPORTS = ['raw', 'ws', 'grpc', 'httpupgrade', 'xhttp', 'h2', 'kcp'];
  const SECURITIES = ['none', 'tls', 'reality'];
  const STORAGE = {
    api: 'webxray-api-base-url',
    token: 'webxray-api-token',
    theme: 'webxray-theme'
  };
  const defaultApiBase = window.WEBXRAY_DEFAULT_API_BASE_URL
    || (location.origin === 'null' ? 'http://127.0.0.1:3000' : location.origin);

  const state = {
    connection: 'connecting',
    apiBase: normalizeApi(new URLSearchParams(location.search).get('api') || localStorage.getItem(STORAGE.api) || defaultApiBase),
    token: localStorage.getItem(STORAGE.token) || '',
    connectionError: '',
    manualDisconnect: false,
    app: null,
    group: '全部服务器',
    search: '',
    selected: new Set(),
    modal: null,
    busy: '',
    logs: [],
    lastLogId: 0,
    bottomOpen: true,
    bottomTab: 'logs',
    generatedConfig: null,
    theme: localStorage.getItem(STORAGE.theme) || 'light',
    mobileMenu: false,
    subscriptionError: '',
    toasts: []
  };

  function normalizeApi(value) {
    return String(value || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function attr(value) {
    return escapeHtml(value);
  }

  function option(value, label, current) {
    return `<option value="${attr(value)}"${String(value) === String(current) ? ' selected' : ''}>${escapeHtml(label ?? value)}</option>`;
  }

  function checked(value) {
    return value ? ' checked' : '';
  }

  function icon(name) {
    const icons = {
      plug: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a6 6 0 0 1-12 0V8Z"/>',
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
      moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
      menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
      play: '<path d="m6 3 14 9-14 9Z"/>',
      stop: '<rect width="14" height="14" x="5" y="5" rx="1"/>',
      restart: '<path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/>'
    };
    return `<svg class="lucide-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;
  }

  function apiUrl(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return `${state.apiBase}${path.startsWith('/') ? path : `/${path}`}`;
  }

  function saveConnection(apiBase = state.apiBase, token = state.token) {
    state.apiBase = normalizeApi(apiBase);
    state.token = String(token || '').trim();
    localStorage.setItem(STORAGE.api, state.apiBase);
    if (state.token) localStorage.setItem(STORAGE.token, state.token);
    else localStorage.removeItem(STORAGE.token);
  }

  function requestHeaders(hasBody = false, extra = {}) {
    const headers = new Headers(extra);
    if (hasBody && !headers.has('content-type')) headers.set('content-type', 'application/json');
    if (state.token && !headers.has('authorization')) headers.set('authorization', `Bearer ${state.token}`);
    return headers;
  }

  async function request(path, options = {}) {
    const { timeout = 30_000, ...fetchOptions } = options;
    let response;
    try {
      response = await fetch(apiUrl(path), {
        ...fetchOptions,
        signal: fetchOptions.signal || AbortSignal.timeout(timeout),
        headers: requestHeaders(Boolean(fetchOptions.body), fetchOptions.headers)
      });
    } catch (error) {
      if (error.name === 'TimeoutError') throw new Error('请求超时，请检查后端状态');
      if (error.name === 'TypeError') throw new Error(`无法连接后端：${state.apiBase}`);
      throw error;
    }
    const body = await response.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      throw new Error(`该地址不是 WebXray 后端：${state.apiBase}`);
    }
    if (!response.ok || !body.ok) {
      const error = new Error(body.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function notify(message, type = 'success') {
    const id = crypto.randomUUID();
    state.toasts.push({ id, message, type });
    syncToasts();
    setTimeout(() => {
      state.toasts = state.toasts.filter((toast) => toast.id !== id);
      syncToasts();
    }, 3500);
  }

  function syncToasts() {
    const stack = root.querySelector('.toast-stack');
    if (stack) stack.outerHTML = toastView();
  }

  function syncBusyView() {
    const shell = root.querySelector('.app-shell');
    if (!shell) return;
    shell.classList.toggle('is-busy', Boolean(state.busy));
    shell.setAttribute('aria-busy', state.busy ? 'true' : 'false');
    const progress = shell.querySelector('.operation-progress');
    if (state.busy && !progress) {
      shell.insertAdjacentHTML('afterbegin', '<div class="operation-progress" role="status" aria-label="操作进行中"></div>');
    } else if (!state.busy) {
      progress?.remove();
    }
    for (const button of shell.querySelectorAll('[data-busy-key]')) {
      const busy = state.busy === button.dataset.busyKey;
      button.disabled = busy;
      button.textContent = busy ? button.dataset.busyLabel : button.dataset.idleLabel;
    }
  }

  function formatBytes(value, speed = false) {
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let number = Number(value || 0);
    let index = 0;
    while (number >= 1024 && index < units.length - 1) {
      number /= 1024;
      index += 1;
    }
    return `${number >= 100 || index === 0 ? number.toFixed(0) : number.toFixed(1)} ${units[index]}${speed ? '/s' : ''}`;
  }

  function formatDuration(seconds) {
    const value = Number(seconds || 0);
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const remain = value % 60;
    return `${hours ? `${hours}h ` : ''}${minutes ? `${minutes}m ` : ''}${remain}s`;
  }

  function groups() {
    const profiles = state.app?.state?.profiles || [];
    return ['全部服务器', ...new Set(profiles.map((profile) => profile.group || '默认分组'))];
  }

  function filteredProfiles() {
    const profiles = state.app?.state?.profiles || [];
    const needle = state.search.trim().toLowerCase();
    return profiles.filter((profile) => {
      const inGroup = state.group === '全部服务器' || profile.group === state.group;
      const matches = !needle || [profile.name, profile.server, profile.type, profile.group].some((value) => String(value || '').toLowerCase().includes(needle));
      return inGroup && matches;
    });
  }

  async function refresh(renderView = true) {
    const result = await request('/api/state');
    state.app = { state: result.state, core: result.core, tun: result.tun };
    state.connection = 'connected';
    state.connectionError = '';
    const validGroups = groups();
    if (!validGroups.includes(state.group)) state.group = '全部服务器';
    if (renderView) render();
    return result;
  }

  async function connect({ silent = false } = {}) {
    state.connection = 'connecting';
    state.manualDisconnect = false;
    if (!silent) render();
    try {
      const result = await request('/api/auth/status');
      if (!result.authenticated) {
        if (!state.token) throw new Error('需要访问令牌');
        await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ token: state.token }) });
      }
      await refresh(false);
      render();
      return true;
    } catch (error) {
      state.connection = 'disconnected';
      state.connectionError = error.message;
      state.app = null;
      render();
      return false;
    }
  }

  async function boot() {
    document.documentElement.dataset.theme = state.theme;
    render();
    await connect({ silent: true });
  }

  async function perform(key, action, successMessage) {
    if (state.busy) return null;
    state.busy = key;
    syncBusyView();
    let completed = false;
    try {
      const result = await action();
      if (result?.state || result?.core) {
        state.app = {
          state: result.state || state.app.state,
          core: result.core || state.app.core,
          tun: result.tun || state.app.tun
        };
      } else {
        await refresh(false);
      }
      completed = true;
      if (successMessage) notify(successMessage);
      return result;
    } catch (error) {
      notify(error.message, 'error');
      return null;
    } finally {
      state.busy = '';
      if (completed) render();
      else syncBusyView();
    }
  }

  function render() {
    document.documentElement.dataset.theme = state.theme;
    localStorage.setItem(STORAGE.theme, state.theme);
    root.innerHTML = appView();
    bindApp();
  }

  function disconnectedApp() {
    return {
      state: {
        profiles: [], subscriptions: [], activeProfileId: null,
        settings: { allowLan: false, mixedPort: 10808 }
      },
      core: {
        available: false, running: false, pid: null, uptimeSeconds: 0,
        traffic: { upRate: 0, downRate: 0, upTotal: 0, downTotal: 0 }
      },
      tun: null
    };
  }

  function appView() {
    const connected = state.connection === 'connected' && Boolean(state.app);
    const current = state.app || disconnectedApp();
    const appState = current.state;
    const core = current.core;
    const profiles = filteredProfiles();
    const groupNames = groups();
    const selectedProfiles = appState.profiles.filter((profile) => state.selected.has(profile.id));
    const coreClass = core.running ? 'running' : core.available ? 'stopped' : 'unavailable';
    const connectionLabel = connected ? '已连接' : state.connection === 'connecting' ? '连接中' : '未连接';
    const disabled = connected ? '' : ' disabled';
    return `
      <div class="app-shell connection-${attr(state.connection)} ${state.busy ? 'is-busy' : ''}" aria-busy="${state.busy ? 'true' : 'false'}">
        ${state.busy ? '<div class="operation-progress" role="status" aria-label="操作进行中"></div>' : ''}
        <header class="topbar">
          <div class="brand"><span class="brand-icon">◎</span><strong>WebXray</strong><span>XRAY CONTROL</span></div>
          <nav class="menu-strip ${state.mobileMenu ? 'open' : ''}">
            <button data-open="node"${disabled}>服务器</button>
            <button data-open="subscriptions"${disabled}>订阅</button>
            <button data-open="routing"${disabled}>路由</button>
            <button data-open="settings"${disabled}>设置</button>
            <button data-open="backup"${disabled}>备份</button>
          </nav>
          <div class="top-actions">
            <button class="connection-button ${connected ? 'connected' : 'disconnected'}" data-open="connection" title="连接设置" aria-live="polite">
              <span class="connection-dot"></span>${icon('plug')}<span>${connectionLabel}</span>
            </button>
            <button class="icon-button" data-action="theme" title="切换主题">${icon(state.theme === 'light' ? 'moon' : 'sun')}</button>
            <button class="icon-button mobile-only" data-action="mobile-menu" title="菜单">${icon('menu')}</button>
          </div>
        </header>
        <div class="toolbar">
          <div class="toolbar-group">
            <button class="command-button primary add-server-button" data-open="node"${disabled}><span aria-hidden="true">+</span><span class="button-label">添加服务器</span></button>
            <button class="icon-button" data-open="import" title="从分享链接导入"${disabled}>粘贴</button>
            <button class="icon-button" data-open="subscriptions" title="订阅设置"${disabled}>订阅</button>
            <button class="icon-button" data-action="subscriptions-update" title="更新全部订阅"${disabled}>刷新</button>
          </div>
          <span class="toolbar-separator"></span>
          <div class="toolbar-group">
            <button class="icon-button" data-action="test" title="测试 TCP 延迟"${disabled}>测速</button>
            <button class="icon-button" data-open="routing" title="路由设置"${disabled}>路由</button>
            <button class="icon-button" data-open="settings" title="参数设置"${disabled}>设置</button>
            <button class="icon-button" data-action="config" title="查看实际配置"${disabled}>JSON</button>
          </div>
          <div class="toolbar-spacer"></div>
          <div class="core-controls">
            <span class="core-state ${coreClass}"><i></i>${core.running ? '运行中' : core.available ? '已停止' : '核心不可用'}</span>
            ${core.running
              ? `<button class="icon-button" data-action="core-stop" title="停止 Xray">${icon('stop')}</button>`
              : `<button class="icon-button success" data-action="core-start" title="启动 Xray"${appState.activeProfileId && connected ? '' : ' disabled'}>${icon('play')}</button>`}
            <button class="icon-button" data-action="core-restart" title="重启 Xray"${appState.activeProfileId && connected ? '' : ' disabled'}>${icon('restart')}</button>
          </div>
        </div>
        <div class="workspace">
          ${sidebarView(appState, core, groupNames)}
          <main class="main-content">
            <div class="list-header">
              <div class="mobile-group-filter"><span>筛选</span><select id="mobile-group">${groupNames.map((name) => option(name, name, state.group)).join('')}</select></div>
              <div class="search-box"><span>⌕</span><input id="search" value="${attr(state.search)}" placeholder="筛选服务器" /><kbd>${profiles.length}</kbd></div>
              <div class="selection-actions">
                <span>${state.selected.size ? `已选择 ${state.selected.size} 项` : '双击编辑，Enter 切换节点'}</span>
                ${selectedProfiles.length === 1 ? `<button class="command-button" data-action="activate-selected">设为活动</button><button class="icon-button" data-action="copy-selected">复制</button><button class="icon-button" data-action="edit-selected">编辑</button>` : ''}
              </div>
            </div>
            ${tableView(appState, profiles, connected)}
            ${bottomPanelView()}
          </main>
        </div>
        ${statusbarView(appState, core, current.tun)}
        ${modalView()}
        ${toastView()}
      </div>
    `;
  }

  function sidebarView(appState, core, groupNames) {
    return `
      <aside class="sidebar">
        <div class="sidebar-heading"><span>服务器分组</span><strong>${appState.profiles.length}</strong></div>
        <div class="group-list">
          ${groupNames.map((name) => `
            <button class="${state.group === name ? 'active' : ''}" data-group="${attr(name)}">
              <span>${escapeHtml(name)}</span>
              <small>${name === '全部服务器' ? appState.profiles.length : appState.profiles.filter((profile) => profile.group === name).length}</small>
            </button>
          `).join('')}
        </div>
        <div class="sidebar-subscriptions">
          <div class="sidebar-heading"><span>订阅源</span><button class="icon-button" data-open="subscriptions">+</button></div>
          ${appState.subscriptions.map((subscription) => `
            <button data-group="${attr(subscription.name)}"><span>${escapeHtml(subscription.name)}</span><small>${subscription.nodeCount || 0}</small></button>
          `).join('')}
        </div>
        <div class="sidebar-core">
          <div><span>核心</span><strong>${core.running ? 'ONLINE' : 'OFFLINE'}</strong></div>
          <p>${escapeHtml(core.version || core.lastError || '未检测到 Xray')}</p>
        </div>
      </aside>
    `;
  }

  function tableView(appState, profiles, connected) {
    const allSelected = profiles.length > 0 && profiles.every((profile) => state.selected.has(profile.id));
    return `
      <div class="table-wrap">
        <table class="profile-table">
          <thead><tr>
            <th class="check-cell"><input type="checkbox" id="select-all"${checked(allSelected)} /></th>
            <th>类型</th><th>别名</th><th>地址</th><th>端口</th><th>传输</th><th>TLS</th><th>分组</th><th class="numeric">延迟</th><th>操作</th>
          </tr></thead>
          <tbody>
            ${profiles.map((profile) => profileRow(appState, profile)).join('')}
            ${profiles.length ? '' : connected
              ? `<tr><td colspan="10"><div class="empty-state"><div class="brand-icon">▣</div><h3>没有服务器</h3><p>添加节点、粘贴分享链接或更新订阅。</p><button class="command-button primary" data-open="node">+ 添加服务器</button></div></td></tr>`
              : `<tr><td colspan="10"><div class="empty-state disconnected-empty">${icon('plug')}<h3>后端未连接</h3><p>${escapeHtml(state.connectionError || `正在连接 ${state.apiBase}`)}</p><button class="command-button primary" data-open="connection">连接设置</button></div></td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  function profileRow(appState, profile) {
    const active = appState.activeProfileId === profile.id;
    const selected = state.selected.has(profile.id);
    const delay = profile.stats?.delayMs ? `${profile.stats.delayMs} ms` : profile.stats?.error ? '失败' : '-';
    return `
      <tr class="${active ? 'active-profile' : ''} ${selected ? 'selected' : ''}" data-profile-row="${attr(profile.id)}" tabindex="0">
        <td class="check-cell"><input type="checkbox" data-select="${attr(profile.id)}"${checked(selected)} /></td>
        <td><span class="protocol protocol-${attr(profile.type)}">${escapeHtml(TYPE_LABELS[profile.type] || profile.type)}</span></td>
        <td class="name-cell">${active ? '<span class="active-flag">活动</span>' : ''}<strong>${escapeHtml(profile.name)}</strong></td>
        <td class="mono">${escapeHtml(profile.type === 'custom' ? '完整配置' : profile.server)}</td>
        <td class="numeric">${profile.type === 'custom' ? '-' : escapeHtml(profile.port)}</td>
        <td>${profile.type === 'custom' ? '-' : escapeHtml((profile.transport || '').toUpperCase())}</td>
        <td>${profile.type === 'custom' ? '-' : `<span class="${profile.security !== 'none' ? 'security-on' : 'muted'}">${escapeHtml((profile.security || 'none').toUpperCase())}</span>`}</td>
        <td>${escapeHtml(profile.group)}</td>
        <td class="numeric delay ${profile.stats?.delayMs && profile.stats.delayMs < 200 ? 'good' : profile.stats?.delayMs ? 'slow' : ''}">${escapeHtml(delay)}</td>
        <td><div class="row-actions">
          <button class="icon-button ${active ? 'active' : ''}" data-activate="${attr(profile.id)}" title="设为活动节点">电</button>
          <button class="icon-button" data-edit="${attr(profile.id)}" title="编辑">改</button>
          <button class="icon-button" data-copy="${attr(profile.id)}" title="复制分享链接"${profile.type === 'custom' ? ' disabled' : ''}>链</button>
          <button class="icon-button danger" data-delete="${attr(profile.id)}" title="删除">删</button>
        </div></td>
      </tr>
    `;
  }

  function bottomPanelView() {
    return `
      <section class="bottom-panel ${state.bottomOpen ? 'open' : ''}">
        <div class="bottom-tabs">
          <button class="${state.bottomTab === 'logs' ? 'active' : ''}" data-bottom="logs">运行日志</button>
          <button class="${state.bottomTab === 'config' ? 'active' : ''}" data-bottom="config">实际配置</button>
          <div></div>
          ${state.bottomTab === 'logs' ? '<button class="icon-button" data-action="clear-logs">清空</button>' : ''}
          <button class="icon-button" data-action="bottom-toggle">${state.bottomOpen ? '收起' : '展开'}</button>
        </div>
        ${state.bottomOpen && state.bottomTab === 'logs' ? `<div class="log-view">${state.logs.length ? state.logs.map(logLine).join('') : '<div class="log-empty">暂无运行日志</div>'}</div>` : ''}
        ${state.bottomOpen && state.bottomTab === 'config' ? `<pre class="config-view">${state.generatedConfig ? escapeHtml(JSON.stringify(state.generatedConfig, null, 2)) : '选择活动节点后查看生成配置。'}</pre>` : ''}
      </section>
    `;
  }

  function logLine(log) {
    return `<div class="log-line log-${attr(log.level)}"><time>${new Date(log.at).toLocaleTimeString()}</time><span>${escapeHtml(log.level)}</span><pre>${escapeHtml(log.message)}</pre></div>`;
  }

  function statusbarView(appState, core, tun) {
    return `
      <footer class="statusbar">
        <span><span class="status-led ${core.running ? 'online' : ''}"></span>${core.running ? `Xray · PID ${core.pid}` : 'Xray 已停止'}</span>
        <span class="desktop-status"><span class="status-led ${tun?.ready ? 'online' : ''}"></span>TUN ${tun?.ready ? '就绪' : '未就绪'}</span>
        <span>↑ ${formatBytes(core.traffic?.upRate, true)}</span>
        <span>↓ ${formatBytes(core.traffic?.downRate, true)}</span>
        <span class="desktop-status">累计上传 ${formatBytes(core.traffic?.upTotal)} · 下载 ${formatBytes(core.traffic?.downTotal)}</span>
        <span class="status-spacer"></span>
        <span>${appState.settings.allowLan ? '0.0.0.0' : '127.0.0.1'}:${appState.settings.mixedPort}</span>
        <span>${core.running ? formatDuration(core.uptimeSeconds) : '00:00'}</span>
      </footer>
    `;
  }

  function modalView() {
    if (!state.modal) return '';
    const type = state.modal.type;
    if (type === 'connection') return connectionModal();
    if (type === 'node') return nodeModal(state.modal.profile || null);
    if (type === 'import') return importModal();
    if (type === 'subscriptions') return subscriptionsModal();
    if (type === 'settings') return settingsModal();
    if (type === 'routing') return routingModal();
    if (type === 'backup') return backupModal();
    return '';
  }

  function modalShell(title, subtitle, body, footer, wide = false) {
    return `
      <div class="modal-backdrop">
        <section class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <header class="modal-header"><div><h2 id="modal-title">${escapeHtml(title)}</h2><p>${escapeHtml(subtitle || '')}</p></div><button class="icon-button" data-action="modal-close">关闭</button></header>
          <div class="modal-body">${body}</div>
          <footer class="modal-footer">${footer}</footer>
        </section>
      </div>
    `;
  }

  function field(name, label, value = '', attrs = '') {
    return `<label class="field"><span>${escapeHtml(label)}</span><input name="${attr(name)}" value="${attr(value)}" ${attrs} /></label>`;
  }

  function wideField(name, label, value = '', attrs = '') {
    return `<label class="field field-wide"><span>${escapeHtml(label)}</span><input name="${attr(name)}" value="${attr(value)}" ${attrs} /></label>`;
  }

  function tunReadinessView(tun) {
    const checks = [
      ['Xray', tun?.coreAvailable],
      ['Linux', tun?.linux],
      ['/dev/net/tun', tun?.device],
      ['NET_ADMIN', tun?.netAdmin],
      ['自动路由核心', tun?.autoRouteSupported]
    ];
    return `
      <div class="tun-readiness field-wide">
        ${checks.map(([label, value]) => `
          <span class="${value === true ? 'ok' : value === false ? 'bad' : 'unknown'}">
            <i>${value === true ? '✓' : value === false ? '×' : '–'}</i>${escapeHtml(label)}
          </span>
        `).join('')}
      </div>
    `;
  }

  function connectionModal() {
    const connected = state.connection === 'connected' && Boolean(state.app);
    const paths = state.app?.core?.paths;
    const body = `
      <form id="connection-form" class="form-grid">
        <div class="connection-summary field-wide ${connected ? 'connected' : 'disconnected'}">
          <span class="connection-dot"></span>
          <div><strong>${connected ? '后端已连接' : '后端未连接'}</strong><small>${escapeHtml(connected ? state.apiBase : state.connectionError || state.apiBase)}</small></div>
        </div>
        ${wideField('apiBase', '后端 API 地址', state.apiBase, 'placeholder="http://127.0.0.1:3000" autocomplete="url" required')}
        ${wideField('token', '访问令牌', state.token, 'type="password" autocomplete="current-password"')}
        ${connected && paths ? `
          <div class="runtime-paths field-wide">
            <span>Xray 核心</span><code>${escapeHtml(paths.binary)}</code>
            <span>Geo 目录</span><code>${escapeHtml(paths.assets)}</code>
            <span>实际配置</span><code>${escapeHtml(paths.config)}</code>
          </div>
        ` : ''}
      </form>
    `;
    const footer = `${connected ? '<button class="button danger-text footer-left" data-action="connection-disconnect">断开连接</button>' : ''}<button class="button" data-action="modal-close">取消</button><button class="command-button primary" form="connection-form">保存并连接</button>`;
    return modalShell('连接设置', '', body, footer);
  }

  function nodeModal(profile) {
    const p = {
      type: 'vless', name: '', server: '', port: 443, uuid: '', password: '', username: '',
      method: 'aes-128-gcm', encryption: 'none', alterId: 0, flow: '', transport: 'raw', security: 'none',
      sni: '', host: '', path: '', serviceName: '', alpn: '', fingerprint: 'chrome', publicKey: '',
      shortId: '', spiderX: '/', group: state.group === '全部服务器' ? '默认分组' : state.group,
      customConfig: null, allowInsecure: false, ...(profile || {})
    };
    const customText = p.customConfig ? JSON.stringify(p.customConfig, null, 2) : '{\n  "log": { "loglevel": "warning" },\n  "inbounds": [],\n  "outbounds": []\n}';
    const body = `
      <form id="node-form" class="form-grid">
        <input type="hidden" name="id" value="${attr(p.id || '')}" />
        <label class="field"><span>协议</span><select name="type">${PROFILE_TYPES.map((type) => option(type, TYPE_LABELS[type], p.type)).join('')}</select></label>
        ${field('name', '别名', p.name)}
        ${field('server', '地址', p.server)}
        ${field('port', '端口', p.port, 'type="number" min="1" max="65535"')}
        ${field('uuid', 'UUID', p.uuid)}
        ${field('password', '密码', p.password, 'type="password"')}
        ${field('username', '用户名', p.username)}
        ${field('method', '加密方法', p.method)}
        ${field('encryption', 'Encryption', p.encryption)}
        ${field('alterId', 'AlterId', p.alterId, 'type="number" min="0"')}
        ${field('group', '分组', p.group)}
        <div class="section-title">传输与安全</div>
        <label class="field"><span>传输</span><select name="transport">${TRANSPORTS.map((item) => option(item, item.toUpperCase(), p.transport)).join('')}</select></label>
        <label class="field"><span>TLS</span><select name="security">${SECURITIES.map((item) => option(item, item.toUpperCase(), p.security)).join('')}</select></label>
        ${field('flow', 'Flow', p.flow)}
        ${field('sni', 'SNI', p.sni)}
        ${field('host', 'Host', p.host)}
        ${field('path', 'Path', p.path)}
        ${field('serviceName', 'Service Name', p.serviceName)}
        ${field('alpn', 'ALPN', Array.isArray(p.alpn) ? p.alpn.join(',') : p.alpn)}
        ${field('fingerprint', 'Fingerprint', p.fingerprint)}
        ${field('publicKey', 'REALITY 公钥', p.publicKey)}
        ${field('shortId', 'Short ID', p.shortId)}
        ${field('spiderX', 'SpiderX', p.spiderX)}
        <label class="toggle-row field-wide"><input type="checkbox" name="allowInsecure"${checked(p.allowInsecure)} />允许不安全证书</label>
        <label class="field field-wide"><span>完整 Xray JSON</span><textarea class="code-input" name="customConfigText">${escapeHtml(customText)}</textarea></label>
      </form>
    `;
    return modalShell(profile ? '编辑服务器' : '添加服务器', '字段会转换为 Xray 客户端出站配置', body, '<button class="button" data-action="modal-close">取消</button><button class="command-button primary" form="node-form">保存</button>', true);
  }

  function importModal() {
    const body = `
      <form id="import-form" class="form-grid">
        ${wideField('group', '导入分组', state.group === '全部服务器' ? '手动导入' : state.group)}
        <label class="field field-wide"><span>分享链接、完整 JSON 或 Base64 订阅正文</span><textarea name="content" class="code-input" required></textarea></label>
      </form>
    `;
    return modalShell('从分享链接导入', '支持 VLESS、VMess、Trojan、Shadowsocks、SOCKS、HTTP 和 Base64 订阅正文', body, '<button class="button" data-action="modal-close">取消</button><button class="command-button primary" form="import-form">导入</button>', true);
  }

  function subscriptionsModal() {
    const subscriptions = state.app.state.subscriptions;
    const body = `
      <div class="subscription-layout">
        <form id="subscription-form" class="subscription-form">
          <input type="hidden" name="id" />
          <h3>订阅源</h3>
          <label class="field"><span>名称</span><input name="name" value="新订阅" required /></label>
          <label class="field"><span>URL</span><input name="url" placeholder="https://example.com/sub" required /></label>
          <label class="field"><span>User-Agent</span><input name="userAgent" /></label>
          <label class="toggle-row"><input type="checkbox" name="enabled" checked />启用</label>
          ${state.subscriptionError ? `<div class="form-error" role="alert">${escapeHtml(state.subscriptionError)}</div>` : ''}
          <button type="submit" class="command-button primary" data-busy-key="subscription-save" data-idle-label="保存订阅" data-busy-label="保存中...">保存订阅</button>
        </form>
        <div class="subscription-list">
          ${subscriptions.length ? subscriptions.map(subscriptionView).join('') : '<div class="empty-state compact"><p>没有订阅源</p></div>'}
        </div>
      </div>
    `;
    return modalShell('订阅分组设置', '订阅更新会替换该分组节点，并保留可识别的同一节点 ID', body, '<button class="button" data-action="modal-close">关闭</button>', true);
  }

  function subscriptionView(subscription) {
    return `
      <div class="subscription-item">
        <div class="subscription-main">
          <strong>${escapeHtml(subscription.name)}</strong>
          <p>${escapeHtml(subscription.url)}</p>
          <small class="${subscription.lastError ? 'error' : ''}">${escapeHtml(subscription.lastError || `${subscription.nodeCount || 0} 个节点`)}</small>
        </div>
        <button class="icon-button" data-sub-update="${attr(subscription.id)}">更新</button>
        <button class="icon-button" data-sub-edit="${attr(subscription.id)}">编辑</button>
        <button class="icon-button danger" data-sub-delete="${attr(subscription.id)}">删除</button>
      </div>
    `;
  }

  function settingsModal() {
    const s = state.app.state.settings;
    const body = `
      <form id="settings-form" class="form-grid">
        ${field('mixedPort', 'Mixed 端口', s.mixedPort, 'type="number" min="1" max="65535"')}
        ${field('metricsPort', 'Metrics 端口', s.metricsPort, 'type="number" min="1" max="65535"')}
        <label class="field"><span>日志级别</span><select name="logLevel">${['debug', 'info', 'warning', 'error', 'none'].map((item) => option(item, item, s.logLevel)).join('')}</select></label>
        <label class="field"><span>Domain Strategy</span><select name="domainStrategy">${['AsIs', 'IPIfNonMatch', 'IPOnDemand'].map((item) => option(item, item, s.domainStrategy)).join('')}</select></label>
        <label class="toggle-row"><input type="checkbox" name="allowLan"${checked(s.allowLan)} />允许局域网连接</label>
        <label class="toggle-row"><input type="checkbox" name="udpEnabled"${checked(s.udpEnabled)} />启用 UDP</label>
        <label class="toggle-row"><input type="checkbox" name="sniffingEnabled"${checked(s.sniffingEnabled)} />启用嗅探</label>
        <label class="toggle-row"><input type="checkbox" name="routeOnly"${checked(s.routeOnly)} />只路由不覆盖目标</label>
        <label class="toggle-row"><input type="checkbox" name="autoStart"${checked(s.autoStart)} />容器启动后自动运行活动节点</label>
        <label class="toggle-row"><input type="checkbox" name="muxEnabled"${checked(s.muxEnabled)} />启用 Mux</label>
        <label class="field field-wide"><span>DNS 服务器</span><textarea name="dnsServers">${escapeHtml((s.dnsServers || []).join('\n'))}</textarea></label>
        <div class="section-title">本地代理认证</div>
        <label class="toggle-row"><input type="checkbox" name="inboundAuthEnabled"${checked(s.inboundAuth?.enabled)} />启用认证</label>
        ${field('inboundAuthUsername', '用户名', s.inboundAuth?.username || '')}
        ${field('inboundAuthPassword', '密码', s.inboundAuth?.password || '', 'type="password"')}
        <div class="section-title">TUN 模式</div>
        ${tunReadinessView(state.app.tun)}
        <label class="toggle-row"><input type="checkbox" name="tunEnabled"${checked(s.tunEnabled)} />启用 Xray TUN 入站</label>
        <label class="toggle-row"><input type="checkbox" name="tunAutoRoute"${checked(s.tunAutoRoute)} />自动写入系统 CIDR 路由</label>
        <label class="toggle-row"><input type="checkbox" name="tunIpv6"${checked(s.tunIpv6)} />接管 IPv6 路由</label>
        ${field('tunName', '接口名称', s.tunName || 'xray_tun')}
        ${field('tunMtu', 'TUN MTU', s.tunMtu, 'type="number" min="1280" max="9000"')}
        <label class="field field-wide"><span>TUN 接口地址 CIDR</span><textarea name="tunGateway">${escapeHtml((s.tunGateway || []).join('\n'))}</textarea><small>对应 Xray gateway 字段；Linux 上会配置为 TUN 接口地址，例如 169.254.10.1/30。</small></label>
        <label class="field field-wide"><span>自动路由 CIDR</span><textarea name="tunRoutes">${escapeHtml((s.tunRoutes || []).join('\n'))}</textarea><small>默认用两个 /1 接管 IPv4；这些不是 ip rule / nftables 规则。远程启用前需保护 API、SSH 等管理链路。</small></label>
      </form>
    `;
    return modalShell('参数设置', '修改活动配置时会先校验，并在核心运行中自动重启', body, '<button class="button" data-action="modal-close">取消</button><button class="command-button primary" form="settings-form">保存并应用</button>', true);
  }

  function routingModal() {
    const routing = state.app.state.routing;
    const rules = routing.rules || [];
    const body = `
      <form id="routing-form">
        <div class="routing-toolbar">
          <div class="segmented">
            ${['proxy', 'bypass-cn', 'direct'].map((mode) => `<button type="button" class="${routing.mode === mode ? 'active' : ''}" data-route-mode="${mode}">${mode === 'proxy' ? '全局代理' : mode === 'bypass-cn' ? '绕过大陆' : '全局直连'}</button>`).join('')}
          </div>
          <label class="toggle-row"><input type="checkbox" name="blockAds"${checked(routing.blockAds)} />阻止广告域名</label>
          <button type="button" class="command-button" data-action="rule-add">添加规则</button>
        </div>
        <input type="hidden" name="mode" value="${attr(routing.mode)}" />
        <div class="rule-list" id="rule-list">
          ${rules.map((rule, index) => ruleRow(rule, index)).join('') || '<div class="empty-state compact"><p>没有自定义规则</p></div>'}
        </div>
      </form>
    `;
    return modalShell('路由设置', '自定义规则按表格顺序优先于区域预设', body, '<button class="button" data-action="modal-close">取消</button><button class="command-button primary" form="routing-form">保存并应用</button>', true);
  }

  function ruleRow(rule, index) {
    return `
      <div
        class="rule-row"
        data-rule-index="${index}"
        data-rule-id="${attr(rule.id || '')}"
        data-rule-enabled="${rule.enabled !== false}"
        data-rule-protocol="${attr(Array.isArray(rule.protocol) ? rule.protocol.join(',') : rule.protocol || '')}"
        data-rule-inbound="${attr(Array.isArray(rule.inboundTag) ? rule.inboundTag.join(',') : rule.inboundTag || '')}"
      >
        <input name="ruleName" value="${attr(rule.name || '')}" placeholder="规则名称" />
        <input name="ruleDomain" value="${attr(Array.isArray(rule.domain) ? rule.domain.join(',') : rule.domain || '')}" placeholder="domain / geosite" />
        <input name="ruleIp" value="${attr(Array.isArray(rule.ip) ? rule.ip.join(',') : rule.ip || '')}" placeholder="IP / geoip / CIDR" />
        <input name="rulePort" value="${attr(rule.port || '')}" placeholder="端口" />
        <select name="ruleNetwork">${[
          ['', '全部网络'],
          ['tcp', 'TCP'],
          ['udp', 'UDP'],
          ['tcp,udp', 'TCP + UDP']
        ].map(([value, label]) => option(value, label, rule.network || '')).join('')}</select>
        <select name="ruleOutbound">${['proxy', 'direct', 'block'].map((item) => option(item, item === 'proxy' ? '代理' : item === 'direct' ? '直连' : '阻止', rule.outboundTag || 'proxy')).join('')}</select>
        <button type="button" class="icon-button danger" data-rule-delete="${index}">删</button>
      </div>
    `;
  }

  function backupModal() {
    const body = `
      <div class="backup-actions">
        <button class="backup-action" data-action="backup-download"><span><strong>导出备份</strong><small>下载完整 JSON 数据文件</small></span></button>
        <button class="backup-action" data-action="backup-pick"><span><strong>恢复备份</strong><small>导入后停止核心，由你确认再启动</small></span></button>
        <input id="backup-file" type="file" accept="application/json,.json" hidden />
      </div>
    `;
    return modalShell('备份与恢复', '备份包含节点密钥、订阅地址和全部设置，请妥善保管', body, '<button class="button" data-action="modal-close">关闭</button>');
  }

  function toastView() {
    return `<div class="toast-stack" role="status" aria-live="polite">${state.toasts.map((toast) => `<div class="toast ${attr(toast.type)}"><span>${escapeHtml(toast.message)}</span></div>`).join('')}</div>`;
  }

  function bindApp() {
    document.getElementById('search')?.addEventListener('input', (event) => {
      const caret = event.target.selectionStart;
      state.search = event.target.value;
      render();
      const search = document.getElementById('search');
      search?.focus();
      search?.setSelectionRange(caret, caret);
    });
    document.getElementById('mobile-group')?.addEventListener('change', (event) => {
      state.group = event.target.value;
      render();
    });
    document.getElementById('select-all')?.addEventListener('change', (event) => {
      const ids = filteredProfiles().map((profile) => profile.id);
      state.selected = event.target.checked ? new Set(ids) : new Set();
      render();
    });
    document.getElementById('backup-file')?.addEventListener('change', importBackup);
  }

  document.addEventListener('click', async (event) => {
    const target = event.target.closest('button, [data-group], [data-select]');
    if (!target) return;
    if (state.busy && target.matches('button')) return;
    const alwaysAvailable = target.dataset.open === 'connection'
      || target.getAttribute('form') === 'connection-form'
      || ['theme', 'mobile-menu', 'modal-close', 'connection-disconnect'].includes(target.dataset.action);
    if (state.connection !== 'connected' && !alwaysAvailable && target.matches('button')) {
      state.modal = { type: 'connection' };
      render();
      return;
    }
    if (target.dataset.open) {
      if (target.dataset.open === 'subscriptions') state.subscriptionError = '';
      state.modal = { type: target.dataset.open };
      state.mobileMenu = false;
      render();
      return;
    }
    if (target.dataset.group) {
      state.group = target.dataset.group;
      render();
      return;
    }
    if (target.dataset.select) {
      toggleSelected(target.dataset.select);
      return;
    }
    if (target.dataset.activate) return activate(target.dataset.activate);
    if (target.dataset.edit) return openEdit(target.dataset.edit);
    if (target.dataset.copy) return copyShare(target.dataset.copy);
    if (target.dataset.delete) return removeProfile(target.dataset.delete);
    if (target.dataset.subUpdate) return updateSubscription(target.dataset.subUpdate);
    if (target.dataset.subEdit) return editSubscription(target.dataset.subEdit);
    if (target.dataset.subDelete) return deleteSubscription(target.dataset.subDelete);
    if (target.dataset.routeMode) {
      document.querySelector('input[name="mode"]').value = target.dataset.routeMode;
      for (const button of document.querySelectorAll('[data-route-mode]')) button.classList.toggle('active', button === target);
      return;
    }
    if (target.dataset.ruleDelete !== undefined) {
      const draft = routingDraft(document.getElementById('routing-form'));
      draft.rules.splice(Number(target.dataset.ruleDelete), 1);
      state.app.state.routing = draft;
      state.modal = { type: 'routing' };
      render();
      return;
    }
    await handleAction(target.dataset.action);
  });

  document.addEventListener('dblclick', (event) => {
    const row = event.target.closest('[data-profile-row]');
    if (row) openEdit(row.dataset.profileRow);
  });

  document.addEventListener('keydown', (event) => {
    const row = event.target.closest?.('[data-profile-row]');
    if (row && event.target === row && event.key === 'Enter') activate(row.dataset.profileRow);
    if (event.key === 'Escape' && state.modal) {
      state.modal = null;
      render();
    }
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target;
    const formId = form.getAttribute?.('id');
    if (!formId) return;
    event.preventDefault();
    if (formId === 'connection-form') return saveConnectionForm(form);
    if (formId === 'node-form') return saveNode(form);
    if (formId === 'import-form') return importProfiles(form);
    if (formId === 'subscription-form') return saveSubscription(form);
    if (formId === 'settings-form') return saveSettings(form);
    if (formId === 'routing-form') return saveRouting(form);
  });

  async function handleAction(action) {
    if (!action) return;
    if (action === 'modal-close') {
      state.modal = null;
      render();
    } else if (action === 'theme') {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      render();
    } else if (action === 'mobile-menu') {
      state.mobileMenu = !state.mobileMenu;
      render();
    } else if (action === 'connection-disconnect') {
      if (state.connection === 'connected') {
        try { await request('/api/auth/logout', { method: 'POST' }); } catch {}
      }
      state.manualDisconnect = true;
      state.connection = 'disconnected';
      state.connectionError = '已手动断开';
      state.app = null;
      state.modal = null;
      render();
    } else if (action === 'core-start') {
      await perform('start', () => request('/api/core/start', { method: 'POST' }), 'Xray 已启动');
    } else if (action === 'core-stop') {
      await perform('stop', () => request('/api/core/stop', { method: 'POST' }), 'Xray 已停止');
    } else if (action === 'core-restart') {
      await perform('restart', () => request('/api/core/restart', { method: 'POST' }), 'Xray 已重启');
    } else if (action === 'subscriptions-update') {
      const result = await perform('subscriptions', () => request('/api/subscriptions/update-all', { method: 'POST', timeout: 120_000 }));
      if (result) {
        const failures = result.results.filter((item) => !item.ok).length;
        notify(failures ? `订阅更新完成，${failures} 项失败` : '订阅更新完成', failures ? 'error' : 'success');
      }
    } else if (action === 'test') {
      await testSelected();
    } else if (action === 'config') {
      await loadConfig();
    } else if (action === 'bottom-toggle') {
      state.bottomOpen = !state.bottomOpen;
      render();
    } else if (action === 'clear-logs') {
      state.logs = [];
      render();
    } else if (action === 'activate-selected') {
      const profile = selectedProfiles()[0];
      if (profile) await activate(profile.id);
    } else if (action === 'copy-selected') {
      const profile = selectedProfiles()[0];
      if (profile) await copyShare(profile.id);
    } else if (action === 'edit-selected') {
      const profile = selectedProfiles()[0];
      if (profile) openEdit(profile.id);
    } else if (action === 'rule-add') {
      const draft = routingDraft(document.getElementById('routing-form'));
      draft.rules.push({ id: crypto.randomUUID(), enabled: true, name: '自定义规则', domain: [], ip: [], port: '', network: '', outboundTag: 'proxy' });
      state.app.state.routing = draft;
      state.modal = { type: 'routing' };
      render();
    } else if (action === 'backup-download') {
      await downloadBackup();
    } else if (action === 'backup-pick') {
      document.getElementById('backup-file')?.click();
    }
  }

  document.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-bottom]');
    if (!tab) return;
    state.bottomTab = tab.dataset.bottom;
    state.bottomOpen = true;
    if (state.bottomTab === 'config') loadConfig();
    render();
  });

  function selectedProfiles() {
    return state.app.state.profiles.filter((profile) => state.selected.has(profile.id));
  }

  function toggleSelected(id) {
    if (state.selected.has(id)) state.selected.delete(id);
    else state.selected.add(id);
    render();
  }

  function openEdit(id) {
    const profile = state.app.state.profiles.find((item) => item.id === id);
    if (profile) {
      state.modal = { type: 'node', profile };
      render();
    }
  }

  async function activate(id) {
    await perform(`activate-${id}`, () => request(`/api/profiles/${encodeURIComponent(id)}/activate`, { method: 'POST' }), '活动节点已切换');
  }

  async function removeProfile(id) {
    const profile = state.app.state.profiles.find((item) => item.id === id);
    if (!profile || !confirm(`删除“${profile.name}”？`)) return;
    await perform(`delete-${id}`, () => request(`/api/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' }), '节点已删除');
    state.selected.delete(id);
  }

  async function copyShare(id) {
    try {
      const result = await request(`/api/profiles/${encodeURIComponent(id)}/share`);
      await copyText(result.link);
      notify('分享链接已复制');
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function copyText(value) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  async function testSelected() {
    const ids = state.selected.size ? [...state.selected] : filteredProfiles().map((profile) => profile.id);
    if (!ids.length) return notify('没有可测速节点', 'error');
    await perform('test', () => request('/api/profiles/test', { method: 'POST', body: JSON.stringify({ ids }) }), 'TCP 延迟测试完成');
  }

  async function loadConfig() {
    try {
      const result = await request('/api/core/config');
      state.generatedConfig = result.config;
      state.bottomTab = 'config';
      state.bottomOpen = true;
      render();
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function saveConnectionForm(form) {
    const data = new FormData(form);
    saveConnection(data.get('apiBase'), data.get('token'));
    state.connectionError = '';
    const connected = await connect();
    if (connected) {
      state.modal = null;
      render();
      notify('API 连接已更新');
    } else {
      state.modal = { type: 'connection' };
      render();
    }
  }

  async function saveNode(form) {
    const data = new FormData(form);
    let customConfig = null;
    if (data.get('type') === 'custom') {
      try {
        customConfig = JSON.parse(data.get('customConfigText') || '{}');
      } catch {
        return notify('完整 Xray JSON 无效', 'error');
      }
    }
    const profile = {
      id: data.get('id') || undefined,
      type: data.get('type'),
      name: data.get('name'),
      server: data.get('server'),
      port: Number(data.get('port')),
      uuid: data.get('uuid'),
      password: data.get('password'),
      username: data.get('username'),
      method: data.get('method'),
      encryption: data.get('encryption'),
      alterId: Number(data.get('alterId')),
      flow: data.get('flow'),
      transport: data.get('transport'),
      security: data.get('security'),
      sni: data.get('sni'),
      host: data.get('host'),
      path: data.get('path'),
      serviceName: data.get('serviceName'),
      alpn: String(data.get('alpn') || '').split(',').map((item) => item.trim()).filter(Boolean),
      fingerprint: data.get('fingerprint'),
      publicKey: data.get('publicKey'),
      shortId: data.get('shortId'),
      spiderX: data.get('spiderX'),
      allowInsecure: data.get('allowInsecure') === 'on',
      group: data.get('group'),
      customConfig
    };
    const path = profile.id ? `/api/profiles/${encodeURIComponent(profile.id)}` : '/api/profiles';
    const method = profile.id ? 'PUT' : 'POST';
    const result = await perform('save-profile', () => request(path, { method, body: JSON.stringify(profile) }), '节点已保存');
    if (result) {
      state.modal = null;
      render();
    }
  }

  async function importProfiles(form) {
    const data = new FormData(form);
    const result = await perform('import', () => request('/api/profiles/import', {
      method: 'POST',
      body: JSON.stringify({ group: data.get('group'), content: data.get('content') })
    }), '导入完成');
    if (result) {
      state.modal = null;
      render();
    }
  }

  async function saveSubscription(form) {
    state.subscriptionError = '';
    const data = new FormData(form);
    const id = data.get('id');
    const body = {
      name: data.get('name'),
      url: data.get('url'),
      userAgent: data.get('userAgent'),
      enabled: data.get('enabled') === 'on'
    };
    const path = id ? `/api/subscriptions/${encodeURIComponent(id)}` : '/api/subscriptions';
    const method = id ? 'PUT' : 'POST';
    const result = await perform('subscription-save', () => request(path, { method, body: JSON.stringify(body) }), '订阅已保存');
    if (result) {
      state.modal = { type: 'subscriptions' };
      render();
    } else {
      const latestError = state.toasts.at(-1);
      state.subscriptionError = latestError?.type === 'error' ? latestError.message : '订阅保存失败';
      render();
    }
  }

  function editSubscription(id) {
    const subscription = state.app.state.subscriptions.find((item) => item.id === id);
    if (!subscription) return;
    state.subscriptionError = '';
    state.modal = { type: 'subscriptions' };
    render();
    const form = document.getElementById('subscription-form');
    if (!form) return;
    form.elements.id.value = subscription.id;
    form.elements.name.value = subscription.name;
    form.elements.url.value = subscription.url;
    form.elements.userAgent.value = subscription.userAgent || '';
    form.elements.enabled.checked = subscription.enabled !== false;
  }

  async function updateSubscription(id) {
    const result = await perform(`sub-update-${id}`, () => request(`/api/subscriptions/${encodeURIComponent(id)}/update`, { method: 'POST', timeout: 45_000 }), '订阅更新完成');
    if (!result) {
      try { await refresh(false); } catch {}
    }
    if (state.app) {
      state.modal = { type: 'subscriptions' };
      render();
    }
  }

  async function deleteSubscription(id) {
    if (!confirm('删除该订阅及其节点？')) return;
    const result = await perform(`sub-delete-${id}`, () => request(`/api/subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE' }), '订阅已删除');
    if (result) state.modal = { type: 'subscriptions' };
  }

  async function saveSettings(form) {
    const data = new FormData(form);
    const body = {
      mixedPort: Number(data.get('mixedPort')),
      metricsPort: Number(data.get('metricsPort')),
      logLevel: data.get('logLevel'),
      domainStrategy: data.get('domainStrategy'),
      allowLan: data.get('allowLan') === 'on',
      udpEnabled: data.get('udpEnabled') === 'on',
      sniffingEnabled: data.get('sniffingEnabled') === 'on',
      routeOnly: data.get('routeOnly') === 'on',
      autoStart: data.get('autoStart') === 'on',
      muxEnabled: data.get('muxEnabled') === 'on',
      dnsServers: String(data.get('dnsServers') || '').split(/\n|,/).map((item) => item.trim()).filter(Boolean),
      inboundAuth: {
        enabled: data.get('inboundAuthEnabled') === 'on',
        username: data.get('inboundAuthUsername'),
        password: data.get('inboundAuthPassword')
      },
      tunEnabled: data.get('tunEnabled') === 'on',
      tunAutoRoute: data.get('tunAutoRoute') === 'on',
      tunIpv6: data.get('tunIpv6') === 'on',
      tunName: data.get('tunName'),
      tunMtu: Number(data.get('tunMtu')),
      tunGateway: String(data.get('tunGateway') || '').split(/\n|,/).map((item) => item.trim()).filter(Boolean),
      tunRoutes: String(data.get('tunRoutes') || '').split(/\n|,/).map((item) => item.trim()).filter(Boolean)
    };
    const result = await perform('settings', () => request('/api/settings', { method: 'PUT', body: JSON.stringify(body) }), '设置已应用');
    if (result) {
      state.modal = null;
      render();
    }
  }

  async function saveRouting(form) {
    const body = routingDraft(form);
    const result = await perform('routing', () => request('/api/routing', { method: 'PUT', body: JSON.stringify(body) }), '路由已应用');
    if (result) {
      state.modal = null;
      render();
    }
  }

  function routingDraft(form) {
    if (!form) return structuredClone(state.app.state.routing);
    const rules = [...form.querySelectorAll('.rule-row')].map((row) => ({
      id: row.dataset.ruleId || crypto.randomUUID(),
      enabled: row.dataset.ruleEnabled !== 'false',
      name: row.querySelector('[name="ruleName"]').value,
      domain: row.querySelector('[name="ruleDomain"]').value,
      ip: row.querySelector('[name="ruleIp"]').value,
      protocol: row.dataset.ruleProtocol || '',
      inboundTag: row.dataset.ruleInbound || '',
      port: row.querySelector('[name="rulePort"]').value,
      network: row.querySelector('[name="ruleNetwork"]').value,
      outboundTag: row.querySelector('[name="ruleOutbound"]').value
    }));
    return {
      mode: form.elements.mode.value,
      blockAds: form.elements.blockAds.checked,
      rules
    };
  }

  async function downloadBackup() {
    try {
      const response = await fetch(apiUrl('/api/backup'), { headers: requestHeaders() });
      if (!response.ok) throw new Error('导出失败');
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `webxray-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const body = JSON.parse(await file.text());
      await request('/api/backup', { method: 'POST', body: JSON.stringify(body) });
      await refresh();
      notify('备份已恢复，核心保持停止状态');
      state.modal = null;
      render();
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  let polling = false;
  setInterval(async () => {
    if (polling || document.hidden || state.manualDisconnect || state.modal) return;
    if (state.connection !== 'connected') {
      polling = true;
      try { await connect({ silent: true }); } finally { polling = false; }
      return;
    }
    polling = true;
    try {
      const [status, logResult] = await Promise.all([
        request('/api/core/status'),
        request(`/api/logs?after=${state.lastLogId}`)
      ]);
      state.app = state.app ? { ...state.app, core: status.core, tun: status.tun || state.app.tun } : state.app;
      if (logResult.logs.length) {
        state.lastLogId = logResult.logs.at(-1).id;
        state.logs = [...state.logs, ...logResult.logs].slice(-700);
      }
      const active = document.activeElement;
      if (!state.modal && !active?.matches('input, textarea, select')) render();
    } catch (error) {
      state.connection = 'disconnected';
      state.connectionError = error.status === 401 ? '连接已失效，请检查访问令牌' : error.message;
      state.app = null;
      render();
    } finally {
      polling = false;
    }
  }, 3000);

  boot();
})();
