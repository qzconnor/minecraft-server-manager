import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIpcHandlers } from './ipc-handlers'
import { getRunningServers, stopAllServers } from './process-manager'
import { restoreWatchers } from './plugin-manager'
import { listServers } from './server-manager'
import { readConfig } from './config-store'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 780,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Keep titlebar maximize icon in sync when window state changes externally
  mainWindow.on('maximize',   () => mainWindow.webContents.send('window:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false))

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  let shuttingDown = false

  mainWindow.on('close', (e) => {
    if (shuttingDown) return // already handled — let it close

    const running = getRunningServers()
    if (running.length === 0) return // nothing to stop, close immediately

    e.preventDefault()
    shuttingDown = true

    // Tell the renderer to show the shutdown overlay
    mainWindow.webContents.send('app:shutting-down', { servers: running })

    stopAllServers().then(() => {
      app.quit()
    })
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()

  createWindow()

  // Restore dev plugin file watchers for all existing servers
  const mainWindow = BrowserWindow.getAllWindows()[0] ?? null
  const { serversFolder } = readConfig()
  if (serversFolder) {
    const servers = listServers(serversFolder)
    for (const server of servers) {
      if (server.devPlugins?.length) {
        restoreWatchers(server.name, server.path, mainWindow)
      }
    }
  }

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
