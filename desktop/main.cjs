const { app, BrowserWindow, dialog, Menu, shell, Tray } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

let proxyServer = null
let pendingProxyServer = null
let proxyModule = null
let mainWindow = null
let tray = null
let isQuitting = false
let quitAllowed = false
let cleanupPromise = null
let proxyStartupPromise = null
let proxyRestartPromise = null
let proxyRestartAttempted = false
let proxyFailureHandled = false

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('activate', showMainWindow)
  app.on('window-all-closed', () => {})
  app.on('before-quit', handleBeforeQuit)
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(initializeApplication).catch((error) => {
    dialog.showErrorBox('启动失败', getErrorMessage(error))
    requestQuit()
  })
}

async function initializeApplication() {
  if (isQuitting) {
    return
  }

  const startedProxy = await startProxy()
  if (!startedProxy || isQuitting) {
    if (isQuitting) {
      requestQuit()
    }
    return
  }

  createTray()
  if (process.platform === 'win32') {
    Menu.setApplicationMenu(null)
  }
  createMainWindow()
}

function startProxy() {
  if (!proxyStartupPromise) {
    proxyStartupPromise = startProxyLoop()
  }

  return proxyStartupPromise
}

async function startProxyLoop() {
  while (!isQuitting) {
    try {
      proxyModule = proxyModule || (await import('../proxy-server.js'))
      const startedProxy = await proxyModule.startProxyServer({ host: '127.0.0.1', port: 0 })
      pendingProxyServer = startedProxy
      if (isQuitting) {
        return null
      }

      proxyServer = startedProxy
      pendingProxyServer = null
      attachProxyListeners(proxyServer)
      return proxyServer
    } catch (error) {
      if (isQuitting) {
        return null
      }

      const choice = await dialog.showMessageBox({
        type: 'error',
        title: '代理启动失败',
        message: '本地代理启动失败。',
        detail: getErrorMessage(error),
        buttons: ['重试', '退出'],
        defaultId: 0,
        cancelId: 1,
      })

      if (choice.response !== 0) {
        isQuitting = true
        return null
      }
    }
  }

  return null
}

function attachProxyListeners(instance) {
  if (!instance?.server) {
    return
  }

  if (!instance.server.listeners('error').includes(onProxyError)) {
    instance.server.on('error', onProxyError)
  }
  if (!instance.server.listeners('close').includes(onProxyClose)) {
    instance.server.on('close', onProxyClose)
  }
}

function detachProxyListeners(instance) {
  if (!instance?.server) {
    return
  }

  instance.server.off('error', onProxyError)
  instance.server.off('close', onProxyClose)
}

function onProxyError(error) {
  handleProxyFailure(error)
}

function onProxyClose() {
  if (!isQuitting && proxyServer?.server?.listening === false) {
    handleProxyFailure(new Error('本地代理已意外关闭'))
  }
}

function handleProxyFailure(error) {
  if (isQuitting || proxyFailureHandled) {
    return
  }

  proxyFailureHandled = true
  if (!proxyRestartAttempted) {
    proxyRestartAttempted = true
    proxyRestartPromise = restartProxy(error).finally(() => {
      proxyFailureHandled = false
      proxyRestartPromise = null
    })
    return
  }

  notifyProxyRestartRequired(error)
}

async function restartProxy(previousError) {
  const previousServer = proxyServer
  const previousPort = previousServer?.port

  detachProxyListeners(previousServer)
  try {
    await previousServer?.close()
  } catch (error) {
    notifyProxyRestartRequired(error)
    return
  }

  if (isQuitting) {
    return
  }

  try {
    const restartedServer = await proxyModule.startProxyServer({
      host: '127.0.0.1',
      port: previousPort || 0,
    })
    pendingProxyServer = restartedServer

    if (isQuitting) {
      detachProxyListeners(restartedServer)
      const closeError = await closeProxyInstance(restartedServer)
      if (!closeError) {
        pendingProxyServer = null
      } else {
        notifyProxyRestartRequired(closeError)
      }
      return
    }

    if (restartedServer.port !== previousPort || restartedServer.url !== previousServer?.url) {
      detachProxyListeners(restartedServer)
      const closeError = await closeProxyInstance(restartedServer)
      if (!closeError) {
        pendingProxyServer = null
      } else {
        notifyProxyRestartRequired(closeError)
        return
      }
      notifyProxyRestartRequired(
        new Error(`代理端口发生变化（原端口 ${previousPort}，新端口 ${restartedServer.port}）`),
      )
      return
    }

    proxyServer = restartedServer
    attachProxyListeners(restartedServer)
    pendingProxyServer = null
    mainWindow?.webContents.send('proxy-status', { status: 'ready' })
  } catch (error) {
    notifyProxyRestartRequired(error || previousError)
  }
}

