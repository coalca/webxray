# 升级与回滚

升级前先通过页面导出备份，并额外备份整个数据目录。页面备份包含状态，但整个目录还包括
自定义 Xray 核心、Geo 文件和运行配置。

## Docker

```bash
cp -a data "data.backup.$(date +%Y%m%d-%H%M%S)"
docker compose pull
docker compose up -d
```

回滚时把 Compose 镜像标签改回原日期版本，再执行 `docker compose up -d`。不要删除数据卷。

## Deb

```bash
sudo systemctl stop webxray
sudo cp -a /var/lib/webxray "/var/lib/webxray.backup.$(date +%Y%m%d-%H%M%S)"
sudo apt install ./webxray_新版本_amd64.deb
```

Deb 升级替换程序文件，保留 `/var/lib/webxray`。回滚时安装旧 Deb；跨版本状态不兼容时，
停止服务后恢复备份目录。

## Windows

服务模式先运行 `webxray.cmd -s stop`。备份 `data`，解压新版本到新的临时目录，再把旧
`data` 移入新目录。确认启动成功后再删除旧程序目录。直接覆盖时不要覆盖或删除 `data`。

服务注册记录包含程序绝对路径。如果更换了解压目录，应先在旧目录卸载服务，再在新目录
重新安装服务。
