# Android Capacitor 原生代理设计

## 目标

将现有 Oun React/Vite 应用打包为 Android APK，使用 Capacitor WebView 套壳，并在 APK 内通过 Android 原生网络层代理第三方视频源，不依赖远程代理服务器。

## 平台与交付

- 最低 Android 版本：Android 10，API 29。
- 使用 Capacitor Android 工程承载现有 `dist` 前端资源。
- GitHub Actions 新增 Android 构建任务。
- 首阶段上传 Debug APK，暂不配置发布签名和 Google Play 发布流程。
- Electron macOS/Windows 构建流程保持不变。

## 代理架构

- 不在 Android 中运行 Node.js/Express。
- 复用前端现有代理 URL 形态：`/proxy?url=<encoded target URL>`。
- Capacitor WebView 请求 `/proxy` 时，由自定义 Android WebView 请求拦截器识别并截取。
- 原生层使用 Android 网络 API 请求目标 URL，并将状态码、Content-Type、必要响应头和响应流返回给 WebView。
- 代理支持 JSON、文本、m3u8 以及视频分段等流式响应，不把大响应整体读入内存。
- 目标请求使用现有 User-Agent 和 Accept 约定，连接超时与读取超时为 15 秒。
- 遵循 HTTP 重定向，代理失败时返回明确的 HTTP 错误响应。
- 仅代理 URL 参数指定的 `http` 或 `https` 目标，不允许访问本地文件或任意非 HTTP 协议。

## 前端兼容

- Android 原生平台使用 `HashRouter`，浏览器继续使用 `BrowserRouter`，Electron 继续使用现有桌面判断。
- `getProxyUrl` 在 Android Capacitor origin 下继续生成当前页面 origin 的 `/proxy?url=` 地址，无需引入远程代理地址。
- 搜索、详情、初始视频源加载和 HLS/m3u8 请求均复用现有代理地址。
- 不改变视频源数据、搜索缓存和播放器广告过滤逻辑。

## Android 网络配置

- 声明 `android.permission.INTERNET`。
- 开启明文 HTTP 访问，以兼容现有 `http://` 视频源。
- 保持 HTTPS 证书校验，不关闭 TLS 证书验证。
- 代理响应按目标服务返回的 Content-Type 传回，避免 WebView 将 m3u8 当作普通文本处理。

## 构建流程

- 在现有前端 package scripts 中增加 Capacitor 同步和 Android 构建命令。
- 增加 Android 工程依赖与必要的原生代码。
- GitHub Actions 使用 Node.js 20、pnpm 10.15.1、Java 21 和 Android SDK。
- Android job 执行依赖安装、Web 构建、Capacitor 同步、Gradle Debug APK 构建，并上传 APK Artifact。
- 不让 Android job 影响既有 macOS/Windows job 的构建结果。

## 错误处理与限制

- 第三方视频源是否可用不在启动时探测。
- 目标服务 DNS、证书、超时或 HTTP 错误应通过原生代理返回给现有前端错误处理逻辑。
- 某些源可能要求特殊 Referer、Cookie 或防盗链策略；首阶段保持与现有桌面代理相同的请求头行为，不额外绕过站点限制。
- APK 首阶段为 Debug 包，不等同于可直接发布到应用商店的签名包。

## 验证

- Web TypeScript/Vite 构建通过。
- Desktop Web 构建通过，Electron 功能不回归。
- Android Gradle Debug APK 构建通过。
- 检查 APK 输出文件存在并能被 GitHub Actions 上传。
- 使用静态检查确认代理只允许 `http`/`https`，且 HTTP 明文配置、最低 API 和网络权限齐全。

## 非目标

- 不实现 Android 发布签名、应用商店元数据或自动发布。
- 不新增远程代理服务器。
- 不改造现有视频源协议或保证第三方源持续可用。
