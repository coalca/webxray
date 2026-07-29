# Windows 安装

## 发行形式

Windows 版是 x64 免安装 ZIP，不提供 MSI、NSIS 或安装向导。解压到不会移动的固定目录，
例如 `C:\WebXray`。同一个 ZIP 可以选择前台直接运行或注册为 Windows 服务，但两种模式
使用不同的数据目录。

## 直接运行

双击 `WebXray-Run.cmd`：

- 不需要管理员权限。
- 数据保存在解压目录的 `data`，复制整个目录即可随程序带走。
- 显示访问令牌并按 `config.json` 中的端口打开浏览器。
- 黑色窗口必须保持打开，关闭窗口即停止 WebXray。
- 不会注册服务，也不会随 Windows 自动启动。

适合首次体验、临时使用和桌面用户。

## Windows 服务

右键 `WebXray-Install-Service.cmd`，选择“以管理员身份运行”：

- 注册名为 `WebXray` 的自动启动服务。
- 后台运行，不依赖登录用户或命令窗口。
- 使用 WinSW 接入 Windows Service Control Manager。
- 数据保存在 `C:\ProgramData\WebXray`，日志写入其中的 `logs` 并按大小滚动。
- 数据目录只允许 SYSTEM 和本机管理员访问。

移除服务时，以管理员身份运行 `WebXray-Uninstall-Service.cmd`。该操作会永久删除
`C:\ProgramData\WebXray`，其中的令牌、节点、订阅、Xray、Geo 文件、配置和日志均不保留。
需要数据时必须在卸载前通过页面导出备份。

两种模式不共享也不自动复制数据，各自生成配置和访问令牌。默认 Web 和代理端口相同，
因此不可同时运行。

## 命令行

在解压目录打开 CMD 或 PowerShell：

```bat
webxray.cmd token
webxray.cmd url
webxray.cmd doctor
```

上面三个命令读取免安装版数据。读取服务版数据必须使用管理员终端：

```bat
webxray.cmd -s token
webxray.cmd -s url
webxray.cmd -s doctor
webxray.cmd -s status
webxray.cmd -s start
webxray.cmd -s stop
webxray.cmd -s restart
webxray.cmd -s uninstall
```

带 `-s` 的命令需要管理员权限。

## 明确边界

- Web 服务默认监听 `127.0.0.1`，用于本机浏览器管理。
- Windows 版支持 HTTP/SOCKS Mixed 代理，不支持 WebXray 的 Linux TUN 自动路由。
- WebXray 不修改 Windows 系统代理。应用程序需要手动使用页面显示的 Mixed 端口。
- 服务模式以系统服务账户运行，节点密钥和订阅地址保存在受保护的 ProgramData 目录。
