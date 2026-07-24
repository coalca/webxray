import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, ArrowDown, ArrowUp, Check, CircleDot, Clipboard,
  CloudDownload, Code2, Copy, Download, Edit3, FileJson, Gauge,
  Import, KeyRound, ListFilter, LoaderCircle, LogOut, Menu,
  Moon, Network, PanelBottomClose, PanelBottomOpen, Play, Plus, Power,
  Radar, RefreshCw, RotateCw, Route, Search, Server, Settings, ShieldCheck,
  Square, Sun, Terminal, Trash2, Upload, X, Zap
} from 'lucide-react';
import './styles.css';

const TYPE_LABELS = {
  vless: 'VLESS',
  vmess: 'VMess',
  trojan: 'Trojan',
  shadowsocks: 'Shadowsocks',
  socks: 'SOCKS',
  http: 'HTTP',
  custom: '自定义 JSON'
};

const EMPTY_PROFILE = {
  type: 'vless', name: '', server: '', port: 443, uuid: '', password: '',
  username: '', method: 'aes-128-gcm', encryption: 'none', alterId: 0,
  flow: '', transport: 'raw', security: 'none', sni: '', host: '', path: '',
  serviceName: '', alpn: [], fingerprint: 'chrome', publicKey: '', shortId: '',
  spiderX: '/', allowInsecure: false, group: '默认分组', customConfig: null
};

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers
    }
  });
  const body = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
  if (!response.ok || !body.ok) {
    const error = new Error(body.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
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

function IconButton({ title, children, className = '', ...props }) {
  return <button className={`icon-button ${className}`} title={title} aria-label={title} {...props}>{children}</button>;
}

function CommandButton({ icon: Icon, children, className = '', ...props }) {
  return <button className={`command-button ${className}`} {...props}><Icon size={16} />{children}</button>;
}

function Modal({ title, subtitle, wide = false, children, onClose }) {
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true">
        <header className="modal-header">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <IconButton title="关闭" onClick={onClose}><X size={18} /></IconButton>
        </header>
        {children}
      </section>
    </div>
  );
}

function Field({ label, hint, children, wide = false }) {
  return <label className={`field ${wide ? 'field-wide' : ''}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="toggle-row">
      <button type="button" className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)} aria-pressed={checked}>
        <span />
      </button>
      <span>{label}</span>
    </label>
  );
}

function Login({ onSuccess }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ token }) });
      onSuccess();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login-page">
      <form className="login-panel" onSubmit={submit}>
        <div className="brand-mark"><Radar size={27} /><span>WebXray</span></div>
        <h1>控制面登录</h1>
        <p>输入容器环境变量 <code>WEBXRAY_AUTH_TOKEN</code> 的值。</p>
        <Field label="访问令牌" wide>
          <div className="input-with-icon"><KeyRound size={16} /><input type="password" autoFocus value={token} onChange={(e) => setToken(e.target.value)} /></div>
        </Field>
        {error && <div className="form-error">{error}</div>}
        <CommandButton icon={busy ? LoaderCircle : ShieldCheck} className="primary full" disabled={busy}>
          {busy ? '正在验证' : '登录'}
        </CommandButton>
      </form>
    </main>
  );
}

function NodeEditor({ profile, groups, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    ...EMPTY_PROFILE,
    ...profile,
    alpn: Array.isArray(profile?.alpn) ? profile.alpn.join(',') : (profile?.alpn || ''),
    customConfigText: profile?.customConfig ? JSON.stringify(profile.customConfig, null, 2) : '{\n  "log": { "loglevel": "warning" },\n  "inbounds": [],\n  "outbounds": []\n}'
  }));
  const [tab, setTab] = useState('basic');
  const [error, setError] = useState('');
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const payload = {
        ...form,
        port: Number(form.port),
        alterId: Number(form.alterId),
        alpn: form.alpn.split(',').map((value) => value.trim()).filter(Boolean)
      };
      if (form.type === 'custom') payload.customConfig = JSON.parse(form.customConfigText);
      delete payload.customConfigText;
      await onSave(payload);
    } catch (failure) {
      setError(failure.message);
    }
  };
  const needsUuid = form.type === 'vless' || form.type === 'vmess';
  const needsPassword = form.type === 'trojan' || form.type === 'shadowsocks';
  const supportsTransport = !['shadowsocks', 'socks'].includes(form.type);

  return (
    <Modal title={profile?.id ? '编辑服务器' : '添加服务器'} subtitle="节点字段将转换为 Xray 客户端出站配置" wide onClose={onClose}>
      <form onSubmit={submit}>
        <div className="tabs modal-tabs">
          <button type="button" className={tab === 'basic' ? 'active' : ''} onClick={() => setTab('basic')}>基础</button>
          <button type="button" className={tab === 'transport' ? 'active' : ''} onClick={() => setTab('transport')} disabled={form.type === 'custom'}>传输</button>
          <button type="button" className={tab === 'security' ? 'active' : ''} onClick={() => setTab('security')} disabled={form.type === 'custom'}>TLS / REALITY</button>
          <button type="button" className={tab === 'advanced' ? 'active' : ''} onClick={() => setTab('advanced')}>高级</button>
        </div>
        <div className="modal-body">
          {tab === 'basic' && (
            <div className="form-grid">
              <Field label="协议">
                <select value={form.type} onChange={(e) => set('type', e.target.value)}>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="别名"><input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="例如：东京 01" /></Field>
              {form.type === 'custom' ? (
                <Field label="完整 Xray JSON" wide>
                  <textarea className="code-input tall" value={form.customConfigText} onChange={(e) => set('customConfigText', e.target.value)} spellCheck="false" />
                </Field>
              ) : (
                <>
                  <Field label="服务器地址"><input value={form.server} onChange={(e) => set('server', e.target.value)} placeholder="example.com" /></Field>
                  <Field label="端口"><input type="number" min="1" max="65535" value={form.port} onChange={(e) => set('port', e.target.value)} /></Field>
                  {needsUuid && <Field label="UUID"><input value={form.uuid} onChange={(e) => set('uuid', e.target.value)} /></Field>}
                  {needsPassword && <Field label="密码"><input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} /></Field>}
                  {form.type === 'shadowsocks' && <Field label="加密方法"><select value={form.method} onChange={(e) => set('method', e.target.value)}>{['aes-128-gcm', 'aes-256-gcm', 'chacha20-poly1305', '2022-blake3-aes-128-gcm', '2022-blake3-aes-256-gcm'].map((method) => <option key={method}>{method}</option>)}</select></Field>}
                  {(form.type === 'socks' || form.type === 'http') && <>
                    <Field label="用户名"><input value={form.username} onChange={(e) => set('username', e.target.value)} /></Field>
                    <Field label="密码"><input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} /></Field>
                  </>}
                  <Field label="分组"><input list="groups" value={form.group} onChange={(e) => set('group', e.target.value)} /><datalist id="groups">{groups.map((group) => <option key={group} value={group} />)}</datalist></Field>
                  {form.type === 'vless' && <Field label="Flow"><select value={form.flow} onChange={(e) => set('flow', e.target.value)}><option value="">无</option><option value="xtls-rprx-vision">xtls-rprx-vision</option></select></Field>}
                  {form.type === 'vmess' && <>
                    <Field label="加密"><select value={form.encryption} onChange={(e) => set('encryption', e.target.value)}><option value="auto">auto</option><option value="aes-128-gcm">aes-128-gcm</option><option value="chacha20-poly1305">chacha20-poly1305</option><option value="none">none</option></select></Field>
                    <Field label="Alter ID"><input type="number" min="0" value={form.alterId} onChange={(e) => set('alterId', e.target.value)} /></Field>
                  </>}
                </>
              )}
            </div>
          )}
          {tab === 'transport' && (
            <div className="form-grid">
              <Field label="传输协议">
                <select value={form.transport} onChange={(e) => set('transport', e.target.value)} disabled={!supportsTransport}>
                  <option value="raw">TCP / RAW</option><option value="ws">WebSocket</option><option value="grpc">gRPC</option>
                  <option value="httpupgrade">HTTP Upgrade</option><option value="xhttp">XHTTP</option><option value="h2">HTTP/2</option><option value="kcp">mKCP</option>
                </select>
              </Field>
              <Field label="Host / Authority"><input value={form.host} onChange={(e) => set('host', e.target.value)} /></Field>
              <Field label="Path"><input value={form.path} onChange={(e) => set('path', e.target.value)} placeholder="/" /></Field>
              <Field label="gRPC Service Name"><input value={form.serviceName} onChange={(e) => set('serviceName', e.target.value)} /></Field>
            </div>
          )}
          {tab === 'security' && (
            <div className="form-grid">
              <Field label="传输安全"><select value={form.security} onChange={(e) => set('security', e.target.value)}><option value="none">无</option><option value="tls">TLS</option><option value="reality">REALITY</option></select></Field>
              <Field label="SNI"><input value={form.sni} onChange={(e) => set('sni', e.target.value)} /></Field>
              <Field label="Fingerprint"><select value={form.fingerprint} onChange={(e) => set('fingerprint', e.target.value)}><option value="">默认</option><option value="chrome">Chrome</option><option value="firefox">Firefox</option><option value="safari">Safari</option><option value="randomized">Randomized</option></select></Field>
              <Field label="ALPN"><input value={form.alpn} onChange={(e) => set('alpn', e.target.value)} placeholder="h2,http/1.1" /></Field>
              {form.security === 'reality' && <>
                <Field label="Public Key"><input value={form.publicKey} onChange={(e) => set('publicKey', e.target.value)} /></Field>
                <Field label="Short ID"><input value={form.shortId} onChange={(e) => set('shortId', e.target.value)} /></Field>
                <Field label="Spider X"><input value={form.spiderX} onChange={(e) => set('spiderX', e.target.value)} /></Field>
              </>}
              <Field label="证书校验"><Toggle checked={form.allowInsecure} onChange={(value) => set('allowInsecure', value)} label="允许不安全证书" /></Field>
            </div>
          )}
          {tab === 'advanced' && (
            <div className="advanced-note">
              <Code2 size={21} />
              <div>
                <strong>{form.type === 'custom' ? '完整配置模式' : '生成配置模式'}</strong>
                <p>{form.type === 'custom' ? '保存后将直接使用该 JSON，基础设置、DNS 和路由设置不会合并。' : '保存活动节点时会先生成候选配置并调用 Xray 校验，通过后才重启核心。'}</p>
              </div>
            </div>
          )}
          {error && <div className="form-error">{error}</div>}
        </div>
        <footer className="modal-footer">
          <button type="button" className="button" onClick={onClose}>取消</button>
          <CommandButton icon={Check} className="primary">保存</CommandButton>
        </footer>
      </form>
    </Modal>
  );
}

function ImportDialog({ onImport, onClose }) {
  const [content, setContent] = useState('');
  const [group, setGroup] = useState('手动导入');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onImport({ content, group });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="从分享链接导入" subtitle="支持 VLESS、VMess、Trojan、Shadowsocks、SOCKS、HTTP 和 Base64 订阅正文" wide onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body form-grid">
          <Field label="分组"><input value={group} onChange={(e) => setGroup(e.target.value)} /></Field>
          <Field label="链接或 JSON" wide><textarea className="code-input tall" autoFocus value={content} onChange={(e) => setContent(e.target.value)} placeholder="每行一个分享链接，或粘贴完整 Xray JSON" /></Field>
          {error && <div className="form-error field-wide">{error}</div>}
        </div>
        <footer className="modal-footer"><button type="button" className="button" onClick={onClose}>取消</button><CommandButton icon={busy ? LoaderCircle : Import} className="primary" disabled={busy || !content.trim()}>{busy ? '正在导入' : '导入'}</CommandButton></footer>
      </form>
    </Modal>
  );
}

function SubscriptionDialog({ subscriptions, onChange, onClose, notify }) {
  const empty = { name: '', url: '', userAgent: '', enabled: true };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState('');
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = async (event) => {
    event.preventDefault();
    try {
      setBusy('save');
      await request(editing ? `/api/subscriptions/${editing}` : '/api/subscriptions', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(form)
      });
      setForm(empty);
      setEditing(null);
      await onChange();
      notify('订阅已保存');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy('');
    }
  };
  const edit = (item) => {
    setEditing(item.id);
    setForm({ name: item.name, url: item.url, userAgent: item.userAgent || '', enabled: item.enabled });
  };
  const update = async (id) => {
    setBusy(id);
    try {
      const result = await request(`/api/subscriptions/${id}/update`, { method: 'POST' });
      notify(`订阅更新完成：${result.imported} 个节点`);
      await onChange();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy('');
    }
  };
  const remove = async (id) => {
    if (!confirm('删除订阅及其全部节点？')) return;
    await request(`/api/subscriptions/${id}`, { method: 'DELETE' });
    await onChange();
  };
  return (
    <Modal title="订阅分组设置" subtitle="订阅更新会替换该分组节点，并保留可识别的同一节点 ID" wide onClose={onClose}>
      <div className="modal-body subscription-layout">
        <form className="subscription-form" onSubmit={save}>
          <h3>{editing ? '编辑订阅' : '添加订阅'}</h3>
          <Field label="别名" wide><input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="机场 / 团队订阅" /></Field>
          <Field label="订阅 URL" wide><input value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://example.com/sub" /></Field>
          <Field label="User-Agent" wide><input value={form.userAgent} onChange={(e) => set('userAgent', e.target.value)} placeholder="留空使用 v2rayN 兼容标识" /></Field>
          <Toggle checked={form.enabled} onChange={(value) => set('enabled', value)} label="参与全部更新" />
          <div className="inline-actions">
            {editing && <button type="button" className="button" onClick={() => { setEditing(null); setForm(empty); }}>取消编辑</button>}
            <CommandButton icon={Check} className="primary" disabled={busy === 'save'}>{editing ? '保存修改' : '添加订阅'}</CommandButton>
          </div>
        </form>
        <div className="subscription-list">
          {subscriptions.length === 0 && <div className="empty-state compact"><CloudDownload size={24} /><p>还没有订阅</p></div>}
          {subscriptions.map((item) => (
            <article className="subscription-item" key={item.id}>
              <div className="subscription-main">
                <span className={`status-dot ${item.lastError ? 'error' : item.updatedAt ? 'online' : ''}`} />
                <div><strong>{item.name}</strong><p>{item.nodeCount || 0} 个节点 · {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '尚未更新'}</p>{item.lastError && <small>{item.lastError}</small>}</div>
              </div>
              <div className="row-actions">
                <IconButton title="立即更新" onClick={() => update(item.id)} disabled={busy === item.id}>{busy === item.id ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}</IconButton>
                <IconButton title="编辑" onClick={() => edit(item)}><Edit3 size={16} /></IconButton>
                <IconButton title="删除" className="danger" onClick={() => remove(item.id)}><Trash2 size={16} /></IconButton>
              </div>
            </article>
          ))}
        </div>
      </div>
      <footer className="modal-footer"><button className="button" onClick={onClose}>关闭</button></footer>
    </Modal>
  );
}

function SettingsDialog({ settings, onSave, onClose }) {
  const [form, setForm] = useState(() => structuredClone(settings));
  const [error, setError] = useState('');
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const auth = form.inboundAuth || {};
  const save = async () => {
    setError('');
    try {
      await onSave({
        ...form,
        mixedPort: Number(form.mixedPort),
        metricsPort: Number(form.metricsPort),
        dnsServers: Array.isArray(form.dnsServers) ? form.dnsServers : String(form.dnsServers).split(/[\n,]+/).map((item) => item.trim()).filter(Boolean)
      });
    } catch (failure) {
      setError(failure.message);
    }
  };
  return (
    <Modal title="参数设置" subtitle="修改活动配置时会先校验，并在核心运行中自动重启" wide onClose={onClose}>
      <div className="modal-body settings-sections">
        <section><h3>本地入站</h3><div className="form-grid">
          <Field label="混合代理端口"><input type="number" min="1" max="65535" value={form.mixedPort} onChange={(e) => set('mixedPort', e.target.value)} /></Field>
          <Field label="统计端口"><input type="number" min="1" max="65535" value={form.metricsPort} onChange={(e) => set('metricsPort', e.target.value)} /></Field>
          <Toggle checked={form.allowLan} onChange={(value) => set('allowLan', value)} label="允许局域网连接" />
          <Toggle checked={form.udpEnabled} onChange={(value) => set('udpEnabled', value)} label="启用 UDP" />
          <Toggle checked={form.sniffingEnabled} onChange={(value) => set('sniffingEnabled', value)} label="启用流量嗅探" />
          <Toggle checked={form.routeOnly} onChange={(value) => set('routeOnly', value)} label="只嗅探用于路由" />
        </div></section>
        <section><h3>访问控制</h3><div className="form-grid">
          <Toggle checked={auth.enabled} onChange={(value) => setForm((current) => ({ ...current, inboundAuth: { ...auth, enabled: value } }))} label="本地代理需要用户名密码" />
          <span />
          <Field label="用户名"><input disabled={!auth.enabled} value={auth.username || ''} onChange={(e) => setForm((current) => ({ ...current, inboundAuth: { ...auth, username: e.target.value } }))} /></Field>
          <Field label="密码"><input disabled={!auth.enabled} type="password" value={auth.password || ''} onChange={(e) => setForm((current) => ({ ...current, inboundAuth: { ...auth, password: e.target.value } }))} /></Field>
        </div></section>
        <section><h3>核心</h3><div className="form-grid">
          <Field label="日志级别"><select value={form.logLevel} onChange={(e) => set('logLevel', e.target.value)}><option value="debug">debug</option><option value="info">info</option><option value="warning">warning</option><option value="error">error</option><option value="none">none</option></select></Field>
          <Field label="域名策略"><select value={form.domainStrategy} onChange={(e) => set('domainStrategy', e.target.value)}><option value="AsIs">AsIs</option><option value="IPIfNonMatch">IPIfNonMatch</option><option value="IPOnDemand">IPOnDemand</option></select></Field>
          <Toggle checked={form.autoStart} onChange={(value) => set('autoStart', value)} label="容器启动后自动运行活动节点" />
          <Toggle checked={form.muxEnabled} onChange={(value) => set('muxEnabled', value)} label="启用 Mux" />
          <Field label="DNS 服务器" wide><textarea value={Array.isArray(form.dnsServers) ? form.dnsServers.join('\n') : form.dnsServers} onChange={(e) => set('dnsServers', e.target.value)} /></Field>
        </div></section>
        <section><h3>TUN 模式</h3><div className="form-grid">
          <Toggle checked={form.tunEnabled} onChange={(value) => set('tunEnabled', value)} label="启用 Xray TUN 入站" />
          <Toggle checked={form.tunIpv6} onChange={(value) => set('tunIpv6', value)} label="接管 IPv6 路由" />
          <Field label="TUN MTU"><input disabled={!form.tunEnabled} type="number" min="1280" max="9000" value={form.tunMtu} onChange={(e) => set('tunMtu', Number(e.target.value))} /></Field>
          <div className="tun-warning">仅在 Linux TUN Compose 模式下启用。普通端口映射容器没有宿主网络权限。</div>
        </div></section>
        {error && <div className="form-error">{error}</div>}
      </div>
      <footer className="modal-footer"><button className="button" onClick={onClose}>取消</button><CommandButton icon={Check} className="primary" onClick={save}>保存并应用</CommandButton></footer>
    </Modal>
  );
}

function RoutingDialog({ routing, onSave, onClose }) {
  const [form, setForm] = useState(() => structuredClone(routing));
  const addRule = () => setForm((current) => ({
    ...current,
    rules: [...current.rules, { id: crypto.randomUUID(), enabled: true, name: '自定义规则', domain: '', ip: '', port: '', network: '', outboundTag: 'proxy' }]
  }));
  const updateRule = (index, key, value) => setForm((current) => ({
    ...current,
    rules: current.rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, [key]: value } : rule)
  }));
  const removeRule = (index) => setForm((current) => ({ ...current, rules: current.rules.filter((_, ruleIndex) => ruleIndex !== index) }));
  return (
    <Modal title="路由设置" subtitle="自定义规则按表格顺序优先于区域预设" wide onClose={onClose}>
      <div className="modal-body">
        <div className="routing-toolbar">
          <div className="segmented">
            <button className={form.mode === 'proxy' ? 'active' : ''} onClick={() => setForm({ ...form, mode: 'proxy' })}>全局代理</button>
            <button className={form.mode === 'bypass-cn' ? 'active' : ''} onClick={() => setForm({ ...form, mode: 'bypass-cn' })}>绕过大陆</button>
            <button className={form.mode === 'direct' ? 'active' : ''} onClick={() => setForm({ ...form, mode: 'direct' })}>全局直连</button>
          </div>
          <Toggle checked={form.blockAds} onChange={(value) => setForm({ ...form, blockAds: value })} label="阻止广告域名" />
          <CommandButton icon={Plus} onClick={addRule}>添加规则</CommandButton>
        </div>
        <div className="rule-list">
          {form.rules.length === 0 && <div className="empty-state compact"><Route size={24} /><p>没有自定义规则</p></div>}
          {form.rules.map((rule, index) => (
            <div className="rule-row" key={rule.id || index}>
              <input className="rule-name" value={rule.name || ''} onChange={(e) => updateRule(index, 'name', e.target.value)} placeholder="规则名称" />
              <input value={Array.isArray(rule.domain) ? rule.domain.join(',') : rule.domain || ''} onChange={(e) => updateRule(index, 'domain', e.target.value)} placeholder="domain / geosite" />
              <input value={Array.isArray(rule.ip) ? rule.ip.join(',') : rule.ip || ''} onChange={(e) => updateRule(index, 'ip', e.target.value)} placeholder="IP / geoip / CIDR" />
              <input value={rule.port || ''} onChange={(e) => updateRule(index, 'port', e.target.value)} placeholder="端口" />
              <select value={rule.outboundTag || 'proxy'} onChange={(e) => updateRule(index, 'outboundTag', e.target.value)}><option value="proxy">代理</option><option value="direct">直连</option><option value="block">阻止</option></select>
              <IconButton title="删除规则" className="danger" onClick={() => removeRule(index)}><Trash2 size={16} /></IconButton>
            </div>
          ))}
        </div>
      </div>
      <footer className="modal-footer"><button className="button" onClick={onClose}>取消</button><CommandButton icon={Check} className="primary" onClick={() => onSave(form)}>保存并应用</CommandButton></footer>
    </Modal>
  );
}

function BackupDialog({ onImported, onClose, notify }) {
  const fileRef = useRef(null);
  const download = async () => {
    try {
      const response = await fetch('/api/backup');
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
  };
  const importFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const body = JSON.parse(await file.text());
      await request('/api/backup', { method: 'POST', body: JSON.stringify(body) });
      await onImported();
      notify('备份已恢复，核心保持停止状态');
      onClose();
    } catch (error) {
      notify(error.message, 'error');
    }
  };
  return (
    <Modal title="备份与恢复" subtitle="备份包含节点密钥、订阅地址和全部设置，请妥善保管" onClose={onClose}>
      <div className="modal-body backup-actions">
        <button className="backup-action" onClick={download}><Download size={24} /><span><strong>导出备份</strong><small>下载完整 JSON 数据文件</small></span></button>
        <button className="backup-action" onClick={() => fileRef.current?.click()}><Upload size={24} /><span><strong>恢复备份</strong><small>导入后停止核心，由你确认再启动</small></span></button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importFile} />
      </div>
      <footer className="modal-footer"><button className="button" onClick={onClose}>关闭</button></footer>
    </Modal>
  );
}

function App() {
  const [auth, setAuth] = useState('loading');
  const [authRequired, setAuthRequired] = useState(false);
  const [app, setApp] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [group, setGroup] = useState('全部服务器');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState('');
  const [toasts, setToasts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [bottomOpen, setBottomOpen] = useState(true);
  const [bottomTab, setBottomTab] = useState('logs');
  const [generatedConfig, setGeneratedConfig] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('webxray-theme') || 'light');
  const [mobileMenu, setMobileMenu] = useState(false);
  const logRef = useRef(null);
  const lastLogId = useRef(0);

  const notify = (message, type = 'success') => {
    const toast = { id: crypto.randomUUID(), message, type };
    setToasts((current) => [...current, toast]);
    setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 3500);
  };

  const refresh = async () => {
    try {
      const result = await request('/api/state');
      setApp({ state: result.state, core: result.core });
      setAuth('ready');
      return result;
    } catch (error) {
      if (error.status === 401) setAuth('login');
      else throw error;
    }
  };

  useEffect(() => {
    request('/api/auth/status').then((result) => {
      setAuthRequired(result.required);
      if (result.authenticated) refresh();
      else setAuth('login');
    }).catch(() => setAuth('login'));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('webxray-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (auth !== 'ready') return undefined;
    const timer = setInterval(async () => {
      try {
        const result = await request('/api/core/status');
        setApp((current) => current ? { ...current, core: result.core } : current);
        const logResult = await request(`/api/logs?after=${lastLogId.current}`);
        if (logResult.logs.length) {
          lastLogId.current = logResult.logs.at(-1).id;
          setLogs((current) => [...current, ...logResult.logs].slice(-700));
        }
      } catch (error) {
        if (error.status === 401) setAuth('login');
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [auth]);

  useEffect(() => {
    if (bottomTab === 'logs' && bottomOpen) logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs, bottomOpen, bottomTab]);

  const perform = async (key, action, successMessage) => {
    setBusy(key);
    try {
      const result = await action();
      if (result?.state || result?.core) {
        setApp((current) => ({
          state: result.state || current.state,
          core: result.core || current.core
        }));
      } else {
        await refresh();
      }
      if (successMessage) notify(successMessage);
      return result;
    } catch (error) {
      notify(error.message, 'error');
      return null;
    } finally {
      setBusy('');
    }
  };

  const state = app?.state;
  const core = app?.core;
  const groups = useMemo(() => state ? ['全部服务器', ...new Set(state.profiles.map((profile) => profile.group || '默认分组'))] : [], [state]);
  const filteredProfiles = useMemo(() => {
    if (!state) return [];
    const needle = search.trim().toLowerCase();
    return state.profiles.filter((profile) => {
      const inGroup = group === '全部服务器' || profile.group === group;
      const matches = !needle || [profile.name, profile.server, profile.type, profile.group].some((value) => String(value || '').toLowerCase().includes(needle));
      return inGroup && matches;
    });
  }, [state, group, search]);

  const toggleSelected = (id) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectedProfiles = state?.profiles.filter((profile) => selected.has(profile.id)) || [];

  const saveProfile = async (profile) => {
    const result = await perform('save-profile', () => request(profile.id ? `/api/profiles/${profile.id}` : '/api/profiles', {
      method: profile.id ? 'PUT' : 'POST',
      body: JSON.stringify(profile)
    }), '节点已保存');
    if (result) setModal(null);
    return result;
  };
  const activate = (id) => perform(`activate-${id}`, () => request(`/api/profiles/${id}/activate`, { method: 'POST' }), '活动节点已切换');
  const removeProfile = async (profile) => {
    if (!confirm(`删除“${profile.name}”？`)) return;
    const result = await perform(`delete-${profile.id}`, () => request(`/api/profiles/${profile.id}`, { method: 'DELETE' }), '节点已删除');
    if (result) setSelected((current) => { const next = new Set(current); next.delete(profile.id); return next; });
  };
  const copyShare = async (profile) => {
    try {
      const result = await request(`/api/profiles/${profile.id}/share`);
      await copyText(result.link);
      notify('分享链接已复制');
    } catch (error) {
      notify(error.message, 'error');
    }
  };
  const testSelected = async () => {
    const ids = selected.size ? [...selected] : filteredProfiles.map((profile) => profile.id);
    if (!ids.length) return notify('没有可测速节点', 'error');
    await perform('test', () => request('/api/profiles/test', { method: 'POST', body: JSON.stringify({ ids }) }), 'TCP 延迟测试完成');
  };
  const loadConfig = async () => {
    try {
      const result = await request('/api/core/config');
      setGeneratedConfig(result.config);
      setBottomTab('config');
      setBottomOpen(true);
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  if (auth === 'loading' || !app && auth === 'ready') {
    return <div className="boot-screen"><Radar size={34} /><LoaderCircle className="spin" size={24} /><span>正在连接 WebXray</span></div>;
  }
  if (auth === 'login') return <Login onSuccess={refresh} />;
  if (!state) return null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><Radar size={22} /><strong>WebXray</strong><span>XRAY CONTROL</span></div>
        <nav className={`menu-strip ${mobileMenu ? 'open' : ''}`}>
          <button onClick={() => setModal({ type: 'node' })}>服务器</button>
          <button onClick={() => setModal({ type: 'subscriptions' })}>订阅</button>
          <button onClick={() => setModal({ type: 'routing' })}>路由</button>
          <button onClick={() => setModal({ type: 'settings' })}>设置</button>
          <button onClick={() => setModal({ type: 'backup' })}>备份</button>
        </nav>
        <div className="top-actions">
          <IconButton title={theme === 'light' ? '切换深色主题' : '切换浅色主题'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</IconButton>
          {authRequired && <IconButton title="退出登录" onClick={async () => { try { await request('/api/auth/logout', { method: 'POST' }); setAuth('login'); } catch (error) { notify(error.message, 'error'); } }}><LogOut size={17} /></IconButton>}
          <IconButton title="菜单" className="mobile-only" onClick={() => setMobileMenu(!mobileMenu)}><Menu size={18} /></IconButton>
        </div>
      </header>

      <div className="toolbar">
        <div className="toolbar-group">
          <CommandButton icon={Plus} className="primary" onClick={() => setModal({ type: 'node' })}>添加服务器</CommandButton>
          <IconButton title="从分享链接导入" onClick={() => setModal({ type: 'import' })}><Clipboard size={18} /></IconButton>
          <IconButton title="订阅设置" onClick={() => setModal({ type: 'subscriptions' })}><CloudDownload size={18} /></IconButton>
          <IconButton title="更新全部订阅" onClick={() => perform('subscriptions', () => request('/api/subscriptions/update-all', { method: 'POST' }), '订阅更新完成')} disabled={busy === 'subscriptions'}>{busy === 'subscriptions' ? <LoaderCircle className="spin" size={18} /> : <RefreshCw size={18} />}</IconButton>
        </div>
        <span className="toolbar-separator" />
        <div className="toolbar-group">
          <IconButton title="测试 TCP 延迟" onClick={testSelected} disabled={busy === 'test'}>{busy === 'test' ? <LoaderCircle className="spin" size={18} /> : <Zap size={18} />}</IconButton>
          <IconButton title="路由设置" onClick={() => setModal({ type: 'routing' })}><Route size={18} /></IconButton>
          <IconButton title="参数设置" onClick={() => setModal({ type: 'settings' })}><Settings size={18} /></IconButton>
          <IconButton title="查看实际配置" onClick={loadConfig}><FileJson size={18} /></IconButton>
        </div>
        <div className="toolbar-spacer" />
        <div className="core-controls">
          <span className={`core-state ${core.running ? 'running' : core.available ? 'stopped' : 'unavailable'}`}><span />{core.running ? '运行中' : core.available ? '已停止' : '核心不可用'}</span>
          {core.running ? (
            <IconButton title="停止 Xray" onClick={() => perform('stop', () => request('/api/core/stop', { method: 'POST' }), 'Xray 已停止')} disabled={busy === 'stop'}><Square size={17} /></IconButton>
          ) : (
            <IconButton title="启动 Xray" className="success" onClick={() => perform('start', () => request('/api/core/start', { method: 'POST' }), 'Xray 已启动')} disabled={busy === 'start' || !state.activeProfileId}><Play size={17} /></IconButton>
          )}
          <IconButton title="重启 Xray" onClick={() => perform('restart', () => request('/api/core/restart', { method: 'POST' }), 'Xray 已重启')} disabled={busy === 'restart' || !state.activeProfileId}><RotateCw size={17} /></IconButton>
        </div>
      </div>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading"><span>服务器分组</span><strong>{state.profiles.length}</strong></div>
          <div className="group-list">
            {groups.map((name) => (
              <button key={name} className={group === name ? 'active' : ''} onClick={() => setGroup(name)}>
                {name === '全部服务器' ? <Server size={16} /> : <CircleDot size={14} />}
                <span>{name}</span>
                <small>{name === '全部服务器' ? state.profiles.length : state.profiles.filter((profile) => profile.group === name).length}</small>
              </button>
            ))}
          </div>
          <div className="sidebar-subscriptions">
            <div className="sidebar-heading"><span>订阅源</span><IconButton title="添加订阅" onClick={() => setModal({ type: 'subscriptions' })}><Plus size={15} /></IconButton></div>
            {state.subscriptions.map((subscription) => (
              <button key={subscription.id} onClick={() => setGroup(subscription.name)}>
                <CloudDownload size={15} /><span>{subscription.name}</span><small>{subscription.nodeCount || 0}</small>
              </button>
            ))}
          </div>
          <div className="sidebar-core">
            <div><Activity size={16} /><span>核心</span><strong>{core.running ? 'ONLINE' : 'OFFLINE'}</strong></div>
            <p>{core.version || core.lastError || '未检测到 Xray'}</p>
          </div>
        </aside>

        <main className="main-content">
          <div className="list-header">
            <div className="mobile-group-filter">
              <ListFilter size={16} />
              <select value={group} onChange={(e) => setGroup(e.target.value)}>{groups.map((name) => <option key={name}>{name}</option>)}</select>
            </div>
            <div className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="筛选服务器" /><kbd>{filteredProfiles.length}</kbd></div>
            <div className="selection-actions">
              <span>{selected.size ? `已选择 ${selected.size} 项` : '双击编辑，Enter 切换节点'}</span>
              {selectedProfiles.length === 1 && <>
                <CommandButton icon={Power} onClick={() => activate(selectedProfiles[0].id)}>设为活动</CommandButton>
                <IconButton title="复制分享链接" onClick={() => copyShare(selectedProfiles[0])}><Copy size={16} /></IconButton>
                <IconButton title="编辑" onClick={() => setModal({ type: 'node', profile: selectedProfiles[0] })}><Edit3 size={16} /></IconButton>
              </>}
            </div>
          </div>
          <div className="table-wrap">
            <table className="profile-table">
              <thead><tr>
                <th className="check-cell"><input type="checkbox" checked={filteredProfiles.length > 0 && filteredProfiles.every((profile) => selected.has(profile.id))} onChange={(e) => setSelected(e.target.checked ? new Set(filteredProfiles.map((profile) => profile.id)) : new Set())} /></th>
                <th>类型</th><th>别名</th><th>地址</th><th>端口</th><th>传输</th><th>TLS</th><th>分组</th><th className="numeric">延迟</th><th>操作</th>
              </tr></thead>
              <tbody>
                {filteredProfiles.map((profile) => {
                  const active = state.activeProfileId === profile.id;
                  return (
                    <tr key={profile.id} className={`${active ? 'active-profile' : ''} ${selected.has(profile.id) ? 'selected' : ''}`} onDoubleClick={() => setModal({ type: 'node', profile })} onKeyDown={(event) => event.key === 'Enter' && activate(profile.id)} tabIndex="0">
                      <td className="check-cell"><input type="checkbox" checked={selected.has(profile.id)} onChange={() => toggleSelected(profile.id)} /></td>
                      <td><span className={`protocol protocol-${profile.type}`}>{TYPE_LABELS[profile.type] || profile.type}</span></td>
                      <td className="name-cell">{active && <span className="active-flag">活动</span>}<strong>{profile.name}</strong></td>
                      <td className="mono">{profile.type === 'custom' ? '完整配置' : profile.server}</td>
                      <td className="numeric">{profile.type === 'custom' ? '-' : profile.port}</td>
                      <td>{profile.type === 'custom' ? '-' : profile.transport?.toUpperCase()}</td>
                      <td>{profile.type === 'custom' ? '-' : <span className={profile.security !== 'none' ? 'security-on' : 'muted'}>{profile.security?.toUpperCase() || 'NONE'}</span>}</td>
                      <td>{profile.group}</td>
                      <td className={`numeric delay ${profile.stats?.delayMs && profile.stats.delayMs < 200 ? 'good' : profile.stats?.delayMs ? 'slow' : ''}`}>{profile.stats?.delayMs ? `${profile.stats.delayMs} ms` : profile.stats?.error ? '失败' : '-'}</td>
                      <td><div className="row-actions">
                        <IconButton title="设为活动节点" className={active ? 'active' : ''} onClick={() => activate(profile.id)} disabled={busy === `activate-${profile.id}`}>{busy === `activate-${profile.id}` ? <LoaderCircle className="spin" size={16} /> : <Power size={16} />}</IconButton>
                        <IconButton title="编辑" onClick={() => setModal({ type: 'node', profile })}><Edit3 size={16} /></IconButton>
                        <IconButton title="复制分享链接" onClick={() => copyShare(profile)} disabled={profile.type === 'custom'}><Copy size={16} /></IconButton>
                        <IconButton title="删除" className="danger" onClick={() => removeProfile(profile)}><Trash2 size={16} /></IconButton>
                      </div></td>
                    </tr>
                  );
                })}
                {filteredProfiles.length === 0 && <tr><td colSpan="10"><div className="empty-state"><Server size={32} /><h3>没有服务器</h3><p>添加节点、粘贴分享链接或更新订阅。</p><CommandButton icon={Plus} className="primary" onClick={() => setModal({ type: 'node' })}>添加服务器</CommandButton></div></td></tr>}
              </tbody>
            </table>
          </div>

          <section className={`bottom-panel ${bottomOpen ? 'open' : ''}`}>
            <div className="bottom-tabs">
              <button className={bottomTab === 'logs' ? 'active' : ''} onClick={() => { setBottomTab('logs'); setBottomOpen(true); }}><Terminal size={15} />运行日志</button>
              <button className={bottomTab === 'config' ? 'active' : ''} onClick={() => { setBottomTab('config'); setBottomOpen(true); loadConfig(); }}><Code2 size={15} />实际配置</button>
              <div />
              {bottomTab === 'logs' && <IconButton title="清空当前日志视图" onClick={() => setLogs([])}><Trash2 size={15} /></IconButton>}
              <IconButton title={bottomOpen ? '收起底部面板' : '展开底部面板'} onClick={() => setBottomOpen(!bottomOpen)}>{bottomOpen ? <PanelBottomClose size={16} /> : <PanelBottomOpen size={16} />}</IconButton>
            </div>
            {bottomOpen && bottomTab === 'logs' && <div className="log-view" ref={logRef}>{logs.length ? logs.map((log) => <div key={log.id} className={`log-line log-${log.level}`}><time>{new Date(log.at).toLocaleTimeString()}</time><span>{log.level}</span><pre>{log.message}</pre></div>) : <div className="log-empty">暂无运行日志</div>}</div>}
            {bottomOpen && bottomTab === 'config' && <pre className="config-view">{generatedConfig ? JSON.stringify(generatedConfig, null, 2) : '选择活动节点后查看生成配置。'}</pre>}
          </section>
        </main>
      </div>

      <footer className="statusbar">
        <span><span className={`status-led ${core.running ? 'online' : ''}`} />{core.running ? `Xray · PID ${core.pid}` : 'Xray 已停止'}</span>
        <span><ArrowUp size={13} />{formatBytes(core.traffic?.upRate, true)}</span>
        <span><ArrowDown size={13} />{formatBytes(core.traffic?.downRate, true)}</span>
        <span className="desktop-status">累计上传 {formatBytes(core.traffic?.upTotal)} · 下载 {formatBytes(core.traffic?.downTotal)}</span>
        <span className="status-spacer" />
        <span><Network size={13} />{state.settings.allowLan ? '0.0.0.0' : '127.0.0.1'}:{state.settings.mixedPort}</span>
        <span><Gauge size={13} />{core.running ? formatDuration(core.uptimeSeconds) : '00:00'}</span>
      </footer>

      {modal?.type === 'node' && <NodeEditor profile={modal.profile || null} groups={groups.slice(1)} onSave={saveProfile} onClose={() => setModal(null)} />}
      {modal?.type === 'import' && <ImportDialog onImport={async (payload) => { const result = await perform('import', () => request('/api/profiles/import', { method: 'POST', body: JSON.stringify(payload) })); if (result) { notify(`已导入 ${result.imported} 个节点`); setModal(null); } }} onClose={() => setModal(null)} />}
      {modal?.type === 'subscriptions' && <SubscriptionDialog subscriptions={state.subscriptions} onChange={refresh} onClose={() => setModal(null)} notify={notify} />}
      {modal?.type === 'settings' && <SettingsDialog settings={state.settings} onSave={async (settings) => { const result = await perform('settings', () => request('/api/settings', { method: 'PUT', body: JSON.stringify(settings) }), '设置已应用'); if (result) setModal(null); }} onClose={() => setModal(null)} />}
      {modal?.type === 'routing' && <RoutingDialog routing={state.routing} onSave={async (routing) => { const result = await perform('routing', () => request('/api/routing', { method: 'PUT', body: JSON.stringify(routing) }), '路由已应用'); if (result) setModal(null); }} onClose={() => setModal(null)} />}
      {modal?.type === 'backup' && <BackupDialog onImported={refresh} onClose={() => setModal(null)} notify={notify} />}

      <div className="toast-stack">{toasts.map((toast) => <div className={`toast ${toast.type}`} key={toast.id}>{toast.type === 'error' ? <X size={16} /> : <Check size={16} />}<span>{toast.message}</span></div>)}</div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
