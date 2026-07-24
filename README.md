# WebXray

WebXray 是一个前后端分离的 Xray 客户端控制面。

- `backend/`：Docker 后端，运行官方 `ghcr.io/xtls/xray-core`，只提供
  `/api` 控制接口。
- `frontend/`：纯 HTML/CSS/JS 静态前端，不需要 React、Vite 或构建步骤。
  后端 API 地址在页面登录框和顶栏 `API` 面板中运行时修改，保存在浏览器
  `localStorage`。

界面和工作流参考 v2rayN 的服务器列表、订阅分组、活动节点、路由、测速和
底部日志面板，但代码和视觉资源均为独立实现。

## 目录结构

```text
backend/
  server/        后端 API、Xray 配置生成和进程控制
  test/          Node 测试
frontend/
  index.html     静态入口
  app.js         原生 JavaScript 应用
  styles.css     原生 CSS
tools/
  serve-static.mjs
```

## 后端 API

```bash
cp .env.example .env
# 修改 .env 中的 WEBXRAY_AUTH_TOKEN
docker compose up -d --build
```

## GHCR 镜像

推送到 `main` 会由 GitHub Actions 构建并发布镜像到：

```text
ghcr.io/<GitHub 用户名>/webxray:<提交日期>
```

镜像版本使用触发构建的提交日期，格式为 `YYMMDD`，例如 `260724`；不发布 `latest`
或提交 SHA 标签。OCI 修订标签仍记录精确提交，便于追溯构建来源。

默认端口：

- API：`http://服务器地址:3000/api`
- SOCKS/HTTP mixed：`服务器地址:10808`

默认 Compose 使用宿主网络模式并具备 TUN 权限：

- `network_mode: host`
- `NET_ADMIN`
- `/dev/net/tun`
- Xray `26.7.11`（官方 pre-release），包含 Linux TUN 接口地址和自动路由支持

前端跨域访问由 `WEBXRAY_CORS_ORIGINS` 控制。开发和 aria2 式本地控制可以
先用 `*`；固定域名后建议改成明确来源：

```env
WEBXRAY_CORS_ORIGINS=https://ui.example.com,http://localhost:5173
```

在 UI 修改 mixed 端口后，因为容器使用宿主网络，不需要再改 Docker 端口映射。

## 前端本地运行

前端是纯静态文件，可以直接由任意静态服务器托管。仓库内提供了一个无依赖的
本地预览命令：

```bash
npm run dev:frontend
```

打开 `http://127.0.0.1:5173`，在登录页填写后端 API 地址，例如
`http://127.0.0.1:3000`，再输入 `.env` 中的 `WEBXRAY_AUTH_TOKEN`。

## 前端部署

`frontend/` 是完整静态目录，可放到任意静态托管服务。部署不需要构建：

- Build command: 留空，或填 `npm run build:ui` 做 JS 语法检查
- Output directory: `frontend`

部署后的页面仍然可以在登录框里切换 API 地址，不需要为了换后端重新构建。
这和 aria2 Web UI 的使用方式一致：静态页面由任意地方托管，浏览器直接请求
你填写的本机或远程后端 API。

## Linux TUN 模式

默认 Compose 已提供 TUN 所需的宿主网络命名空间、`NET_ADMIN` 和
`/dev/net/tun`。在“设置 -> TUN 模式”中启用后，WebXray 会生成 Xray 原生
`tun` 入站。默认固定官方 pre-release Xray `26.7.11`；该版本之前的 Linux
核心会忽略 TUN 接口地址和 `autoSystemRoutingTable`。后续切换
`XRAY_IMAGE` 时，后端也会拒绝用已知旧版本启动自动路由。

设置页会显示 Xray、Linux、`/dev/net/tun`、`NET_ADMIN` 和自动路由核心版本
五项状态。也可以直接请求鉴权后的 `GET /api/tun/status` 做部署探测。

TUN 设置里的“自动路由 CIDR”会写入 Xray 的 `autoSystemRoutingTable`。该字段
只让 Xray 自动向系统路由表添加 CIDR route。IPv4 默认使用 `0.0.0.0/1` 和
`128.0.0.0/1`，比现有默认路由更具体，不依赖其 metric；它不是 Linux
`ip rule`、fwmark、iptables 或 nftables 规则。需要复杂策略路由或远程管理链路
保护时，应关闭“自动写入系统 CIDR 路由”，只创建 TUN 接口，再由宿主机脚本管理
规则。

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
- Bearer token API 鉴权和可配置 CORS

## 数据与安全

数据保存在 Docker 卷 `webxray-data` 的 `/data/state.json`。其中包含节点密钥
和订阅 URL，文件权限为 `0600`，但 Docker 管理员仍可读取。

- 必须修改默认 `WEBXRAY_AUTH_TOKEN`
- 不要把后端 API 裸露到不可信公网；公网使用时至少放在 HTTPS 反向代理后
- 静态前端托管服务不会替你保护后端 API
- 订阅 URL 由服务端请求，只允许 HTTP/HTTPS，超时 20 秒，响应上限 10 MiB
- 配置更新先由 Xray 校验，失败时恢复上一份状态；运行中的旧配置不会因语法
  错误直接被替换

## 测试

```bash
npm test
npm run build:ui
```

## 许可证与参考

本项目代码使用 MIT License。Xray-core 使用 MPL-2.0，并作为独立官方二进制
包含在镜像中。v2rayN 使用 GPL-3.0；本项目仅参考其公开工作流与配置思路，
未复制其源代码或视觉资源，也不隶属于 XTLS 或 v2rayN。
