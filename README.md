# WebXray

WebXray 是一个基于浏览器的 Xray 客户端控制面。本仓库发布的 Docker 镜像已经
包含 Web 界面、控制 API 和 Xray-core，运行一个容器即可使用。

## 启动

运行环境需要 Linux 和 Docker Engine。镜像版本使用提交日期，格式为 `YYMMDD`；
下面以 `260726` 为例：

```bash
mkdir -p webxray-data
docker pull ghcr.io/coalca/webxray:260726
docker run -d \
  --name webxray \
  --restart unless-stopped \
  --network host \
  --cap-add NET_ADMIN \
  --device /dev/net/tun:/dev/net/tun \
  -v "$PWD/webxray-data:/data" \
  ghcr.io/coalca/webxray:260726
```

首次启动会自动生成：

- `webxray-data/config.json`：Web 端口、随机访问令牌、CORS 和时区。
- `webxray-data/state.json`：节点、订阅、路由和界面设置。

查看首次生成的配置和访问令牌：

```bash
docker exec webxray cat /data/config.json
```

配置文件格式如下：

```json
{
  "authToken": "自动生成的 64 位随机令牌",
  "webPort": 3000,
  "corsOrigins": [],
  "timezone": "Asia/Shanghai"
}
```

浏览器打开 `http://服务器地址:3000`，输入 `authToken`。修改 `config.json` 后执行
`docker restart webxray` 使配置生效。`authToken` 至少需要 32 个字符，
`corsOrigins` 在同容器使用时保持空数组即可。

配置文件默认权限为 `0600`，绑定目录中的文件通常属于 root；需要直接在宿主机
修改时可使用 `sudoedit webxray-data/config.json`。

也可以在 `docker run` 时使用 `WEBXRAY_AUTH_TOKEN`、`WEBXRAY_PORT`、
`WEBXRAY_CORS_ORIGINS` 和 `TZ` 环境变量覆盖配置文件中的对应值。

默认 mixed 代理端口为 `10808`，同时支持 SOCKS 和 HTTP。容器使用宿主网络，
因此在页面“设置”中修改 mixed 端口后不需要调整 Docker 端口映射。需要让局域网
设备使用代理时，还要启用“允许局域网”，并在宿主机防火墙放行对应端口。

## 更新

镜像不发布 `latest`。在仓库的
[Packages](https://github.com/coalca/webxray/pkgs/container/webxray) 页面查看新日期版本，
然后替换下面命令中的镜像版本：

```bash
docker pull ghcr.io/coalca/webxray:260726
docker rm -f webxray
docker run -d \
  --name webxray \
  --restart unless-stopped \
  --network host \
  --cap-add NET_ADMIN \
  --device /dev/net/tun:/dev/net/tun \
  -v "$PWD/webxray-data:/data" \
  ghcr.io/coalca/webxray:260726
```

容器删除后，绑定挂载的 `webxray-data` 目录仍然保留，更新不会重置配置和节点。

## TUN 模式

启动命令已提供 TUN 所需的宿主网络、`NET_ADMIN` 和 `/dev/net/tun`。确认宿主机
存在该设备后，可在“设置 -> TUN 模式”中启用。页面会显示 Xray、Linux、TUN
设备、权限和自动路由支持状态。

如果宿主机没有 `/dev/net/tun` 且不使用 TUN，从 `docker run` 命令中删除
`--cap-add` 和 `--device` 两项即可。

默认自动路由会写入 `0.0.0.0/1` 和 `128.0.0.0/1`。远程管理服务器或已有复杂
策略路由时，建议先关闭“自动写入系统 CIDR 路由”，自行管理宿主机路由规则。
不要在共享主机或不信任的环境中授予 `NET_ADMIN`。

## 安全说明

- 不要公开 `config.json` 或将其中的访问令牌提交到代码仓库。
- 不要把 Web 端口直接暴露到不可信公网；远程访问建议使用 HTTPS 反向代理。
- 跨域控制其他实例时，在 `corsOrigins` 中填写前端页面来源。
- `state.json` 包含节点密钥和订阅地址，应与 `config.json` 一并备份和保护。
- 恢复页面备份会停止 Xray 核心，确认配置后需要手动重新启动。

## 常用命令

```bash
docker logs -f webxray       # 查看容器日志
docker restart webxray       # 重启服务
docker stop webxray          # 停止服务
docker start webxray         # 再次启动
docker rm -f webxray         # 删除容器，保留绑定挂载的数据
```

项目代码使用 MIT License。Xray-core 使用 MPL-2.0，并作为独立官方二进制包含
在镜像中。
