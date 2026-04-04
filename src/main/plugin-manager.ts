import fs from 'fs'
import path from 'path'
import type { BrowserWindow } from 'electron'
import type { DevPlugin, PluginEntry, ServerInfo } from '../shared/ipc-types'

const META_FILE = 'msm.json'

// Map: serverName → Map: pluginName → FSWatcher
const watchers = new Map<string, Map<string, fs.FSWatcher>>()
const timers   = new Map<string, ReturnType<typeof setTimeout>>()

function readMeta(serverPath: string): ServerInfo {
  return JSON.parse(fs.readFileSync(path.join(serverPath, META_FILE), 'utf-8')) as ServerInfo
}

function writeMeta(serverPath: string, info: ServerInfo): void {
  fs.writeFileSync(path.join(serverPath, META_FILE), JSON.stringify(info, null, 2))
}

export function listPlugins(serverPath: string): PluginEntry[] {
  const dir = path.join(serverPath, 'plugins')
  if (!fs.existsSync(dir)) return []
  const entries: PluginEntry[] = []
  const seen = new Set<string>()
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith('.jar.disabled')) {
      const name = file.slice(0, -'.disabled'.length)
      if (!seen.has(name)) { seen.add(name); entries.push({ name, disabled: true }) }
    } else if (file.endsWith('.jar')) {
      if (!seen.has(file)) { seen.add(file); entries.push({ name: file, disabled: false }) }
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

export function togglePlugin(
  serverName: string,
  serverPath: string,
  pluginName: string,
  enable: boolean,
  win: BrowserWindow | null
): void {
  const pluginsDir   = path.join(serverPath, 'plugins')
  const enabledPath  = path.join(pluginsDir, pluginName)
  const disabledPath = path.join(pluginsDir, pluginName + '.disabled')
  if (enable) {
    if (fs.existsSync(disabledPath)) fs.renameSync(disabledPath, enabledPath)
  } else {
    if (fs.existsSync(enabledPath)) fs.renameSync(enabledPath, disabledPath)
  }
  // Pause / resume watcher if this is a dev plugin
  const devPlugin = listDevPlugins(serverPath).find(p => p.pluginName === pluginName)
  if (devPlugin) {
    if (enable) startWatcher(serverName, serverPath, devPlugin, win)
    else stopWatcher(serverName, pluginName)
  }
}

export function listDevPlugins(serverPath: string): DevPlugin[] {
  const info = readMeta(serverPath)
  return info.devPlugins ?? []
}

export function addDevPlugin(
  serverName: string,
  serverPath: string,
  sourcePath: string,
  action: 'reload' | 'restart',
  win: BrowserWindow | null
): DevPlugin {
  const pluginsDir = path.join(serverPath, 'plugins')
  if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true })

  const pluginName = path.basename(sourcePath)
  const destPath = path.join(pluginsDir, pluginName)

  // Remove existing file/symlink if present
  try {
    const stat = fs.lstatSync(destPath)
    if (stat) fs.unlinkSync(destPath)
  } catch { /* doesn't exist yet */ }

  // Try symlink (requires Developer Mode or admin on Windows), fall back to copy
  try {
    fs.symlinkSync(sourcePath, destPath, 'file')
  } catch {
    fs.copyFileSync(sourcePath, destPath)
  }

  const devPlugin: DevPlugin = { pluginName, sourcePath, action }

  // Persist to msm.json
  const info = readMeta(serverPath)
  const devPlugins = (info.devPlugins ?? []).filter(p => p.pluginName !== pluginName)
  devPlugins.push(devPlugin)
  writeMeta(serverPath, { ...info, devPlugins })

  startWatcher(serverName, serverPath, devPlugin, win)
  return devPlugin
}

export function removeDevPlugin(
  serverName: string,
  serverPath: string,
  pluginName: string
): void {
  stopWatcher(serverName, pluginName)

  // Remove symlink in both enabled and disabled form
  for (const suffix of ['', '.disabled']) {
    try { fs.unlinkSync(path.join(serverPath, 'plugins', pluginName + suffix)) } catch { /* ignore */ }
  }

  const info = readMeta(serverPath)
  writeMeta(serverPath, {
    ...info,
    devPlugins: (info.devPlugins ?? []).filter(p => p.pluginName !== pluginName)
  })
}

export function updateDevPluginAction(
  serverPath: string,
  pluginName: string,
  action: 'reload' | 'restart'
): void {
  const info = readMeta(serverPath)
  const devPlugins = (info.devPlugins ?? []).map(p =>
    p.pluginName === pluginName ? { ...p, action } : p
  )
  writeMeta(serverPath, { ...info, devPlugins })
}

export function restoreWatchers(
  serverName: string,
  serverPath: string,
  win: BrowserWindow | null
): void {
  const devPlugins = listDevPlugins(serverPath)
  for (const plugin of devPlugins) {
    // Only watch if the symlink is currently enabled (not renamed to .disabled)
    const enabledPath = path.join(serverPath, 'plugins', plugin.pluginName)
    if (fs.existsSync(enabledPath)) startWatcher(serverName, serverPath, plugin, win)
  }
}

export function stopAllWatchers(serverName: string): void {
  const map = watchers.get(serverName)
  if (!map) return
  for (const w of map.values()) { try { w.close() } catch { /* ignore */ } }
  watchers.delete(serverName)
}

function startWatcher(
  serverName: string,
  serverPath: string,
  devPlugin: DevPlugin,
  win: BrowserWindow | null
): void {
  const { pluginName, sourcePath, action } = devPlugin
  const dir      = path.dirname(sourcePath)
  const filename = path.basename(sourcePath)

  try {
    const watcher = fs.watch(dir, (_eventType, changedFile) => {
      if (changedFile !== filename) return
      const key = `${serverName}:${pluginName}`
      const existing = timers.get(key)
      if (existing) clearTimeout(existing)
      timers.set(key, setTimeout(() => {
        timers.delete(key)
        // In copy-mode (no symlink), sync the updated JAR before notifying
        const destPath = path.join(serverPath, 'plugins', pluginName)
        try {
          const stat = fs.lstatSync(destPath)
          if (stat && !stat.isSymbolicLink()) fs.copyFileSync(sourcePath, destPath)
        } catch { /* dest removed — skip copy */ }
        win?.webContents.send('plugin:changed', { serverName, pluginName, action })
      }, 600))
    })

    if (!watchers.has(serverName)) watchers.set(serverName, new Map())
    // Close previous watcher for same plugin if any
    const prev = watchers.get(serverName)!.get(pluginName)
    if (prev) { try { prev.close() } catch { /* ignore */ } }
    watchers.get(serverName)!.set(pluginName, watcher)
  } catch {
    // Source path may not exist yet — watcher will be absent until re-added
  }
}

function stopWatcher(serverName: string, pluginName: string): void {
  const w = watchers.get(serverName)?.get(pluginName)
  if (w) { try { w.close() } catch { /* ignore */ } }
  watchers.get(serverName)?.delete(pluginName)
}
