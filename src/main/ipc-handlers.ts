import { app, ipcMain, BrowserWindow, dialog, shell } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { IpcMainInvokeEvent } from 'electron'
import type { IpcChannel, IpcRequest, IpcResponse } from '../shared/ipc-types'
import { readConfig, writeConfig } from './config-store'
import { getPaperVersions, getLatestBuild } from './paper-api'
import { listServers, getServer, createServer, deleteServer } from './server-manager'
import { startServer, stopServer, restartServer, getServerStatus } from './process-manager'
import { rconConnect, rconDisconnect, rconSend, rconIsConnected } from './rcon-manager'
import { addDevPlugin, removeDevPlugin, updateDevPluginAction, listPlugins, listDevPlugins, togglePlugin } from './plugin-manager'

export function handle<C extends IpcChannel>(
  channel: C,
  handler: (event: IpcMainInvokeEvent, request: IpcRequest<C>) => IpcResponse<C> | Promise<IpcResponse<C>>
): void {
  ipcMain.handle(channel, (event, request) => handler(event, request as IpcRequest<C>))
}

export function registerIpcHandlers(): void {

  // Shell
  handle('shell:open-path', (_e, { path }) => { shell.openPath(path) })

  // App
  handle('app:get-version',  () => app.getVersion())
  handle('app:get-system-info', () => ({
    platform: process.platform, arch: process.arch,
    nodeVersion: process.versions.node, electronVersion: process.versions.electron
  }))
  handle('greeting:say-hello', (_e, { name }) => ({
    message: `Hello, ${name}! Greetings from the main process.`, timestamp: Date.now()
  }))

  // Window controls
  handle('window:minimize',        (e) => { BrowserWindow.fromWebContents(e.sender)?.minimize() })
  handle('window:maximize-toggle', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return { isMaximized: false }
    win.isMaximized() ? win.unmaximize() : win.maximize()
    return { isMaximized: win.isMaximized() }
  })
  handle('window:close',        (e) => { BrowserWindow.fromWebContents(e.sender)?.close() })
  handle('window:is-maximized', (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false)

  // Config
  handle('config:get', () => readConfig())
  handle('config:set', (_e, patch) => writeConfig(patch))
  handle('config:pick-folder', async (e) => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender)!, {
      title: 'Select servers folder', properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // Paper API
  handle('paper:get-versions',     () => getPaperVersions())
  handle('paper:get-latest-build', (_e, { version }) => getLatestBuild(version))

  // Server management
  handle('server:next-port', () => {
    const { serversFolder } = readConfig()
    const usedPorts = new Set(serversFolder ? listServers(serversFolder).map((s) => s.port) : [])
    let port = 25565
    while (usedPorts.has(port)) port++
    return port
  })

  handle('server:read-log', (_e, { name }) => {
    const { serversFolder } = readConfig()
    if (!serversFolder) return null
    const server = getServer(serversFolder, name)
    if (!server) return null
    try {
      return readFileSync(join(server.path, 'logs', 'latest.log'), 'utf-8')
    } catch {
      return null
    }
  })

  handle('server:list', () => {
    const { serversFolder } = readConfig()
    return serversFolder ? listServers(serversFolder) : []
  })
  handle('server:get', (_e, { name }) => {
    const { serversFolder } = readConfig()
    return serversFolder ? getServer(serversFolder, name) : null
  })
  handle('server:create', async (e, req) => {
    const { serversFolder } = readConfig()
    if (!serversFolder) throw new Error('No servers folder configured.')
    return createServer(serversFolder, req, BrowserWindow.fromWebContents(e.sender) ?? null)
  })
  handle('server:start', (e, { name }) => {
    const { serversFolder } = readConfig()
    if (!serversFolder) throw new Error('No servers folder configured.')
    const info = getServer(serversFolder, name)
    if (!info) throw new Error(`Server "${name}" not found.`)
    startServer(name, info, BrowserWindow.fromWebContents(e.sender) ?? null)
  })
  handle('server:stop', (_e, { name }) => { stopServer(name) })
  handle('server:restart', (_e, { name }) => {
    const { serversFolder } = readConfig()
    if (!serversFolder) throw new Error('No servers folder configured.')
    const info = getServer(serversFolder, name)
    if (!info) throw new Error(`Server "${name}" not found.`)
    restartServer(name, info)
  })
  handle('server:status', (_e, { name }) => getServerStatus(name))
  handle('server:delete', (_e, { name }) => {
    const { serversFolder } = readConfig()
    if (!serversFolder) throw new Error('No servers folder configured.')
    if (getServerStatus(name) !== 'stopped') throw new Error('Stop the server before deleting it.')
    deleteServer(serversFolder, name)
  })

  // RCON
  handle('rcon:connect',      async (e, { serverName }) => {
    await rconConnect(serverName, BrowserWindow.fromWebContents(e.sender) ?? null)
  })
  handle('rcon:disconnect',   async (_e, { serverName }) => { await rconDisconnect(serverName) })
  handle('rcon:send',         async (_e, { serverName, command }) => rconSend(serverName, command))
  handle('rcon:is-connected', (_e, { serverName }) => rconIsConnected(serverName))

  // Plugins
  handle('plugin:pick-jar', async (e) => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender)!, {
      title: 'Select plugin JAR',
      filters: [{ name: 'JAR files', extensions: ['jar'] }],
      properties: ['openFile']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  handle('plugin:list', (_e, { serverName }) => {
    const { serversFolder } = readConfig()
    if (!serversFolder) return []
    const info = getServer(serversFolder, serverName)
    if (!info) return []
    return listPlugins(info.path)
  })

  handle('plugin:toggle', (e, { serverName, pluginName, enable }) => {
    const { serversFolder } = readConfig()
    if (!serversFolder) throw new Error('No servers folder configured.')
    const info = getServer(serversFolder, serverName)
    if (!info) throw new Error(`Server "${serverName}" not found.`)
    togglePlugin(serverName, info.path, pluginName, enable, BrowserWindow.fromWebContents(e.sender) ?? null)
  })

  handle('plugin:list-dev', (_e, { serverName }) => {
    const { serversFolder } = readConfig()
    if (!serversFolder) return []
    const info = getServer(serversFolder, serverName)
    if (!info) return []
    return listDevPlugins(info.path)
  })

  handle('plugin:add-dev', (e, { serverName, sourcePath, action }) => {
    const { serversFolder } = readConfig()
    if (!serversFolder) throw new Error('No servers folder configured.')
    const info = getServer(serversFolder, serverName)
    if (!info) throw new Error(`Server "${serverName}" not found.`)
    return addDevPlugin(serverName, info.path, sourcePath, action, BrowserWindow.fromWebContents(e.sender) ?? null)
  })

  handle('plugin:remove-dev', (_e, { serverName, pluginName }) => {
    const { serversFolder } = readConfig()
    if (!serversFolder) throw new Error('No servers folder configured.')
    const info = getServer(serversFolder, serverName)
    if (!info) throw new Error(`Server "${serverName}" not found.`)
    removeDevPlugin(serverName, info.path, pluginName)
  })

  handle('plugin:update-action', (_e, { serverName, pluginName, action }) => {
    const { serversFolder } = readConfig()
    if (!serversFolder) throw new Error('No servers folder configured.')
    const info = getServer(serversFolder, serverName)
    if (!info) throw new Error(`Server "${serverName}" not found.`)
    updateDevPluginAction(info.path, pluginName, action)
  })
}
