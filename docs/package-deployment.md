# 打包与交付方案

本文档说明如何把当前项目打包成“可直接交付客户机器”的离线部署包。发布包内已经包含应用构建产物、生产依赖、Node.js 运行时和 npm，客户机器无需再安装 Node、npm 或执行 `npm install`。

## 方案目标

交付包内包含：

- 前端构建产物
- 后端构建产物
- 生产依赖
- 官方 Node.js 运行时
- npm
- 启动脚本
- 客户侧部署说明

## 方案设计

当前采用“单服务托管前后端 + 便携 Node 运行时”的交付方式：

1. 前端通过 `vite build` 构建为静态资源。
2. 后端通过 `tsc` 构建为 Node.js 可运行产物。
3. 后端服务同时托管 `/api` 接口和前端静态页面。
4. 打包脚本自动下载目标平台的官方 Node.js 压缩包，压缩包中已自带 npm。
5. 打包脚本在发布目录内安装生产依赖。
6. 自动生成启动脚本、npm 包装脚本和交付说明。
7. 输出发布目录与压缩归档文件，便于直接发给客户。

## 一键打包

在项目根目录执行：

```bash
npm run package:release
```

默认打包当前机器平台。

### 指定目标平台

```bash
npm run package:release -- --target=darwin-arm64
npm run package:release -- --target=darwin-x64
npm run package:release -- --target=linux-x64
npm run package:release -- --target=win32-x64
```

### 可选参数

可通过环境变量指定打包时使用的 Node 版本：

```bash
BUNDLE_NODE_VERSION=24.10.0 npm run package:release -- --target=linux-x64
```

若未指定，则默认使用当前开发机正在运行的 Node 版本。

## 输出结果

打包结果位于：

```text
release/
```

例如：

```text
release/llm-intervene-darwin-arm64-node-v24.10.0/
release/llm-intervene-darwin-arm64-node-v24.10.0.tar.gz
```

Windows 目标平台会生成 `.zip` 压缩包。

## 交付包目录结构

```text
llm-intervene-<target>-node-v<version>/
  app/
    apps/
      server/dist/
      web/dist/
    node_modules/
    package.json
    package-lock.json
  runtime/
    node/
  start.sh
  start.bat
  npm.sh
  npm.bat
  README-DEPLOY.md
```

目录说明：

- `app/`：应用本体和生产依赖
- `runtime/node/`：随包附带的 Node.js 与 npm
- `start.sh` / `start.bat`：客户直接启动服务的入口
- `npm.sh` / `npm.bat`：客户如需检查内置 npm，可直接调用

## 客户部署步骤

### macOS / Linux

1. 解压交付包。
2. 进入解压目录。
3. 执行：

```bash
./start.sh
```

### Windows

1. 解压交付包。
2. 进入解压目录。
3. 双击 `start.bat`，或在命令行执行：

```bat
start.bat
```

默认访问地址：

```text
http://localhost:3001
```

## 内置运行时验证

客户可用以下命令验证随包携带的 Node 与 npm：

### macOS / Linux

```bash
./npm.sh -v
./runtime/node/bin/node -v
```

### Windows

```bat
npm.bat -v
runtime\node\node.exe -v
```

## 健康检查

服务启动后，可访问：

```text
http://localhost:3001/api/health
```

正常情况下会返回：

```json
{
  "ok": true,
  "service": "llm-intervene-server",
  "timestamp": "2026-03-19T15:14:36.942Z"
}
```

## 交付建议

建议按客户环境分别生成发布包：

- macOS Apple 芯片：`darwin-arm64`
- macOS Intel：`darwin-x64`
- Linux 64 位：`linux-x64`
- Windows 64 位：`win32-x64`

不要将不同操作系统的运行时混在一个包中。

## 注意事项

1. 每个目标操作系统和架构都应单独打包一次。
2. 若客户机器不能联网，直接交付 `release/` 下的压缩包即可，包内已包含运行时和生产依赖。
3. 若端口 `3001` 被占用，可在启动前设置 `PORT` 环境变量。
4. 当前方案适合内网部署、离线交付和标准客户环境安装。
5. 若客户需要开机自启或作为系统服务运行，可在交付包基础上再接入 `systemd`、Windows Service 或容器化部署。
