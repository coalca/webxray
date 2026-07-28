# Docker 安装

## 普通代理模式

普通模式提供 Web 控制台和 HTTP/SOCKS Mixed 代理，不需要 TUN 权限：

```bash
mkdir -p webxray && cd webxray
curl -O https://raw.githubusercontent.com/coalca/webxray/main/deploy/docker/compose.yaml
docker compose up -d
docker compose exec webxray node server/launcher.mjs --print-token
```

默认端口映射：

- `0.0.0.0:3000`：带访问令牌的 Web 控制台，可从局域网访问。
- `127.0.0.1:10808/tcp`：HTTP 和 SOCKS5 Mixed 代理。
- `127.0.0.1:10808/udp`：代理 UDP 入站。

页面中修改 Mixed 端口后，还必须同步修改 Compose 端口映射并重建容器。

## Linux TUN 模式

TUN 模式会进入宿主网络命名空间并可能修改宿主路由。远程服务器应先保证 SSH 和 Web
管理链路不会被接管。

```bash
mkdir -p webxray && cd webxray
curl -o compose.yaml https://raw.githubusercontent.com/coalca/webxray/main/deploy/docker/compose.tun.yaml
docker compose up -d
docker compose exec webxray node server/launcher.mjs --print-token
```

页面“设置”中的 TUN 检查必须同时满足 Linux、`/dev/net/tun`、`NET_ADMIN` 和兼容的
Xray 版本。检查不通过时 WebXray 会拒绝启动 TUN 配置。

## 数据卷

Compose 将当前目录的 `data` 映射到容器 `/data`。Xray 核心、Geo 文件、Web 配置、
节点状态和生成配置都在该目录中，可以直接备份或替换。

## 远程访问

示例允许局域网访问 Web 控制台，但只允许宿主本机访问 Mixed 代理。公网服务器应通过
防火墙限制 `3000` 的来源地址，或使用带 HTTPS 的反向代理。把 `10808` 改为局域网或公网
映射时，必须在 WebXray 设置中启用用户名和密码，并限制防火墙来源地址。

容器内进程默认以 root 运行，以便维护 `/data` 并在 TUN 版本中使用网络权限。因此宿主机
可能需要 `sudo` 才能直接读取绑定目录中的 `0600` 文件；读取令牌优先使用上面的
`docker compose exec` 命令。普通模式没有 `NET_ADMIN`，不能修改宿主路由。

## 常用命令

```bash
docker compose ps
docker compose logs --tail=100 webxray
docker compose restart webxray
docker compose pull && docker compose up -d
docker compose down
```

`docker compose down` 不删除绑定的 `data` 目录。
