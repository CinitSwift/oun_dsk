# Oun Desktop GitHub Actions 构建设计

## 1. 目标

将当前目录中的完整桌面应用源码迁移为独立仓库 `git@github.com:CinitSwift/oun_dsk.git`，由 GitHub Actions 分别构建 macOS DMG 和 Windows x64 NSIS EXE。

`oun_dsk` 是独立的桌面应用源码与构建仓库，不保留原 `oun` 仓库的 Git 历史，也不在构建时跨仓库拉取源码。

## 2. 仓库内容

新仓库保留：

- React/Vite 前端源码与静态资源。
- Electron 主进程、preload 和桌面图标。
- 内置 Express 代理代码。
- package.json、pnpm-lock.yaml 和构建配置。
- README 和必要项目文档。
- GitHub Actions workflow。

新仓库排除：

- 原仓库 `.git/` 历史与远程配置。
- 原有 `.github/workflows/`。
- `node_modules/`。
- `dist/`。
- `release/`。
- `tsconfig.tsbuildinfo`。
- `docs/superpowers/plans/`。
- 本地日志、IDE 文件和环境变量文件。

## 3. 仓库初始化

在当前 `web/oun` 目录删除旧 `.git/` 后执行新的 Git 初始化，默认分支使用 `main`，远程地址设置为 `git@github.com:CinitSwift/oun_dsk.git`。

新仓库创建单个初始提交，提交当前已验证的桌面应用源码和 Actions 配置。因为远程仓库为空，使用普通首次推送，不需要强制推送。

## 4. GitHub Actions

新增 `.github/workflows/build-desktop.yml`，包含两个相互独立的 job：

### 4.1 macOS job

- Runner：`macos-14`。
- Node.js：20。
- pnpm：10.15.1。
- 执行 `pnpm install --frozen-lockfile --engine-strict`。
- 执行 `pnpm desktop:build:mac`。
- 上传 `release/*.dmg` 为 Actions Artifact。
- 未配置签名和公证，产物为未签名测试构建。

### 4.2 Windows job

- Runner：`windows-latest`。
- Node.js：20。
- pnpm：10.15.1。
- 执行 `pnpm install --frozen-lockfile --engine-strict`。
- 执行 `pnpm desktop:build:win`。
- 上传 `release/*.exe` 为 Actions Artifact。
- 未配置 Windows 代码签名，安装时可能出现系统安全提示。

两个 job 分别在各自操作系统安装 Electron，因此 `build.electronDist` 指向的 `node_modules/electron/dist` 会自然对应当前平台，不跨平台复用二进制。

## 5. 触发与产物

workflow 支持：

- 推送到 `main`。
- 手动触发 `workflow_dispatch`。
- 推送 `v*` 版本 tag。

构建结果只保存为 GitHub Actions Artifacts，不自动创建 GitHub Release，不上传源码副本，不配置自动更新。

建议 Artifact 名称：

- `oun-macos-dmg`。
- `oun-windows-x64-nsis`。

Artifact 保留期限设置为 14 天；找不到目标安装包时 job 失败，而不是上传空产物。

## 6. 错误处理

- 依赖锁文件不一致时，`--frozen-lockfile` 使构建立即失败。
- Node engine 不兼容时，`--engine-strict` 使构建立即失败。
- macOS 或 Windows 任一平台失败不取消另一平台，便于分别诊断。
- 安装包没有生成时，artifact 上传步骤使用 `if-no-files-found: error`。
- 不通过 shell 脚本隐藏构建错误，pnpm 或 electron-builder 的非零退出码直接使 job 失败。

## 7. 验证标准

- 新仓库默认分支为 `main`，远程指向 `CinitSwift/oun_dsk`。
- 初始提交不包含旧 Git 历史、本地依赖或构建产物。
- workflow YAML 可解析，Actions 能识别两个构建 job。
- macOS job 生成并上传 DMG Artifact。
- Windows job 生成并上传 x64 NSIS EXE Artifact。
- 本地 macOS 构建继续使用桌面 Vite 模式，打包应用不再白屏。
- Windows 结果以 GitHub Actions 实际运行结果为准，不用 macOS 上的交叉构建替代 Windows 验证。

## 8. 范围排除

本次不包含：

- GitHub Release 自动发布。
- macOS 签名和公证。
- Windows 代码签名。
- 自动更新。
- Linux 安装包。
- 从私有 `oun` 仓库拉取或同步源码。
- 保存原 `oun` 仓库提交历史。
