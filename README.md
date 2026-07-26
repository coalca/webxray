# WebXray

WebXray 是一个浏览器里的 Xray 客户端控制台，支持节点、订阅、路由、日志、备份和
Xray 核心启停。页面打开后直接进入主界面：右上角绿点表示后端已连接，红点表示未
连接；点击状态即可设置后端地址和访问令牌。

项目提供 Docker、Debian/Ubuntu Deb 包和 Windows 免安装 ZIP。三种版本使用同一套
前端和后端。

## Docker 使用

服务器、NAS 和 Linux 用户优先使用 Docker。下面的命令只需要替换镜像日期版本：

```bash
mkdir -p webxray-data
docker run -d \
  --name webxray \
  --restart unless-stopped \
  --network host \
  --cap-add NET_ADMIN \
  --device /dev/net/tun:/dev/net/tun \
  -v "$PWD/webxray-data:/data" \
  ghcr.io/coalca/webxray:260727
```

第一次启动后查看访问令牌：

```bash
cat webxray-data/config.json
```

浏览器打开 `http://服务器地址:3000`，点击右上角红色“未连接”，填入
`config.json` 里的 `authToken`。页面连接成功后状态变绿。

不使用 TUN 时，可以从 Docker 命令中删除 `--cap-add` 和 `--device`。普通 mixed
代理仍可使用，默认地址为 `127.0.0.1:10808`。

## Debian 和 Ubuntu

在 [GitHub Releases](https://github.com/coalca/webxray/releases) 下载与机器匹配的
Deb 包：普通 Intel/AMD 电脑选 `amd64`，ARM 服务器选 `arm64`。

```bash
sudo apt install ./webxray_0.2.0_amd64.deb
sudo webxray token
```

第二条命令输出访问令牌。浏览器打开 `http://服务器地址:3000`，在右上角连接设置中
输入令牌。安装包会自动创建并启动 systemd 服务。

常用命令：

```bash
systemctl status webxray
sudo webxray -s restart
sudo webxray -s stop
sudo webxray -s start
```

Deb 数据保存在 `/var/lib/webxray`。卸载软件不会删除这个目录：

```bash
sudo apt remove webxray
```

## Windows 免安装版

Windows 版本没有安装器。到
[GitHub Releases](https://github.com/coalca/webxray/releases) 下载
`webxray_0.2.0_windows_x64.zip`，解压到不会随意移动的目录，例如
`C:\WebXray`。

以管理员身份打开 CMD 或 PowerShell，进入该目录并运行：

```bat
webxray.cmd -s install
```

命令会输出访问令牌、注册 `WebXray` Windows 服务、启动服务并打开浏览器。服务管理
命令如下：

```bat
webxray.cmd -s status
webxray.cmd -s restart
webxray.cmd -s stop
webxray.cmd -s start
webxray.cmd -s uninstall
webxray.cmd token
```

Windows 数据保存在解压目录的 `data` 文件夹。更新时先停止服务，替换程序文件但保留
`data`，然后重新启动服务。Windows 版本支持 mixed 代理，不支持本项目的 Linux TUN
自动路由。

## 数据目录

Docker 的 `webxray-data`、Deb 的 `/var/lib/webxray` 和 Windows 的 `data` 内容一致：

```text
data/
├── config.json                 Web 端口、访问令牌、CORS、时区
├── state.json                  节点、订阅、路由、界面设置
└── xray/
    ├── xray 或 xray.exe        Xray 核心
    ├── geoip.dat               IP 规则数据
    ├── geosite.dat             域名规则数据
    ├── config.json             当前已校验的 Xray 配置
    └── config.candidate.json   正在校验的候选配置
```

首次启动只补齐不存在的 Xray 和 Geo 文件，不会覆盖你已经替换的文件。`config.json` 和
`state.json` 必须一起备份，其中可能包含访问令牌、节点密钥和订阅地址。

## 修改 Web 配置

`config.json` 示例：

```json
{
  "authToken": "自动生成的 64 位随机令牌",
  "webPort": 3000,
  "corsOrigins": [],
  "timezone": "Asia/Shanghai"
}
```

修改后重启 WebXray。`authToken` 至少 32 个字符。Docker 也可以使用
`WEBXRAY_AUTH_TOKEN`、`WEBXRAY_PORT`、`WEBXRAY_CORS_ORIGINS` 和 `TZ` 环境变量覆盖
文件中的值。

## TUN 模式

TUN 自动路由只支持 Linux。Docker 需要宿主网络、`NET_ADMIN` 和 `/dev/net/tun`；
Deb 服务已带 `CAP_NET_ADMIN`，但宿主机仍必须存在 `/dev/net/tun`。远程管理服务器或
已有复杂策略路由时，先关闭“自动写入系统 CIDR 路由”，再自行维护宿主机路由。

## 安全说明

- 不要公开或提交数据目录中的 `config.json` 和 `state.json`。
- 不要把 Web 端口直接暴露到不可信公网，远程访问优先使用 HTTPS 反向代理。
- 同一个 WebXray 页面和后端不需要 CORS；跨域控制其他实例时才设置
  `corsOrigins`。
- 容器或系统服务管理员可以读取节点密钥，这是本地控制 Xray 所必需的权限。

完整的实现和验收计划见 [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md)。

WebXray 使用 MIT License。发行包内的 Xray-core、Node.js、WinSW 和 Geo 数据许可见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