function notifyProxyRestartRequired(error) {
  if (isQuitting) {
    return
  }

  mainWindow?.webContents.send('proxy-status', { status: 'error' })
  dialog.showErrorBox(
    '代理已停止',
    `本地代理无法自动恢复，请重启应用。\n\n${getErrorMessage(error)}`,
  )
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`--oun-proxy-url=${proxyServer.url}`],
    },
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.on('query-session-end', (event) => {
    if (!quitAllowed) {
      event.preventDefault()
      requestQuit()
    }
  })
  mainWindow.on('session-end', requestQuit)

  configureNavigation(mainWindow)
  void loadApplication(mainWindow).catch((error) => {
    if (isQuitting) {
      console.error('应用页面加载失败，应用正在退出。', error)
      return
    }

    dialog.showErrorBox('页面加载失败', `无法加载应用页面。\n\n${getErrorMessage(error)}`)
    void requestQuit()
  })
  return mainWindow
}

function configureNavigation(window) {
  const allowedOrigin = process.env.OUN_DEV_SERVER_URL
    ? new URL(process.env.OUN_DEV_SERVER_URL).origin
    : null
  const builtInUrl = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html'))

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalHttpUrl(url)
    return { action: 'deny' }
  })

  const handleNavigation = (event, url) => {
    if (isAllowedNavigation(url, allowedOrigin, builtInUrl)) {
      return
    }

    event.preventDefault()
    openExternalHttpUrl(url)
  }

  window.webContents.on('will-navigate', handleNavigation)
  window.webContents.on('will-redirect', handleNavigation)
}

function isAllowedNavigation(url, allowedOrigin, builtInUrl) {
  try {
    const parsedUrl = new URL(url)
    if (allowedOrigin) {
      return parsedUrl.origin === allowedOrigin
    }

    return (
      parsedUrl.protocol === 'file:' &&
      parsedUrl.host === builtInUrl.host &&
      parsedUrl.pathname === builtInUrl.pathname
    )
  } catch {
    return false
  }
}

function openExternalHttpUrl(url) {
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      void shell.openExternal(url).catch((error) => {
        console.error(`打开外部链接失败: ${url}`, error)
      })
    }
  } catch {
    // Ignore malformed or unsupported navigation targets.
  }
}

function loadApplication(window) {
  if (process.env.OUN_DEV_SERVER_URL) {
    return window.loadURL(process.env.OUN_DEV_SERVER_URL)
  }

  return window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

function createTray() {
  if (tray) {
    return tray
  }

  const iconPath = path.join(
    __dirname,
    'assets',
    process.platform === 'win32' ? 'icon.ico' : 'icon.png',
  )
  tray = new Tray(iconPath)
  tray.setToolTip('oun')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: showMainWindow },
      { type: 'separator' },
      { label: '退出应用', click: requestQuit },
    ]),
  )
  tray.on('click', showMainWindow)
  tray.on('double-click', showMainWindow)
  return tray
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (!isQuitting && proxyServer) {
      createMainWindow()
    }
    return
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
}

function handleBeforeQuit(event) {
  if (quitAllowed) {
    return
  }

  event.preventDefault()
  requestQuit()
}

function requestQuit() {
  if (!cleanupPromise) {
    isQuitting = true
    quitAllowed = false
    cleanupPromise = cleanupAndQuit()
      .then((didQuit) => {
        if (!didQuit) {
          isQuitting = false
          cleanupPromise = null
        }
        return didQuit
      })
      .catch((error) => {
        dialog.showErrorBox('退出失败', getErrorMessage(error))
        isQuitting = false
        cleanupPromise = null
        return false
      })
  }

  return cleanupPromise
}

async function cleanupAndQuit() {
  if (proxyStartupPromise || proxyServer || pendingProxyServer) {
    try {
      if (proxyStartupPromise) {
        await proxyStartupPromise
      }
    } catch {
      // Startup errors are reported by the ready handler.
    }
  }

  try {
    await proxyRestartPromise
  } catch {
    // Runtime restart errors are reported by the restart handler.
  }

  const proxyInstances = [...new Set([proxyServer, pendingProxyServer].filter(Boolean))]
  const closeErrors = []

  for (const instance of proxyInstances) {
    detachProxyListeners(instance)
    const closeError = await closeProxyInstance(instance)
    if (closeError) {
      closeErrors.push(closeError)
      continue
    }

    if (proxyServer === instance) {
      proxyServer = null
    }
    if (pendingProxyServer === instance) {
      pendingProxyServer = null
    }
  }

  if (closeErrors.length > 0) {
    for (const instance of [...new Set([proxyServer, pendingProxyServer].filter(Boolean))]) {
      if (instance.server?.listening) {
        attachProxyListeners(instance)
      }
    }

    dialog.showErrorBox(
      '退出失败',
      `关闭本地代理失败，请再次选择退出重试。\n\n${closeErrors
        .map(getErrorMessage)
        .join('\n')}`,
    )
    return false
  }

  tray?.destroy()
  tray = null
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy()
  }
  mainWindow = null
  quitAllowed = true
  app.quit()
  return true
}

async function closeProxyInstance(instance) {
  let lastError = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await instance.close()
      return null
    } catch (error) {
      if (error?.code === 'ERR_SERVER_NOT_RUNNING') {
        return null
      }
      lastError = error
    }
  }

  return lastError
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
