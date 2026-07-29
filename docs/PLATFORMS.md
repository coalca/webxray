# 平台支持矩阵

## 功能对比

| 能力 | Docker 普通模式 | Docker TUN 模式 | Deb / Linux | Windows 直接运行 | Windows 服务 |
| --- | --- | --- | --- | --- | --- |
| 节点、订阅、路由、备份 | 支持 | 支持 | 支持 | 支持 | 支持 |
| Xray 核心启停和自动启动 | 支持 | 支持 | 支持 | 进程存活期间 | 支持 |
| HTTP + SOCKS Mixed 代理 | 支持 | 支持 | 支持 | 支持 | 支持 |
| TCP 与 UDP 入站 | 支持 | 支持 | 支持 | 支持 | 支持 |
| Linux TUN 入站 | 不授予权限 | 支持 | 支持 | 不支持 | 不支持 |
| 自动写入 Linux 路由 | 不支持 | 支持 | 支持 | 不支持 | 不支持 |
| WebXray 开机自启 | Docker 重启策略 | Docker 重启策略 | systemd | 不支持 | Windows SCM |
| Web 服务默认监听 | 宿主 `0.0.0.0:3000` | 宿主网络 `0.0.0.0:3000` | `0.0.0.0:3000` | `127.0.0.1` | `127.0.0.1` |
| Mixed 代理默认监听 | 容器内 `0.0.0.0`，宿主映射限制为本机 | 宿主网络 `0.0.0.0` | `127.0.0.1` | `127.0.0.1` | `127.0.0.1` |
| 数据持久化 | `/data` 卷 | `/data` 卷 | `/var/lib/webxray` | 解压目录 `data` | `C:\ProgramData\WebXray` |
| 内置 Node.js | 容器内置 | 容器内置 | Deb 内置 | ZIP 内置 | ZIP 内置 |
| 内置 Xray 与 Geo 数据 | 支持 | 支持 | 支持 | 支持 | 支持 |

## 共同能力边界

WebXray 是 Xray 客户端控制台，不是 VPN 服务商，也不提供节点。订阅兼容 VLESS、VMess、
Trojan、Shadowsocks、SOCKS、HTTP 和完整 Xray JSON；不同服务商的私有订阅格式不保证兼容。

WebXray 只生成和运行 Xray 配置，不会自动完成以下操作：

- 不会购买、续费或修复第三方节点。
- 不会自动修改 Windows、浏览器或其他设备的系统代理设置。
- 不会配置公网域名、TLS 证书、反向代理或服务器防火墙。
- 不会为远程服务器自动保护 SSH、控制面板等管理链路。
- 不会在 Windows 上模拟 Linux TUN 和 Linux 策略路由。

## Docker 边界

普通模式只需要容器运行权限，适合提供本地 HTTP/SOCKS 代理。TUN 模式仅面向 Linux
宿主机，需要 `network_mode: host`、`NET_ADMIN` 和 `/dev/net/tun`。Docker Desktop 的
Windows 或 macOS 虚拟机网络不等同于 Linux 宿主透明代理，不在 TUN 支持范围内。

## Deb / Linux 边界

Deb 面向使用 systemd 的 Debian 和 Ubuntu。包内自带 Node.js，不使用系统 Node；Xray、
Geo 文件和用户状态位于 `/var/lib/webxray`。TUN 仍依赖宿主内核提供 `/dev/net/tun`，并且
服务必须保留 `CAP_NET_ADMIN`。

## Windows 边界

Windows ZIP 为 x64 免安装包。直接运行模式属于当前登录用户，数据跟随解压目录；服务模式
由 Windows Service Control Manager 管理并默认以服务账户运行，数据位于
`C:\ProgramData\WebXray`。两种模式的数据彼此独立，但默认端口相同，仍不可同时启动。
Web 页面和代理默认仅监听本机，Windows 版不提供 TUN 自动路由，也不自动设置系统代理。
