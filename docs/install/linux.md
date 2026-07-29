# Deb / Linux 安装

## 系统范围

Deb 包面向带 systemd 的 Debian 或 Ubuntu，发布 `amd64` 和 `arm64` 两种架构。包内自带
WebXray 所需 Node.js，系统无需预装 Node。TUN 需要 Linux 内核提供 `/dev/net/tun`。

## 安装

```bash
sudo apt install ./webxray_0.3.2_amd64.deb
sudo webxray token
sudo webxray -s status
```

浏览器打开 `http://服务器地址:3000`。Web 服务监听所有网卡，但仍需要正确的访问令牌。
公网服务器应通过防火墙限制 3000 端口，或放在 HTTPS 反向代理后面。

Mixed 代理首次安装只监听 `127.0.0.1`。需要让局域网设备使用代理时，在页面设置中启用
“允许局域网连接”、配置代理认证，并限制防火墙来源地址。

## 管理命令

```bash
sudo webxray token
sudo webxray url
sudo webxray doctor
sudo webxray -s status
sudo webxray -s start
sudo webxray -s stop
sudo webxray -s restart
sudo webxray -s logs
```

`doctor` 输出当前架构、数据目录、Web 端口以及 Xray、Geo 文件是否存在。

## 文件位置

| 路径 | 用途 |
| --- | --- |
| `/var/lib/webxray` | 用户数据、Xray、Geo 和生成配置 |
| `/usr/lib/webxray` | 后端、内置 Node 和默认 Xray 文件 |
| `/usr/share/webxray/frontend` | Web 前端 |
| `/lib/systemd/system/webxray.service` | systemd 服务单元 |

## TUN

Deb 服务授予 `CAP_NET_ADMIN`，但宿主还必须存在 `/dev/net/tun`。启用自动路由会修改宿主
网络；远程服务器应先规划 SSH、Web 管理和内网路由。禁用“自动写入系统 CIDR 路由”后，
可以只创建 TUN 入站并自行管理系统路由。

## 卸载

```bash
sudo apt remove webxray
```

卸载不会删除 `/var/lib/webxray`。确认不再需要任何令牌、节点或配置后才能手动删除该目录。
