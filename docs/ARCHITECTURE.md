# 仓库结构

```text
backend/server/          Node.js 后端、状态存储、Xray 配置和进程控制
backend/test/            后端单元测试
frontend/                无构建依赖的浏览器界面
test/e2e/                Playwright 用户流程测试
test/packaging/          发行契约测试
packaging/debian/        Deb 元数据和生命周期脚本
packaging/linux/         Linux CLI 和 systemd 单元
packaging/windows/       Windows 入口、WinSW 配置和说明
deploy/docker/           普通代理与 Linux TUN Compose
.github/workflows/       浏览器、GHCR 和原生发行包流水线
docs/                    平台、安装、安全、升级和开发文档
```

## 运行数据契约

应用代码和用户数据严格分离。所有发行形态最终解析出一个数据目录，并在其中维护
`config.json`、`state.json` 和 `xray/`。发行包内的 Xray 和 Geo 文件只作为首次启动默认值，
不会覆盖数据目录中的同名文件。

## 测试层级

1. Node 单元测试验证配置生成、解析、存储、运行资产和核心生命周期。
2. 打包契约测试验证 Docker、Deb、Windows 入口和数据保留约束。
3. Playwright 验证连接、订阅、节点、错误反馈、主题和移动布局。
4. GHCR 流水线构建真实镜像并使用干净绑定目录执行冒烟测试。
5. Release 流水线下载真实 Node、Xray 和 WinSW，构建并检查 Deb 与 Windows ZIP。
