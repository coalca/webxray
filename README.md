# WebXray

WebXray 是一个基于 Docker 的 Xray 客户端控制面。容器直接使用官方
`ghcr.io/xtls/xray-core` 中的 Xray 二进制和 geodata，Web 服务负责节点、
订阅、配置校验、核心进程、日志与流量统计。

界面和工作流参考 v2rayN 的服务器列表、订阅分组、活动节点、路由、测速和
底部日志面板，但代码和视觉资源均为独立实现。

## 快速启动

```bash
cp .env.example .env
# 修改 .env 中的 WEBXRAY_AUTH_TOKEN
docker compose up -d --build
```

打开 `http://服务器地址:3000`，使用 `.env` 中的访问令牌登录。

默认 mixed 代理监听：

- SOCKS/HTTP mixed：`服务器地址:10808`
- TCP 和 UDP 均已映射

在 Web UI 修改 mixed 端口后，还需要同步修改 `.env` 中的
`WEBXRAY_PROXY_PORT` 并重建容器端口映射。

## Linux TUN 模式

TUN 需要宿主网络命名空间、`NET_ADMIN` 和 `/dev/net/tun`。使用独立配置：

```bash
docker compose -f compose.tun.yaml up -d --build
```

然后在“设置 -> TUN 模式”中启用。该模式使用 `network_mode: host`，Web UI
仍监听 `3000`，mixed 代理仍监听 UI 设置的端口。

不要在 Docker Desktop、共享主机或不信任的环境中随意授予 `NET_ADMIN`。

## 已实现

- VLESS、VMess、Trojan、Shadowsocks、SOCKS、HTTP 节点
- TLS、REALITY、RAW、WebSocket、gRPC、HTTP Upgrade、XHTTP、H2、mKCP
- 分享链接与 Base64 订阅导入、订阅更新和分组
- 自定义完整 Xray JSON
- mixed 入站、可选认证、DNS、嗅探、Mux 和 Xray TUN
- 自定义路由、绕过大陆、全局代理、全局直连、广告阻止
- TCP 延迟测试、活动节点切换、核心启停/重启
- `xray run -test` 候选配置校验与失败回滚
- `/debug/vars` 上传下载速率及累计流量
- 实时日志、实际生效配置、JSON 备份恢复、浅色/深色界面
- 可选访问令牌认证

## 数据与安全

数据保存在 Docker 卷 `webxray-data` 的 `/data/state.json`。其中包含节点密钥
和订阅 URL，文件权限为 `0600`，但 Docker 管理员仍可读取。

- 必须修改默认 `WEBXRAY_AUTH_TOKEN`
- 不要把 Web UI 直接暴露到公网；建议放在 VPN 或可信反向代理后
- 订阅 URL 由服务端请求，只允许 HTTP/HTTPS，超时 20 秒，响应上限 10 MiB
- 配置更新先由 Xray 校验，失败时恢复上一份状态；运行中的旧配置不会因语法
  错误直接被替换

## 本地开发

本地没有 Xray 二进制时，UI 和节点管理仍可运行，但核心状态显示不可用：

```bash
npm install
npm run dev
```

前端：`http://localhost:5173`，API：`http://localhost:3000`。

```bash
npm test
npm run build
```

## 许可证与参考

本项目代码使用 MIT License。Xray-core 使用 MPL-2.0，并作为独立官方二进制
包含在镜像中。v2rayN 使用 GPL-3.0；本项目仅参考其公开工作流与配置思路，
未复制其源代码或视觉资源，也不隶属于 XTLS 或 v2rayN。
