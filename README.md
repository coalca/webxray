# WebXray

WebXray 是一个基于浏览器的 Xray 客户端控制面。官方仓库镜像已经包含 Web
界面、控制 API 和 Xray-core，启动一个容器即可使用。

## 使用 Docker Compose

运行环境需要 Linux、Docker Engine 和 Docker Compose。下载仓库提供的部署文件：

```bash
mkdir -p webxray && cd webxray
curl -LO https://raw.githubusercontent.com/coalca/webxray/main/compose.yaml
curl -Lo .env https://raw.githubusercontent.com/coalca/webxray/main/.env.example
```

编辑 `.env`，至少替换访问令牌。镜像使用仓库自动构建的日期版本，格式为
`YYMMDD`：

```env
WEBXRAY_IMAGE=ghcr.io/coalca/webxray:260726
WEBXRAY_AUTH_TOKEN=请替换为足够长的随机令牌
WEBXRAY_API_PORT=3000
WEBXRAY_CORS_ORIGINS=
TZ=Asia/Shanghai
```

可以用下面的命令生成令牌：

```bash
openssl rand -hex 32
```

启动服务：

```bash
docker compose up -d
docker compose ps
```

浏览器打开 `http://服务器地址:3000`，输入 `.env` 中的访问令牌。页面和 API
由同一个容器提供，API 地址会自动使用当前页面地址，无需单独部署前端。

默认 mixed 代理端口为 `10808`，同时支持 SOCKS 和 HTTP。容器使用宿主网络，
因此在“设置”中修改 mixed 端口后不需要调整 Docker 端口映射。需要让局域网设备
使用代理时，还要在设置中启用“允许局域网”，并在宿主机防火墙放行对应端口。

## 更新镜像

镜像不发布 `latest`。在仓库的
[Packages](https://github.com/coalca/webxray/pkgs/container/webxray) 页面查看新日期版本，
修改 `.env` 中的 `WEBXRAY_IMAGE` 后执行：

```bash
docker compose pull
docker compose up -d
```

配置和节点数据保存在 Docker 卷 `webxray-data`，更新容器不会删除数据。建议在
页面的“备份”中定期导出 JSON 备份。

## TUN 模式

`compose.yaml` 已配置 TUN 所需的宿主网络、`NET_ADMIN` 和 `/dev/net/tun`。
确认宿主机存在该设备后，可在“设置 -> TUN 模式”中启用。页面会显示 Xray、
Linux、TUN 设备、权限和自动路由支持状态。

如果宿主机没有 `/dev/net/tun` 且不使用 TUN，请删除 `compose.yaml` 中的
`cap_add` 和 `devices` 两段后再启动。

默认自动路由会写入 `0.0.0.0/1` 和 `128.0.0.0/1`。远程管理服务器或已有复杂
策略路由时，建议先关闭“自动写入系统 CIDR 路由”，自行管理宿主机路由规则。
不要在 Docker Desktop、共享主机或不信任的环境中授予 `NET_ADMIN`。

## 安全说明

- 必须替换默认访问令牌，不要将令牌提交到代码仓库。
- 不要把 `3000` 端口直接暴露到不可信公网；远程访问建议使用 HTTPS 反向代理。
- 同容器页面无需配置 CORS。跨域控制其他实例时，将页面来源写入
  `WEBXRAY_CORS_ORIGINS`，多个来源使用英文逗号分隔。
- `/data/state.json` 包含节点密钥和订阅地址；Docker 管理员可以读取该文件。
- 恢复备份会停止 Xray 核心，确认配置后需要手动重新启动。

## 常用命令

```bash
docker compose logs -f webxray  # 查看容器日志
docker compose restart          # 重启服务
docker compose down             # 停止并删除容器，保留数据卷
```

项目代码使用 MIT License。Xray-core 使用 MPL-2.0，并作为独立官方二进制包含
在镜像中。
