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

免安装模式备份解压目录中的 `data`，解压新版本后把该目录移入新程序目录。直接覆盖时
不要覆盖或删除 `data`。

服务模式只更新原目录中的程序文件时，先运行 `webxray.cmd -s stop`，替换文件后再启动
服务。不要为了普通更新运行卸载命令。

服务注册记录包含程序绝对路径。如果必须更换解压目录，先通过页面导出备份，再卸载旧服务、
安装新服务并导入备份。0.3.2 的服务卸载会永久删除整个 `C:\ProgramData\WebXray`，没有
自动保留或迁移。
